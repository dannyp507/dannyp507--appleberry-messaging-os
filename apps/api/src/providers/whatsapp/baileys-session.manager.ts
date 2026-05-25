import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, WhatsAppProviderType, WhatsAppSessionStatus } from '@prisma/client';
import * as QRCode from 'qrcode';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const makeWASocket = require('@whiskeysockets/baileys').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DisconnectReason, makeCacheableSignalKeyStore, initAuthCreds } =
  require('@whiskeysockets/baileys');

type WASocket = ReturnType<typeof makeWASocket>;

export interface SessionInfo {
  accountId: string;
  status: WhatsAppSessionStatus;
  qrDataUrl: string | null;
}

// ─── DB-backed auth state ─────────────────────────────────────────────────────
//
// Stores WhatsApp credentials AND Signal protocol keys in
// WhatsAppSession.sessionData (Postgres JSON column).
// Nothing is written to the filesystem — sessions survive server restarts.

async function useDbAuthState(prisma: PrismaService, accountId: string) {
  const existing = await prisma.whatsAppSession.findUnique({
    where: { whatsappAccountId: accountId },
  });

  const stored = (existing?.sessionData ?? {}) as Record<string, unknown>;

  // Mutable creds object — Baileys mutates this in place, saveCreds persists it
  const creds =
    (stored.creds as ReturnType<typeof initAuthCreds>) ?? initAuthCreds();

  // In-memory key store, written through to DB on every set()
  const keysData = (stored.keys ?? {}) as Record<
    string,
    Record<string, unknown>
  >;

  const persist = async () => {
    await prisma.whatsAppSession.upsert({
      where: { whatsappAccountId: accountId },
      update: { sessionData: { creds, keys: keysData } as Prisma.InputJsonValue },
      create: {
        whatsappAccountId: accountId,
        status: WhatsAppSessionStatus.DISCONNECTED,
        sessionData: { creds, keys: keysData } as Prisma.InputJsonValue,
      },
    });
  };

  // Wrap a plain SignalKeyStore with Baileys' in-memory cache layer
  const keys = makeCacheableSignalKeyStore(
    {
      get: async (type: string, ids: string[]) => {
        const bucket = (keysData[type] ?? {}) as Record<string, unknown>;
        return Object.fromEntries(ids.map((id) => [id, bucket[id]]));
      },
      set: async (
        data: Record<string, Record<string, unknown> | null>,
      ) => {
        for (const [type, vals] of Object.entries(data)) {
          keysData[type] ??= {};
          for (const [id, val] of Object.entries(vals ?? {})) {
            if (val != null) {
              keysData[type][id] = val;
            } else {
              delete keysData[type][id];
            }
          }
        }
        await persist();
      },
    },
    // Pass a silent logger to suppress Baileys key-store debug output
    { level: 'silent', child: () => ({ level: 'silent' }) } as never,
  );

  return { state: { creds, keys }, saveCreds: persist };
}

// ─── Session manager ──────────────────────────────────────────────────────────

