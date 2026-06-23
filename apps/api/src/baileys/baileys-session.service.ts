import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  WASocket,
  BaileysEventMap,
  fetchLatestWaWebVersion,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { INCOMING_MESSAGES_QUEUE, type IncomingMessageJob } from '../queue/queue.constants';
import P from 'pino';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SocksProxyAgent } = require('socks-proxy-agent');

const SESSION_DIR = process.env.BAILEYS_SESSION_DIR ?? '/tmp/baileys-sessions';
// Route Baileys through WARP SOCKS5 proxy to bypass datacenter IP blocks
// socks5h = proxy resolves DNS (hostname sent to proxy, not IP) — required for TLS cert validation
const WARP_PROXY = process.env.WARP_PROXY_URL ?? 'socks5h://127.0.0.1:40000';

interface SessionEntry {
  socket: WASocket;
  qrCode: string | null;
  pairingCode: string | null;
  pairingPhone: string | null; // if set, use pairing code instead of QR on next qr event
  status: 'PENDING_QR' | 'PENDING_PAIRING' | 'CONNECTED' | 'DISCONNECTED';
  accountId: string;
  /** LID → phone JID map — populated by contacts.upsert events */
  lidMap: Map<string, string>;
  /**
   * JID resolution cache: phone digits → resolved WA JID.
   * Populated by resolveOutboundJid() via socket.onWhatsApp().
   * WhatsApp migrated users to @lid identifiers — sending to the wrong
   * JID type creates a broken Signal session that retry receipts cannot fix.
   * Caching avoids repeated onWhatsApp() lookups for the same number.
   */
  jidCache: Map<string, string>;
  /**
   * Message store used by getMessage() to answer retry receipts.
   * When a contact can't decrypt an outbound message (new Signal session),
   * WhatsApp sends a retry receipt — Baileys calls getMessage() so it can
   * re-encrypt and re-send the original content with fresh keys.
   * Without this, every first-ever message to a contact shows
   * "Waiting for this message. This may take a while."
   * Bounded to the last 3 000 messages to prevent unbounded memory growth.
   */
  msgStore: Map<string, proto.IMessage>;
  // CTWA FIX (zombie watchdog): epoch-ms of the last inbound event of ANY kind (incl
  // status@broadcast). The watchdog uses this to detect a socket that reports CONNECTED
  // but has silently stopped receiving after a 428→reconnect. Updated in messages.upsert.
  lastInboundAt: number;
}

