import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppProviderType, WhatsAppSessionStatus } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import * as QRCode from 'qrcode';

// Baileys imports — dynamic to avoid issues if package not installed
// eslint-disable-next-line @typescript-eslint/no-require-imports
const makeWASocket = require('@whiskeysockets/baileys').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } =
  require('@whiskeysockets/baileys');

const SESSIONS_DIR = process.env.BAILEYS_SESSIONS_DIR ?? '/tmp/appleberry-sessions';

export interface SessionInfo {
  accountId: string;
  status: WhatsAppSessionStatus;
  qrDataUrl: string | null;
}

@Injectable()
export class BaileysSessionManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BaileysSessionManager.name);
  // accountId → active WASocket instance
  private readonly sockets = new Map<string, ReturnType<typeof makeWASocket>>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Reconnect all BAILEYS accounts that have stored session files
    const accounts = await this.prisma.whatsAppAccount.findMany({
      where: { providerType: WhatsAppProviderType.BAILEYS, isArchived: false },
    });
    for (const account of accounts) {
      const sessionDir = this.sessionDir(account.id);
      if (fs.existsSync(sessionDir)) {
        this.logger.log(`Auto-reconnecting Baileys account ${account.id}`);
        this.startSession(account.id).catch((e: Error) =>
          this.logger.error(`Failed to auto-reconnect ${account.id}: ${e.message}`),
        );
      }
    }
  }

  async onModuleDestroy() {
    for (const [accountId, sock] of this.sockets) {
      try {
        sock.end(undefined);
      } catch {
        // ignore
      }
      this.sockets.delete(accountId);
      this.logger.log(`Disconnected Baileys session for ${accountId}`);
    }
  }

  private sessionDir(accountId: string): string {
    return path.join(SESSIONS_DIR, accountId);
  }

  async startSession(accountId: string): Promise<void> {
    if (this.sockets.has(accountId)) {
      this.logger.log(`Session already active for ${accountId}`);
      return;
    }

    const sessionDir = this.sessionDir(accountId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger as never),
      },
      printQRInTerminal: false,
      logger: { level: 'silent' } as never,
    });

    this.sockets.set(accountId, sock);

    // Persist credentials on update
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: {
      connection?: string;
      qr?: string;
      lastDisconnect?: { error?: { output?: { statusCode?: number } } };
    }) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr);
          await this.upsertSession(accountId, WhatsAppSessionStatus.PENDING_QR, dataUrl);
          this.logger.log(`QR generated for account ${accountId}`);
        } catch (e) {
          this.logger.error(`QR generation failed: ${(e as Error).message}`);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        this.sockets.delete(accountId);
        await this.upsertSession(accountId, WhatsAppSessionStatus.DISCONNECTED, null);
        await this.prisma.whatsAppAccount.updateMany({
          where: { id: accountId },
          data: { sessionStatus: WhatsAppSessionStatus.DISCONNECTED },
        });

        if (isLoggedOut) {
          this.logger.warn(`Account ${accountId} logged out — clearing session files`);
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } else {
          // Transient disconnect — attempt reconnect after delay
          this.logger.warn(`Account ${accountId} disconnected (code ${statusCode}) — reconnecting`);
          setTimeout(() => {
            this.startSession(accountId).catch((e: Error) =>
              this.logger.error(`Reconnect failed for ${accountId}: ${e.message}`),
            );
          }, 5000);
        }
      }

      if (connection === 'open') {
        await this.upsertSession(accountId, WhatsAppSessionStatus.CONNECTED, null);
        await this.prisma.whatsAppAccount.updateMany({
          where: { id: accountId },
          data: { sessionStatus: WhatsAppSessionStatus.CONNECTED },
        });
        this.logger.log(`Account ${accountId} connected to WhatsApp`);
      }
    });
  }

  async stopSession(accountId: string): Promise<void> {
    const sock = this.sockets.get(accountId);
    if (sock) {
      try {
        sock.end(undefined);
      } catch {
        // ignore
      }
      this.sockets.delete(accountId);
    }

    // Clear session files so next connect generates a fresh QR
    const sessionDir = this.sessionDir(accountId);
    fs.rmSync(sessionDir, { recursive: true, force: true });

    await this.upsertSession(accountId, WhatsAppSessionStatus.DISCONNECTED, null);
    await this.prisma.whatsAppAccount.updateMany({
      where: { id: accountId },
      data: { sessionStatus: WhatsAppSessionStatus.DISCONNECTED },
    });
  }

  getSocket(accountId: string): ReturnType<typeof makeWASocket> | undefined {
    return this.sockets.get(accountId);
  }

  async getSessionInfo(accountId: string): Promise<SessionInfo> {
    const session = await this.prisma.whatsAppSession.findUnique({
      where: { whatsappAccountId: accountId },
    });
    return {
      accountId,
      status: session?.status ?? WhatsAppSessionStatus.DISCONNECTED,
      qrDataUrl: session?.qrCode ?? null,
    };
  }

  private async upsertSession(
    accountId: string,
    status: WhatsAppSessionStatus,
    qrDataUrl: string | null,
  ) {
    await this.prisma.whatsAppSession.upsert({
      where: { whatsappAccountId: accountId },
      update: { status, qrCode: qrDataUrl },
      create: { whatsappAccountId: accountId, status, qrCode: qrDataUrl },
    });
  }
}
