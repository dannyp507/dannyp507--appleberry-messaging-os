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
}

@Injectable()
export class BaileysSessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BaileysSessionService.name);
  private readonly sessions = new Map<string, SessionEntry>();

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
  }

  onModuleDestroy() {
    for (const [, entry] of this.sessions) {
      try {
        entry.socket.end(undefined);
      } catch {
        // ignore
      }
    }
    this.sessions.clear();
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

    const logger = P({ level: 'silent' });

    // Fetch latest WhatsApp Web version — outdated versions get 405-rejected
    let version: [number, number, number] | undefined;
    try {
      const result = await fetchLatestWaWebVersion({});
      version = result.version as [number, number, number];
      this.logger.log(`Using WA Web version ${version?.join('.')}`);
    } catch {
      this.logger.warn('Could not fetch latest WA version, using default');
    }

    const agent = new SocksProxyAgent(WARP_PROXY);
    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: Browsers.appropriate('Chrome'),
      version,
      printQRInTerminal: false,
      syncFullHistory: false,
      agent,
    });

    const entry: SessionEntry = {
      socket,
      qrCode: null,
      pairingCode: null,
      pairingPhone: pairingPhone ? pairingPhone.replace(/\D/g, '') : null,
      status: pairingPhone ? 'PENDING_PAIRING' : 'PENDING_QR',
      accountId,
      lidMap: new Map(),
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
        const loggedOut = reason === DisconnectReason.loggedOut;
        // Only reconnect if we were previously connected (have session data)
        const hasSessionData = fs.existsSync(path.join(sessionDir, 'creds.json'));
        const shouldReconnect = !loggedOut && hasSessionData;

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

        if (loggedOut) {
          this.logger.warn(`Account ${accountId} logged out — deleting session files`);
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } else if (shouldReconnect) {
          this.logger.log(`Reconnecting account ${accountId} in 5s…`);
          setTimeout(() => void this.startSession(accountId), 5000);
        } else {
          this.logger.log(`Account ${accountId} closed before pairing — not reconnecting`);
        }
      }
    });

    // Handle inbound messages — enqueue for full automation pipeline
    socket.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      if (type !== 'notify') return;
      for (const msg of msgs) {
        if (msg.key.fromMe) continue;
        const text =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text ??
          null;
        if (!text) continue;
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

  async sendText(accountId: string, to: string, text: string): Promise<void> {
    const entry = this.sessions.get(accountId);
    if (!entry || entry.status !== 'CONNECTED') {
      throw new Error(`No active Baileys session for account ${accountId}`);
    }
    // Resolve @lid JIDs to @s.whatsapp.net using the contacts map.
    // @lid JIDs are multi-device linked-device IDs — replies to them are silently dropped
    // by WhatsApp unless resolved to the real phone JID first.
    const rawJid = to.includes('@') ? to : to.replace(/\D/g, '') + '@s.whatsapp.net';
    const jid = rawJid.endsWith('@lid')
      ? (entry.lidMap.get(rawJid) ?? rawJid)
      : rawJid;
    this.logger.log(`Sending to JID ${jid}${jid !== rawJid ? ` (resolved from ${rawJid})` : ''} for account ${accountId}`);
    await entry.socket.sendMessage(jid, { text });
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
    const rawJid = to.includes('@') ? to : to.replace(/\D/g, '') + '@s.whatsapp.net';
    const jid = rawJid.endsWith('@lid') ? (entry.lidMap.get(rawJid) ?? rawJid) : rawJid;
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const buffer = fs.readFileSync(filePath);
    const cap = caption && caption.trim() ? caption.trim() : undefined;

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      await entry.socket.sendMessage(jid, { image: buffer, caption: cap });
    } else if (['mp4', 'mov', 'avi', '3gp', 'mkv', 'webm'].includes(ext)) {
      await entry.socket.sendMessage(jid, { video: buffer, caption: cap });
    } else if (['mp3', 'ogg', 'opus', 'm4a', 'wav', 'aac'].includes(ext)) {
      await entry.socket.sendMessage(jid, { audio: buffer, ptt: false });
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
      await entry.socket.sendMessage(jid, {
        document: buffer,
        mimetype,
        fileName: path.basename(filePath),
        caption: cap,
      });
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