@Injectable()
export class BaileysSessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BaileysSessionService.name);
  private readonly sessions = new Map<string, SessionEntry>();
  /**
   * Persistent message store that survives socket disconnects and restarts.
   * Keyed by accountId → (messageId → proto.IMessage).
   * This is separate from the SessionEntry.msgStore so that when a
   * 'restartRequired' or transient disconnect wipes the SessionEntry, the
   * stored messages are still available for retry-receipt re-encryption.
   * Without this, every disconnect clears the store and any in-flight
   * campaign message that needs a retry receipt is permanently stuck as
   * "Waiting for this message. This may take a while."
   * Cleared only on explicit logout / re-pair (requiresReauth).
   */
  private readonly persistentMsgStores = new Map<string, Map<string, proto.IMessage>>();
  /**
   * Tracks consecutive transient disconnects per account for exponential backoff.
   * Reset to 0 after a successful connection is held for > 60 s.
   */
  private readonly reconnectAttempts = new Map<string, number>();
  // CTWA FIX (zombie watchdog): handle for the periodic stale-session check (see startZombieWatchdog).
  private zombieWatchdog: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(INCOMING_MESSAGES_QUEUE) private readonly incomingQueue: Queue,
  ) {}

  async onModuleInit() {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    // Restore all active BAILEYS accounts on startup
    const accounts = await this.prisma.whatsAppAccount.findMany({
      where: { providerType: 'BAILEYS', isArchived: false },
    });
    for (const acc of accounts) {
      const sessionDir = path.join(SESSION_DIR, acc.id);
      if (fs.existsSync(sessionDir)) {
        this.logger.log(`Restoring Baileys session for account ${acc.id}`);
        await this.startSession(acc.id).catch((e) =>
          this.logger.error(`Failed to restore session ${acc.id}: ${e.message}`),
        );
      }
    }
    // CTWA FIX (zombie watchdog): begin periodic stale-session detection.
    this.startZombieWatchdog();
  }

  onModuleDestroy() {
    // CTWA FIX (zombie watchdog): stop the periodic check on shutdown.
    if (this.zombieWatchdog) clearInterval(this.zombieWatchdog);
    for (const [, entry] of this.sessions) {
      try {
        entry.socket.end(undefined);
      } catch {
        // ignore
      }
    }
    this.sessions.clear();
  }

  // CTWA FIX (zombie watchdog): detect and recover "zombie" sessions.
  // After certain 428→reconnect cycles, Baileys marks a socket CONNECTED but never re-subscribes
  // to message delivery — it silently stops receiving (no inbound, not even status@broadcast) and,
  // because it looks connected, NO auto-reconnect ever fires. This check force-closes such a socket;
  // the EXISTING 'connection.update' close handler then reconnects it via the normal backoff path.
  // Purely additive — it does not modify any existing socket/auth/reconnect logic, it only nudges a
  // confirmed-dead socket so the existing machinery heals it. Thresholds are conservative to avoid
  // restarting genuinely-idle-but-healthy sessions.
  private startZombieWatchdog() {
    const CHECK_EVERY_MS = 5 * 60 * 1000; // run the check every 5 minutes
    const STALE_MS = 45 * 60 * 1000; // flag a CONNECTED session with zero inbound for 45+ minutes
    this.zombieWatchdog = setInterval(() => {
      const now = Date.now();
      // Collect first, act after — never mutate this.sessions while iterating it.
      const stale: string[] = [];
      for (const [accountId, entry] of this.sessions) {
        if (entry.status === 'CONNECTED' && now - entry.lastInboundAt > STALE_MS) {
          stale.push(accountId);
        }
      }
      for (const accountId of stale) {
        const entry = this.sessions.get(accountId);
        if (!entry) continue;
        const mins = Math.round((now - entry.lastInboundAt) / 60000);
        this.logger.warn(
          `[ZombieWatchdog] Account ${accountId} reports CONNECTED but received no inbound for ${mins}m — forcing reconnect`,
        );
        try {
          // Closing the socket triggers the existing close handler → standard reconnect (creds
          // remain on disk, so requiresReauth=false, shouldReconnect=true). No new reconnect code.
          entry.socket.end(new Error('zombie-watchdog: no inbound traffic — forcing reconnect'));
        } catch (e) {
          this.logger.warn(
            `[ZombieWatchdog] socket.end failed for ${accountId}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }, CHECK_EVERY_MS);
  }

  async startSession(accountId: string, pairingPhone?: string): Promise<void> {
    const existing = this.sessions.get(accountId);
    if (existing) {
      // If session exists and we want to set a pairing phone, update it
      if (pairingPhone) existing.pairingPhone = pairingPhone.replace(/\D/g, '');
      this.logger.log(`Session ${accountId} already active`);
      return;
    }

    const sessionDir = path.join(SESSION_DIR, accountId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const logger = P({ level: 'warn' });

    // Fetch latest WhatsApp Web version — outdated versions get 405-rejected.
    // Fall back to a known-stable version rather than undefined so reconnects
    // after a failed fetch still work correctly.
    const STABLE_WA_VERSION: [number, number, number] = [2, 3000, 1040077880];
    let version: [number, number, number] = STABLE_WA_VERSION;
    try {
      const result = await fetchLatestWaWebVersion({});
      version = result.version as [number, number, number];
      this.logger.log(`Using WA Web version ${version?.join('.')}`);
    } catch {
      this.logger.warn(`Could not fetch latest WA version, falling back to ${STABLE_WA_VERSION.join('.')}`);
    }

    const agent = new SocksProxyAgent(WARP_PROXY);
    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      // Windows Chrome fingerprint — less suspicious to WhatsApp than Linux/appropriate()
      browser: Browsers.windows('Chrome'),
      version,
      printQRInTerminal: false,
      syncFullHistory: false,
      agent,
      // Do not mark session as "online" — prevents WhatsApp security scrutiny
      // that comes from a server appearing permanently active like a real phone
      markOnlineOnConnect: false,
      // Send WebSocket pings every 25s to prevent idle-timeout disconnections
      keepAliveIntervalMs: 25_000,
      // Increase connect timeout to handle slow proxy handshakes
      connectTimeoutMs: 60_000,
      // Slow down message retries — reduces burst traffic that triggers rate limits
      retryRequestDelayMs: 500,
      // Required for retry-receipt handling: when a contact can't decrypt a
      // message (first-ever outbound Signal session), WhatsApp sends a retry
      // receipt.  Baileys calls getMessage() to get the original content so it
      // can re-encrypt with fresh keys.  Without this every first-ever outbound
      // message shows "Waiting for this message. This may take a while."
      getMessage: async (key): Promise<proto.IMessage | undefined> => {
        // Use persistentMsgStores directly so retry receipts still work during
        // the brief window between sessions.delete() and the new session being set.
        return this.persistentMsgStores.get(accountId)?.get(key.id ?? '') ?? undefined;
      },
    });

    // Reuse the persistent store if it already exists (survives restartRequired disconnects).
    // Only a full re-pair (requiresReauth) clears this — see the 'close' handler.
    if (!this.persistentMsgStores.has(accountId)) {
      this.persistentMsgStores.set(accountId, new Map());
    }
    const msgStore = this.persistentMsgStores.get(accountId)!;

    const entry: SessionEntry = {
      socket,
      qrCode: null,
      pairingCode: null,
      pairingPhone: pairingPhone ? pairingPhone.replace(/\D/g, '') : null,
      status: pairingPhone ? 'PENDING_PAIRING' : 'PENDING_QR',
      accountId,
      lidMap: new Map(),
      msgStore,
      jidCache: new Map(),
      // CTWA FIX (zombie watchdog): seed liveness clock so a freshly-(re)connected session is not
      // immediately flagged as stale before its first inbound arrives.
      lastInboundAt: Date.now(),
    };
    this.sessions.set(accountId, entry);

    // Upsert session record
    await this.prisma.whatsAppSession.upsert({
      where: { whatsappAccountId: accountId },
      create: { whatsappAccountId: accountId, status: 'PENDING_QR' },
      update: { status: 'PENDING_QR', qrCode: null, errorMessage: null },
    });

    socket.ev.on('creds.update', saveCreds);

    // Build LID → @s.whatsapp.net map so we can resolve @lid JIDs when sending replies
    socket.ev.on('contacts.upsert', (contacts) => {
      for (const c of contacts) {
        if (c.id?.endsWith('@lid') && c.notify) {
          // Some versions expose the linked phone JID via lid field or name-based lookup
          // Store as-is and also check for a phone field
          const phone = (c as Record<string, unknown>).phone as string | undefined;
          if (phone) {
            const phoneJid = phone.replace(/\D/g, '') + '@s.whatsapp.net';
            entry.lidMap.set(c.id, phoneJid);
          }
        }
        // Build reverse map: if we have a contact with both a lid and a phone JID
        if (c.id?.endsWith('@s.whatsapp.net')) {
          const lid = (c as Record<string, unknown>).lid as string | undefined;
          if (lid) {
            entry.lidMap.set(lid, c.id);
          }
        }
      }
    });

    socket.ev.on('connection.update', async (update: BaileysEventMap['connection.update']) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (entry.pairingPhone) {
          // Pairing code mode: only request once — subsequent QR rotations must not overwrite
          if (!entry.pairingCode) {
            this.logger.log(`QR ready — requesting pairing code for ${accountId} (${entry.pairingPhone})`);
            try {
              const code = await socket.requestPairingCode(entry.pairingPhone);
              entry.pairingCode = code;
              entry.status = 'PENDING_PAIRING';
              this.logger.log(`Pairing code for ${accountId}: ${code}`);
              await this.prisma.whatsAppSession.updateMany({
                where: { whatsappAccountId: accountId },
                data: { status: 'PENDING_QR', errorMessage: null },
              });
            } catch (err) {
              this.logger.error(`Pairing code request failed for ${accountId}: ${err}`);
            }
          } else {
            this.logger.log(`QR rotated for ${accountId} — keeping existing pairing code ${entry.pairingCode}`);
          }
        } else {
          entry.qrCode = qr;
          entry.status = 'PENDING_QR';
          this.logger.log(`QR code generated for account ${accountId}`);
          await this.prisma.whatsAppSession.updateMany({
            where: { whatsappAccountId: accountId },
            data: { qrCode: qr, status: 'PENDING_QR' },
          });
        }
      }

      if (connection === 'open') {
        entry.status = 'CONNECTED';
        entry.qrCode = null;
        entry.pairingCode = null;
        const phone = socket.user?.id?.split(':')[0] ?? null;
        this.logger.log(`Account ${accountId} connected. Phone: ${phone}`);
        // Reset backoff counter after a successful open — delay the reset by 60 s
        // so a rapid disconnect-reconnect-disconnect loop still sees the backoff.
        setTimeout(() => this.reconnectAttempts.set(accountId, 0), 60_000);

        await this.prisma.whatsAppSession.updateMany({
          where: { whatsappAccountId: accountId },
          data: { status: 'CONNECTED', qrCode: null, lastConnectedAt: new Date() },
        });
        if (phone) {
          await this.prisma.whatsAppAccount.updateMany({
            where: { id: accountId },
            data: { phone },
          });
        }
        await this.prisma.whatsAppAccount.updateMany({
          where: { id: accountId },
          data: { sessionStatus: 'CONNECTED' },
        });
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reasonName = Object.entries(DisconnectReason).find(([, v]) => v === reason)?.[0] ?? 'unknown';

        // Codes that mean session credentials are permanently invalid — must re-pair
        const requiresReauth =
          reason === DisconnectReason.loggedOut ||    // 401 — explicit logout
          reason === DisconnectReason.badSession ||   // 500 — corrupted/invalid session data
          reason === DisconnectReason.forbidden ||    // 403 — account banned by WA
          reason === DisconnectReason.connectionReplaced; // 440 — another device took over

        // restartRequired (515) means just restart the socket, no need to wipe creds
        const isRestartRequired = reason === DisconnectReason.restartRequired;

        const hasSessionData = fs.existsSync(path.join(sessionDir, 'creds.json'));
        // Reconnect if creds exist and it's a normal transient disconnect
        const shouldReconnect = !requiresReauth && hasSessionData;

        this.logger.warn(`Account ${accountId} disconnected — reason: ${reasonName} (${reason ?? 'no code'})`);

        entry.status = 'DISCONNECTED';
        await this.prisma.whatsAppSession.updateMany({
          where: { whatsappAccountId: accountId },
          data: {
            status: 'DISCONNECTED',
            disconnectedAt: new Date(),
            errorMessage: String(lastDisconnect?.error ?? ''),
          },
        });
        await this.prisma.whatsAppAccount.updateMany({
          where: { id: accountId },
          data: { sessionStatus: 'DISCONNECTED' },
        });

        this.sessions.delete(accountId);

        if (requiresReauth) {
          this.logger.warn(
            `Account ${accountId} requires re-authentication (${reasonName}) — deleting session files`,
          );
          fs.rmSync(sessionDir, { recursive: true, force: true });
          // Clear the persistent message store on full re-pair — the new session
          // will have a different identity key so old stored messages are useless.
          this.persistentMsgStores.delete(accountId);
          // Restart so the QR / pairing code is shown immediately
          this.logger.log(`Restarting account ${accountId} for re-pairing…`);
          setTimeout(() => void this.startSession(accountId), 2000);
        } else if (shouldReconnect || isRestartRequired) {
          if (isRestartRequired) {
            // restartRequired (515): WhatsApp asks for a clean socket restart — do it fast
            this.logger.log(`Reconnecting account ${accountId} in 1s (restartRequired)…`);
            setTimeout(() => void this.startSession(accountId), 1000);
          } else {
            // Transient disconnect (connectionClosed, connectionLost, etc.)
            // Use exponential backoff: 5s, 10s, 20s, 40s, capped at 60s.
            // Prevents rapid reconnect loops that trigger WhatsApp rate-limiting.
            const attempts = (this.reconnectAttempts.get(accountId) ?? 0) + 1;
            this.reconnectAttempts.set(accountId, attempts);
            const delay = Math.min(5000 * Math.pow(2, attempts - 1), 60_000);
            this.logger.log(`Reconnecting account ${accountId} in ${delay / 1000}s (attempt ${attempts})…`);
            setTimeout(() => void this.startSession(accountId), delay);
          }
        } else {
          this.logger.log(`Account ${accountId} closed before pairing — not reconnecting`);
        }
      }
    });

    // Handle inbound messages — enqueue for full automation pipeline
    socket.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      // AGENT FIX (diagnostic): log fromMe messages so we can confirm they arrive here
      for (const msg of msgs) {
        if (msg.key.fromMe) {
          const fromMeText = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
          this.logger.log(`[AgentTakeover-DEBUG] fromMe [${type}] remoteJid=${msg.key.remoteJid} text="${fromMeText}"`);
        }
      }
      // CTWA FIX (zombie watchdog): any inbound event (incl status@broadcast) proves the socket is
      // genuinely live and receiving — refresh the liveness clock before any other processing.
      entry.lastInboundAt = Date.now();
      // Cache all messages (sent + received) so getMessage() can answer retry receipts.
      for (const msg of msgs) {
        if (msg.key.id && msg.message) {
          entry.msgStore.set(msg.key.id, msg.message);
          // Keep the store bounded — drop oldest entry once we exceed 3 000 messages.
          if (entry.msgStore.size > 3000) {
            const oldest = entry.msgStore.keys().next().value;
            if (oldest) entry.msgStore.delete(oldest);
          }
        }
      }

      // 'notify' = new real-time messages (standard case)
      // 'append' = messages added to cache — includes click-to-WhatsApp ad first messages
      //            which WhatsApp delivers as pre-created (already-seen) messages
      if (type !== 'notify' && type !== 'append') return;
      const nowMs = Date.now();
      for (const msg of msgs) {
        // AGENT FIX: check if this outbound message (sent by the agent on WA Business) matches
        // an agent takeover keyword before skipping. If it does, enqueue it with isFromMe=true
        // so the inbound processor can flip aiPaused. All other fromMe messages are still skipped.
        if (msg.key.fromMe) {
          const fromMeText = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ''
          ).trim().toLowerCase();
          if (fromMeText) {
            // Lazy-load agent keywords from DB to avoid a DB call on every outbound message.
            const agentSettings = await this.prisma.whatsAppAccountAiSettings.findUnique({
              where: { whatsappAccountId: accountId },
              select: { agentOffKeyword: true, agentOnKeyword: true },
            });
            const offKw = agentSettings?.agentOffKeyword?.trim().toLowerCase() ?? '';
            const onKw  = agentSettings?.agentOnKeyword?.trim().toLowerCase()  ?? '';
            if ((offKw && fromMeText === offKw) || (onKw && fromMeText === onKw)) {
              const remoteJid = msg.key.remoteJid ?? '';
              const from = remoteJid.includes('@s.whatsapp.net')
                ? remoteJid.replace('@s.whatsapp.net', '')
                : remoteJid;
              await this.incomingQueue.add('incoming', {
                whatsappAccountId: accountId,
                from,
                remoteJid,
                text: fromMeText,
                isFromMe: true,
              }, { attempts: 3, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 2000, removeOnFail: false });
              this.logger.log(`[AgentTakeover] Enqueued fromMe keyword "${fromMeText}" for ${remoteJid}`);
            }
          }
          continue; // always skip fromMe for normal processing
        }
        // For 'append' events skip any message older than 60 s so we don't replay
        // history syncs. Click-to-WhatsApp ad messages are seconds-fresh even when
        // delivered as 'append'.
        if (type === 'append') {
          const msgTs = (msg.messageTimestamp as number ?? 0) * 1000;
          // Skip anything older than 24 hours — that's historical chat sync, not a new CTWA message.
          // 60s was too short: Baileys disconnects every 1-2 hours, so CTWA messages sent during
          // a disconnect window were always older than 60s by reconnect time → silently skipped.
          // Old WhatsApp history syncs are days/weeks old, so 24h safely distinguishes them.
          if (nowMs - msgTs > 86_400_000) continue;
          this.logger.log(`Processing 'append' message from ${msg.key.remoteJid ?? 'unknown'} (age ${Math.round((nowMs - msgTs) / 1000)}s) — likely click-to-WhatsApp ad or offline message`);
        }

        // Log every inbound message type for diagnostics (helps debug CTWA issues)
        const msgTypes = msg.message ? Object.keys(msg.message).join(',') : 'null';
        this.logger.log(`Inbound [${type}] from ${msg.key.remoteJid ?? 'unknown'} — types: ${msgTypes}`);

        // Extract text from all common message types including CTWA ad messages
        // CTWA FIX: use || instead of ?? — Baileys/protobuf returns an empty string "" for the
        // unset `conversation` field on extendedTextMessage payloads (quoted replies, Click-to-WhatsApp
        // ad taps). With ??, "" is non-nullish so the chain stops at conversation and the real text in
        // extendedTextMessage.text was never read → messages dropped as "no extractable text".
        // || correctly falls through empty strings to the next field. Confirmed via CTWA-DEBUG logs.
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          msg.message?.documentMessage?.caption ||
          msg.message?.buttonsResponseMessage?.selectedButtonId ||
          msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
          msg.message?.templateButtonReplyMessage?.selectedId ||
          null;
        if (!text) {
          this.logger.warn(`Inbound [${type}] from ${msg.key.remoteJid ?? 'unknown'} — no extractable text, skipping (types: ${msgTypes})`);
          continue;
        }
        const remoteJid = msg.key.remoteJid ?? '';

        // Try to resolve LID JIDs to phone JIDs using participant or verifiedBizName fields
        if (remoteJid.endsWith('@lid')) {
          // Check if the message carries a participant field with the phone JID
          const participant = msg.key.participant ?? (msg as Record<string, unknown>).participant as string | undefined;
          if (participant && participant.endsWith('@s.whatsapp.net')) {
            entry.lidMap.set(remoteJid, participant);
          }
        }

        // For @s.whatsapp.net JIDs extract the phone number; for @lid or others keep as-is
        const from = remoteJid.includes('@s.whatsapp.net')
          ? remoteJid.replace('@s.whatsapp.net', '')
          : remoteJid;
        const job: IncomingMessageJob = {
          whatsappAccountId: accountId,
          from,
          remoteJid,
          text,
          senderName: msg.pushName ?? undefined,
          externalMessageId: msg.key.id ?? undefined,
        };
        await this.incomingQueue.add('incoming', job, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1500 },
          removeOnComplete: 2000,
          removeOnFail: false,
        });
        this.logger.log(`Enqueued inbound from ${remoteJid} (name: ${msg.pushName ?? 'unknown'}) for account ${accountId}`);
      }
    });
  }

  /**
   * Resolve a plain phone number to the correct WhatsApp JID.
   *
   * WhatsApp migrated users to @lid identifiers.  Sending a first message to a
   * contact using @s.whatsapp.net when their keys are registered under @lid
   * creates a broken Signal session — the recipient sees
   * "Waiting for this message" and no retry can fix it.
   *
   * This method calls socket.onWhatsApp() once per unique number and caches
   * the result for the lifetime of the session so repeated lookups are free.
   *
   * Only called for outbound campaign/template sends where `to` is a raw phone
   * number.  Replies to incoming messages already arrive with the correct JID
   * from WhatsApp and bypass this method entirely.
   */
  private async resolveOutboundJid(entry: SessionEntry, phone: string): Promise<string> {
    const digits = phone.replace(/\D/g, '');
    const cached = entry.jidCache.get(digits);
    if (cached) return cached;

    try {
      const results = await entry.socket.onWhatsApp(digits);
      // Log the raw result so we can diagnose "Waiting for this message" issues.
      this.logger.log(
        `onWhatsApp(${digits}) → ${JSON.stringify(results?.map(r => ({ jid: r.jid, lid: (r as any).lid, exists: r.exists })))}`,
      );
      if (results && results.length > 0 && results[0].exists) {
        // Prefer the @lid identifier when present — it is the canonical
        // WhatsApp identity after the @lid migration.  Using @s.whatsapp.net
        // for a @lid-migrated user creates a mismatched Signal session and
        // results in "Waiting for this message" on the recipient's device.
        const lid = (results[0] as any).lid as string | undefined;
        const resolved = lid ? lid : results[0].jid;
        entry.jidCache.set(digits, resolved);
        this.logger.log(
          `JID for ${digits}: jid=${results[0].jid} lid=${lid ?? 'none'} → using ${resolved}`,
        );
        return resolved;
      }
    } catch (e) {
      this.logger.warn(`onWhatsApp lookup failed for ${digits}: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Fall back to standard phone JID
    const fallback = digits + '@s.whatsapp.net';
    entry.jidCache.set(digits, fallback);
    this.logger.warn(`onWhatsApp(${digits}) returned no result — falling back to ${fallback}`);
    return fallback;
  }

  async sendText(accountId: string, to: string, text: string): Promise<void> {
    const entry = this.sessions.get(accountId);
    if (!entry || entry.status !== 'CONNECTED') {
      throw new Error(`No active Baileys session for account ${accountId}`);
    }
    // If `to` is already a JID (contains '@'), it came from an incoming message
    // and is already the correct identifier — just resolve @lid→phone as before.
    // If it's a plain phone number (campaign/template send), use onWhatsApp() to
    // get the correct JID which may be @lid rather than @s.whatsapp.net.
    let jid: string;
    if (to.includes('@')) {
      const rawJid = to;
      jid = rawJid.endsWith('@lid') ? (entry.lidMap.get(rawJid) ?? rawJid) : rawJid;
    } else {
      jid = await this.resolveOutboundJid(entry, to);
    }
    this.logger.log(`Sending text to JID ${jid} for account ${accountId}`);
    const sentText = await entry.socket.sendMessage(jid, { text });
    if (sentText?.key?.id && sentText.message) {
      entry.msgStore.set(sentText.key.id, sentText.message);
    }
  }

  /**
   * Sends a "composing" (typing) presence update to the given JID and optionally
   * sleeps for `durationMs` milliseconds to simulate a natural typing delay.
   * Never throws — a failed typing call must never block the actual reply.
   */
  async sendTyping(accountId: string, to: string, durationMs: number): Promise<void> {
    const entry = this.sessions.get(accountId);
    if (!entry || entry.status !== 'CONNECTED') return; // silently skip if not connected
    const rawJid = to.includes('@') ? to : to.replace(/\D/g, '') + '@s.whatsapp.net';
    const jid = rawJid.endsWith('@lid') ? (entry.lidMap.get(rawJid) ?? rawJid) : rawJid;
    try {
      await entry.socket.sendPresenceUpdate('composing', jid); // typing indicator — no JID resolution needed
      if (durationMs > 0) {
        await new Promise<void>((r) => setTimeout(r, durationMs));
      }
    } catch (e) {
      this.logger.warn(
        `[TypingIndicator] Failed to send composing presence: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async sendMedia(
    accountId: string,
    to: string,
    filePath: string,
    caption?: string,
  ): Promise<void> {
    const entry = this.sessions.get(accountId);
    if (!entry || entry.status !== 'CONNECTED') {
      throw new Error(`No active Baileys session for account ${accountId}`);
    }
    let jid: string;
    if (to.includes('@')) {
      jid = to.endsWith('@lid') ? (entry.lidMap.get(to) ?? to) : to;
    } else {
      jid = await this.resolveOutboundJid(entry, to);
    }
    const ext = path.extname(filePath.split('?')[0]).toLowerCase().replace('.', '');
    const cap = caption && caption.trim() ? caption.trim() : undefined;

    // Support both local file paths and full HTTP(S) URLs
    let buffer: Buffer;
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      const res = await fetch(filePath);
      if (!res.ok) {
        throw new Error(`Failed to download media from ${filePath}: HTTP ${res.status}`);
      }
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      buffer = fs.readFileSync(filePath);
    }

    let sentMedia: Awaited<ReturnType<typeof entry.socket.sendMessage>> | undefined;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      sentMedia = await entry.socket.sendMessage(jid, { image: buffer, caption: cap });
    } else if (['mp4', 'mov', 'avi', '3gp', 'mkv', 'webm'].includes(ext)) {
      sentMedia = await entry.socket.sendMessage(jid, { video: buffer, caption: cap });
    } else if (['mp3', 'ogg', 'opus', 'm4a', 'wav', 'aac'].includes(ext)) {
      sentMedia = await entry.socket.sendMessage(jid, { audio: buffer, ptt: false });
    } else {
      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls: 'application/vnd.ms-excel',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        zip: 'application/zip',
        txt: 'text/plain',
      };
      const mimetype = mimeMap[ext] ?? 'application/octet-stream';
      sentMedia = await entry.socket.sendMessage(jid, {
        document: buffer,
        mimetype,
        fileName: path.basename(filePath),
        caption: cap,
      });
    }
    // Cache for retry-receipt handling (getMessage callback)
    if (sentMedia?.key?.id && sentMedia.message) {
      entry.msgStore.set(sentMedia.key.id, sentMedia.message);
    }
    this.logger.log(`Sent media (${ext}) to JID ${jid} for account ${accountId}`);
  }

  getQrCode(accountId: string): string | null {
    return this.sessions.get(accountId)?.qrCode ?? null;
  }

  getStatus(accountId: string): string {
    return this.sessions.get(accountId)?.status ?? 'DISCONNECTED';
  }

  async requestPairingCode(accountId: string, phoneNumber: string): Promise<string> {
    const phone = phoneNumber.replace(/\D/g, '');

    // Kill any existing session so we can restart with pairing phone set
    const existing = this.sessions.get(accountId);
    if (existing) {
      if (existing.status === 'CONNECTED') throw new Error('Account is already connected');
      try { existing.socket.end(undefined); } catch { /* ignore */ }
      this.sessions.delete(accountId);
    }

    // Start fresh session with pairing phone — pairing code will be generated on qr event
    await this.startSession(accountId, phone);

    // Wait up to 20s for the pairing code to appear
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const code = this.sessions.get(accountId)?.pairingCode;
      if (code) return code;
    }
    throw new Error('Timed out waiting for pairing code. Check server logs.');
  }

  getPairingCode(accountId: string): string | null {
    return this.sessions.get(accountId)?.pairingCode ?? null;
  }

  async disconnectSession(accountId: string): Promise<void> {
    const entry = this.sessions.get(accountId);
    if (entry) {
      try { entry.socket.end(undefined); } catch { /* ignore */ }
      this.sessions.delete(accountId);
    }
    const sessionDir = path.join(SESSION_DIR, accountId);
    fs.rmSync(sessionDir, { recursive: true, force: true });
    await this.prisma.whatsAppSession.updateMany({
      where: { whatsappAccountId: accountId },
      data: { status: 'DISCONNECTED', qrCode: null },
    });
  }
}