@Injectable()
export class BaileysSessionManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BaileysSessionManager.name);
  private readonly sockets = new Map<string, WASocket>();

  constructor(private readonly prisma: PrismaService) {}

  // Auto-reconnect any account whose session data is already stored in the DB
  async onModuleInit() {
    const accounts = await this.prisma.whatsAppAccount.findMany({
      where: { providerType: WhatsAppProviderType.BAILEYS, isArchived: false },
      include: { session: true },
    });

    for (const account of accounts) {
      const hasCredentials =
        account.session?.sessionData != null &&
        typeof account.session.sessionData === 'object' &&
        'creds' in (account.session.sessionData as object);

      if (hasCredentials) {
        this.logger.log(
          `Auto-reconnecting Baileys account "${account.name}" (${account.id})`,
        );
        this.startSession(account.id).catch((e: Error) =>
          this.logger.error(
            `Auto-reconnect failed for ${account.id}: ${e.message}`,
          ),
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
    }
  }

  async startSession(accountId: string): Promise<void> {
    if (this.sockets.has(accountId)) {
      this.logger.log(`Session already active for ${accountId}`);
      return;
    }

    // Load or create auth state from DB — no filesystem involved
    const { state, saveCreds } = await useDbAuthState(this.prisma, accountId);

    const sock: WASocket = makeWASocket({
      auth: { creds: state.creds, keys: state.keys },
      printQRInTerminal: false,
      logger: { level: 'silent', child: () => ({ level: 'silent' }) } as never,
    });

    this.sockets.set(accountId, sock);

    // Persist credential changes immediately — this is what keeps the session
    // alive across server restarts
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on(
      'connection.update',
      async (update: {
        connection?: string;
        qr?: string;
        lastDisconnect?: { error?: { output?: { statusCode?: number } } };
      }) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
          try {
            const dataUrl = await QRCode.toDataURL(qr);
            await this.upsertSessionStatus(
              accountId,
              WhatsAppSessionStatus.PENDING_QR,
              dataUrl,
            );
            this.logger.log(`QR ready for account ${accountId}`);
          } catch (e) {
            this.logger.error(`QR generation error: ${(e as Error).message}`);
          }
        }

        if (connection === 'open') {
          // Clear QR code now that we are connected
          await this.upsertSessionStatus(
            accountId,
            WhatsAppSessionStatus.CONNECTED,
            null,
          );
          await this.prisma.whatsAppAccount.updateMany({
            where: { id: accountId },
            data: { sessionStatus: WhatsAppSessionStatus.CONNECTED },
          });
          this.logger.log(`Account ${accountId} connected to WhatsApp ✓`);
        }

        if (connection === 'close') {
          const statusCode =
            lastDisconnect?.error?.output?.statusCode;
          const loggedOut =
            statusCode === DisconnectReason.loggedOut;

          this.sockets.delete(accountId);

          await this.upsertSessionStatus(
            accountId,
            WhatsAppSessionStatus.DISCONNECTED,
            null,
          );
          await this.prisma.whatsAppAccount.updateMany({
            where: { id: accountId },
            data: { sessionStatus: WhatsAppSessionStatus.DISCONNECTED },
          });

          if (loggedOut) {
            // User explicitly logged out from phone — wipe stored credentials
            this.logger.warn(
              `Account ${accountId} logged out — clearing stored credentials`,
            );
            await this.prisma.whatsAppSession.updateMany({
              where: { whatsappAccountId: accountId },
              data: { sessionData: {} },
            });
          } else {
            // Transient disconnect (network, server restart, etc.) — reconnect
            this.logger.warn(
              `Account ${accountId} disconnected (code ${statusCode}) — ` +
                `reconnecting in 5 s`,
            );
            setTimeout(() => {
              this.startSession(accountId).catch((e: Error) =>
                this.logger.error(
                  `Reconnect failed for ${accountId}: ${e.message}`,
                ),
              );
            }, 5000);
          }
        }
      },
    );
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

    // Wipe stored credentials so the next connect generates a fresh QR
    await this.prisma.whatsAppSession.updateMany({
      where: { whatsappAccountId: accountId },
      data: { sessionData: {} },
    });
    await this.upsertSessionStatus(
      accountId,
      WhatsAppSessionStatus.DISCONNECTED,
      null,
    );
    await this.prisma.whatsAppAccount.updateMany({
      where: { id: accountId },
      data: { sessionStatus: WhatsAppSessionStatus.DISCONNECTED },
    });
  }

  getSocket(accountId: string): WASocket | undefined {
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

  private async upsertSessionStatus(
    accountId: string,
    status: WhatsAppSessionStatus,
    qrDataUrl: string | null,
  ) {
    await this.prisma.whatsAppSession.upsert({
      where: { whatsappAccountId: accountId },
      update: { status, qrCode: qrDataUrl },
      create: {
        whatsappAccountId: accountId,
        status,
        qrCode: qrDataUrl,
      },
    });
  }
}
