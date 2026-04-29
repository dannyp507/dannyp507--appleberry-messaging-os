import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { BaileysSessionService } from '../baileys/baileys-session.service';
import type { CreateWhatsAppAccountDto } from './dto/create-whatsapp-account.dto';
import * as QRCode from 'qrcode';

@Injectable()
export class WhatsappAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly baileys: BaileysSessionService,
    private readonly config: ConfigService,
  ) {}

  list(workspaceId: string) {
    return this.prisma.whatsAppAccount.findMany({
      where: { workspaceId, isArchived: false },
      orderBy: { createdAt: 'asc' },
      include: { session: { select: { status: true, qrCode: true, lastConnectedAt: true } } },
    });
  }

  async create(workspaceId: string, dto: CreateWhatsAppAccountDto) {
    await this.billing.assertCanCreateWhatsAppAccount(workspaceId);

    const account = await this.prisma.whatsAppAccount.create({
      data: {
        workspaceId,
        name: dto.name,
        phone: dto.phone,
        providerType: dto.providerType ?? 'MOCK',
      },
    });

    if (account.providerType === 'BAILEYS') {
      // Start session async so HTTP response is fast
      void this.baileys.startSession(account.id);
    }

    return account;
  }

  async findOne(workspaceId: string, id: string) {
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { id, workspaceId },
      include: { session: true },
    });
    if (!account) throw new NotFoundException('WhatsApp account not found');
    return account;
  }

  async getQrCode(workspaceId: string, id: string) {
    const qrString = this.baileys.getQrCode(id);
    const status = this.baileys.getStatus(id);

    if (!qrString) {
      return { qrDataUrl: null, status };
    }

    // Generate QR as proper PNG data URL server-side (white bg, black modules)
    const qrDataUrl = await QRCode.toDataURL(qrString, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });

    return { qrDataUrl, status };
  }

  async requestPairingCode(workspaceId: string, id: string, phone: string) {
    const account = await this.findOne(workspaceId, id);
    if (account.providerType !== 'BAILEYS') {
      throw new Error('Account is not a BAILEYS provider');
    }
    const code = await this.baileys.requestPairingCode(id, phone);
    return { code };
  }

  async startBaileysSession(workspaceId: string, id: string) {
    const account = await this.findOne(workspaceId, id);
    if (account.providerType !== 'BAILEYS') {
      throw new Error('Account is not a BAILEYS provider');
    }
    await this.baileys.startSession(id);
    return { started: true };
  }

  async disconnectBaileysSession(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.baileys.disconnectSession(id);
    return { disconnected: true };
  }

  archive(workspaceId: string, id: string) {
    return this.prisma.whatsAppAccount.updateMany({
      where: { id, workspaceId },
      data: { isArchived: true },
    });
  }

  pause(workspaceId: string, id: string) {
    return this.prisma.whatsAppAccount.updateMany({
      where: { id, workspaceId },
      data: { isPaused: true },
    });
  }

  resume(workspaceId: string, id: string) {
    return this.prisma.whatsAppAccount.updateMany({
      where: { id, workspaceId },
      data: { isPaused: false },
    });
  }

  /**
   * Store Cloud API credentials on an account and verify them against Meta.
   * Creates the account first if no id is supplied.
   */
  async connectCloud(
    workspaceId: string,
    params: {
      accountId?: string;            // if omitted a new account is created
      name?: string;                 // required when creating
      phoneNumberId: string;
      accessToken: string;
      wabaId?: string;
      verifyToken?: string;          // for webhook verification (you choose this)
    },
  ) {
    // ── Verify credentials with Meta before saving ────────────────────────
    const graphVersion = 'v21.0';
    const verifyUrl = `https://graph.facebook.com/${graphVersion}/${params.phoneNumberId}?fields=display_phone_number,verified_name&access_token=${params.accessToken}`;
    let displayPhone: string | null = null;
    try {
      const res = await fetch(verifyUrl);
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const errMsg =
          typeof json.error === 'object' && json.error !== null && 'message' in json.error
            ? String((json.error as { message?: string }).message)
            : JSON.stringify(json);
        throw new BadRequestException(`Meta API rejected credentials: ${errMsg}`);
      }
      displayPhone =
        typeof json.display_phone_number === 'string'
          ? json.display_phone_number
          : null;
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(
        'Could not reach Meta API to verify credentials — check your internet connection',
      );
    }

    const credentials = {
      phoneNumberId: params.phoneNumberId,
      accessToken: params.accessToken,
      ...(params.wabaId ? { wabaId: params.wabaId } : {}),
      verifyToken: params.verifyToken ?? crypto.randomUUID(),
      graphVersion,
    };

    // ── Create or update account ──────────────────────────────────────────
    if (params.accountId) {
      const existing = await this.prisma.whatsAppAccount.findFirst({
        where: { id: params.accountId, workspaceId },
      });
      if (!existing) throw new NotFoundException('WhatsApp account not found');

      const updated = await this.prisma.whatsAppAccount.update({
        where: { id: params.accountId },
        data: {
          providerType: 'CLOUD',
          credentials,
          sessionStatus: 'CONNECTED',
          ...(displayPhone ? { phone: displayPhone } : {}),
        },
      });
      return { account: updated, verifyToken: credentials.verifyToken, displayPhone };
    }

    await this.billing.assertCanCreateWhatsAppAccount(workspaceId);
    const account = await this.prisma.whatsAppAccount.create({
      data: {
        workspaceId,
        name: params.name ?? `WhatsApp Cloud ${displayPhone ?? params.phoneNumberId}`,
        phone: displayPhone ?? undefined,
        providerType: 'CLOUD',
        sessionStatus: 'CONNECTED',
        credentials,
      },
    });
    return { account, verifyToken: credentials.verifyToken, displayPhone };
  }

  /**
   * Complete WhatsApp Embedded Signup.
   *
   * Accepts either:
   *   • code         – OAuth authorization code from FB.login (preferred, fully automatic)
   *   • accessToken  – manually pasted permanent token (fallback)
   *
   * When `code` is supplied the backend exchanges it for a long-lived user
   * access token automatically — the user never has to paste anything.
   *
   * Requires META_APP_ID + META_APP_SECRET env vars for the code exchange.
   */
  async embeddedSignup(
    workspaceId: string,
    params: {
      code?: string;
      accessToken?: string;
      phoneNumberId: string;
      wabaId?: string;
      name?: string;
      accountId?: string;
    },
  ) {
    console.log('[EmbeddedSignup] called — code:', params.code ? `present (${params.code.length} chars)` : 'missing', '| phoneNumberId:', params.phoneNumberId);
    let accessToken = params.accessToken;

    if (params.code && !accessToken) {
      accessToken = await this.exchangeMetaCode(params.code);
    }

    if (!accessToken) {
      throw new BadRequestException(
        'Either an OAuth code or an access token is required',
      );
    }

    return this.connectCloud(workspaceId, {
      accountId: params.accountId,
      name: params.name,
      phoneNumberId: params.phoneNumberId,
      accessToken,
      wabaId: params.wabaId,
    });
  }

  /**
   * Exchange an OAuth authorization code (from FB.login) for a long-lived
   * user access token (~60 days).
   *
   * Meta's Embedded Signup flow does NOT require redirect_uri when the code
   * is obtained via the JS SDK popup.
   */
  private async exchangeMetaCode(code: string): Promise<string> {
    const appId = this.config.get<string>('META_APP_ID');
    const appSecret = this.config.get<string>('META_APP_SECRET');

    if (!appId || !appSecret) {
      throw new BadRequestException(
        'META_APP_ID and META_APP_SECRET env vars are not configured on the server',
      );
    }

    const graphVersion = 'v21.0';

    // ── Step 1: exchange code → short-lived user access token ─────────────
    const shortUrl = new URL(
      `https://graph.facebook.com/${graphVersion}/oauth/access_token`,
    );
    shortUrl.searchParams.set('client_id', appId);
    shortUrl.searchParams.set('client_secret', appSecret);
    shortUrl.searchParams.set('code', code);
    // redirect_uri intentionally omitted for the JS-SDK popup flow

    const shortRes = await fetch(shortUrl.toString());
    const shortJson = (await shortRes.json()) as Record<string, unknown>;
    console.log('[ExchangeMetaCode] step1 status:', shortRes.status, '| body:', JSON.stringify(shortJson).slice(0, 400));

    if (!shortRes.ok || typeof shortJson.access_token !== 'string') {
      const msg =
        typeof shortJson.error === 'object' && shortJson.error !== null
          ? JSON.stringify(shortJson.error)
          : JSON.stringify(shortJson);
      throw new BadRequestException(`Meta token exchange failed: ${msg}`);
    }

    const shortToken = shortJson.access_token;

    // ── Step 2: exchange short-lived → long-lived token (~60 days) ────────
    const longUrl = new URL(
      `https://graph.facebook.com/${graphVersion}/oauth/access_token`,
    );
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', appId);
    longUrl.searchParams.set('client_secret', appSecret);
    longUrl.searchParams.set('fb_exchange_token', shortToken);

    const longRes = await fetch(longUrl.toString());
    const longJson = (await longRes.json()) as Record<string, unknown>;

    // If long-lived exchange fails, fall back to short-lived (still works)
    return typeof longJson.access_token === 'string'
      ? longJson.access_token
      : shortToken;
  }
}
