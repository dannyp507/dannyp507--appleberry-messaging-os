import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  WASocket,
  BaileysEventMap,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import P from 'pino';

const SESSION_DIR = process.env.BAILEYS_SESSION_DIR ?? '/tmp/baileys-sessions';

interface SessionEntry {
  socket: WASocket;
  qrCode: string | null;
  status: 'PENDING_QR' | 'CONNECTED' | 'DISCONNECTED';
  accountId: string;
}

@Injectable()
export class BaileysSessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BaileysSessionService.name);
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(private readonly prisma: PrismaService) {}

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

  async startSession(accountId: string): Promise<void> {
    if (this.sessions.has(accountId)) {
      this.logger.log(`Session ${accountId} already active`);
      return;
    }

    const sessionDir = path.join(SESSION_DIR, accountId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const logger = P({ level: 'silent' });

    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: ['Appleberry', 'Chrome', '121.0'],
      printQRInTerminal: false,
    });

    const entry: SessionEntry = {
      socket,
      qrCode: null,
      status: 'PENDING_QR',
      accountId,
    };
    this.sessions.set(accountId, entry);

    // Upsert session record
    await this.prisma.whatsAppSession.upsert({
      where: { whatsappAccountId: accountId },
      create: { whatsappAccountId: accountId, status: 'PENDING_QR' },
      update: { status: 'PENDING_QR', qrCode: null },
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update: BaileysEventMap['connection.update']) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        entry.qrCode = qr;
        this.logger.log(`QR code generated for account ${accountId}`);
        await this.prisma.whatsAppSession.updateMany({
          where: { whatsappAccountId: accountId },
          data: { qrCode: qr, status: 'PENDING_QR' },
        });
      }

      if (connection === 'open') {
        entry.status = 'CONNECTED';
        entry.qrCode = null;
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
        const shouldReconnect = reason !== DisconnectReason.loggedOut;

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

        if (shouldReconnect) {
          this.logger.log(`Reconnecting account ${accountId} in 5s…`);
          setTimeout(() => void this.startSession(accountId), 5000);
        } else {
          this.logger.warn(`Account ${accountId} logged out — deleting session files`);
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
      }
    });

    // Handle inbound messages
    socket.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      if (type !== 'notify') return;
      for (const msg of msgs) {
        if (msg.key.fromMe) continue;
        const text =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text ??
          null;
        if (!text) continue;
        const from = msg.key.remoteJid?.replace('@s.whatsapp.net', '') ?? '';
        await this.handleInboundMessage(accountId, from, text, msg.key.id ?? '');
      }
    });
  }

  private async handleInboundMessage(
    accountId: string,
    from: string,
    text: string,
    externalId: string,
  ) {
    const account = await this.prisma.whatsAppAccount.findUnique({ where: { id: accountId } });
    if (!account) return;

    const phone = `+${from}`;
    let contact = await this.prisma.contact.findFirst({
      where: { workspaceId: account.workspaceId, phone },
    });
    if (!contact) {
      contact = await this.prisma.contact.create({
        data: { workspaceId: account.workspaceId, phone, firstName: from },
      });
    }

    let thread = await this.prisma.inboxThread.findFirst({
      where: { workspaceId: account.workspaceId, whatsappAccountId: accountId, contactId: contact.id },
    });
    if (!thread) {
      thread = await this.prisma.inboxThread.create({
        data: {
          workspaceId: account.workspaceId,
          contactId: contact.id,
          whatsappAccountId: accountId,
          lastMessagePreview: text,
          lastMessageAt: new Date(),
        },
      });
    } else {
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { lastMessagePreview: text, lastMessageAt: new Date(), unreadCount: { increment: 1 }, status: 'OPEN' },
      });
    }

    await this.prisma.inboxMessage.create({
      data: { threadId: thread.id, direction: 'INBOUND', message: text, providerMessageId: externalId },
    });
  }

  async sendText(accountId: string, to: string, text: string): Promise<void> {
    const entry = this.sessions.get(accountId);
    if (!entry || entry.status !== 'CONNECTED') {
      throw new Error(`No active Baileys session for account ${accountId}`);
    }
    const jid = to.replace(/\D/g, '') + '@s.whatsapp.net';
    await entry.socket.sendMessage(jid, { text });
  }

  getQrCode(accountId: string): string | null {
    return this.sessions.get(accountId)?.qrCode ?? null;
  }

  getStatus(accountId: string): string {
    return this.sessions.get(accountId)?.status ?? 'DISCONNECTED';
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
