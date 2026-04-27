import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { BaileysSessionService } from '../baileys/baileys-session.service';
import { RedisService } from '../redis/redis.service';
import type { CreateWhatsAppAccountDto } from './dto/create-whatsapp-account.dto';
import * as QRCode from 'qrcode';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const OAUTH_STATE_TTL = 600; // 10 minutes

@Injectable()
export class WhatsappAccountsService {
  private readonly logger = new Logger(WhatsappAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly baileys: BaileysSessionService,
    private readonly redis: RedisService,
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

  /**
   * Embedded Signup JS SDK flow.
   * Accepts the code returned by FB.login() (redirect_uri is always the
   * Facebook login-success stub for JS SDK exchanges), creates a new CLOUD
   * account, and stores the long-lived token + WABA + phone number ID.
   */
  async metaEmbeddedSignup(workspaceId: string, name: string, code: string) {
    await this.billing.assertCanCreateWhatsAppAccount(workspaceId);

    const appId =
      this.config.get<string>('META_APP_ID') ??
      this.config.get<string>('FACEBOOK_APP_ID') ??
      '';
    const appSecret =
      this.config.get<string>('META_APP_SECRET') ??
      this.config.get<string>('FACEBOOK_APP_SECRET') ??
      '';

    if (!appId || !appSecret) {
      throw new BadRequestException(
        'Meta app not configured — set META_APP_ID and META_APP_SECRET env vars',
      );
    }

    // JS SDK code exchange uses Facebook's own redirect_uri stub
    const tokenRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: 'https://www.facebook.com/connect/login_success.html',
          code,
        }),
    );
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: { message: string };
    };
    if (!tokenData.access_token) {
      throw new BadRequestException(
        `Meta token exchange failed: ${tokenData.error?.message ?? 'unknown error'}`,
      );
    }

    // Extend to long-lived token (~60 days)
    const longRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: tokenData.access_token,
        }),
    );
    const longData = (await longRes.json()) as { access_token?: string };
    const longToken = longData.access_token ?? tokenData.access_token;

    // Get WABAs the user authorised
    const wabaRes = await fetch(
      `${GRAPH_BASE}/me/whatsapp_business_accounts?fields=id,name&access_token=${longToken}`,
    );
    const wabaData = (await wabaRes.json()) as {
      data?: Array<{ id: string; name: string }>;
      error?: { message: string };
    };
    if (!wabaData.data?.length) {
      throw new BadRequestException(
        'No WhatsApp Business Account found on your Meta account',
      );
    }
    const waba = wabaData.data[0];

    // Get phone numbers for that WABA
    const phoneRes = await fetch(
      `${GRAPH_BASE}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${longToken}`,
    );
    const phoneData = (await phoneRes.json()) as {
      data?: Array<{ id: string; display_phone_number: string; verified_name: string }>;
      error?: { message: string };
    };
    if (!phoneData.data?.length) {
      throw new BadRequestException(
        'No phone number found on your WhatsApp Business Account',
      );
    }
    const phone = phoneData.data[0];

    // Create account and save all credentials in one step
    const account = await this.prisma.whatsAppAccount.create({
      data: {
        workspaceId,
        name,
        phone: phone.display_phone_number,
        providerType: 'CLOUD',
        cloudPhoneNumberId: phone.id,
        cloudAccessToken: longToken,
        cloudWabaId: waba.id,
      },
    });

    // Subscribe WABA to this app's webhook (best-effort)
    await this.subscribeWabaToWebhook(waba.id, longToken);

    this.logger.log(
      `Embedded Signup complete: account=${account.id} waba=${waba.id} phoneId=${phone.id}`,
    );
    return account;
  }

  private async subscribeWabaToWebhook(wabaId: string, accessToken: string): Promise<void> {
    try {
      const res = await fetch(`${GRAPH_BASE}/${wabaId}/subscribed_apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: accessToken }).toString(),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: { message: string };
      };
      if (!body.success) {
        this.logger.warn(
          `WABA ${wabaId} webhook subscription failed: ${body.error?.message ?? JSON.stringify(body)}`,
        );
      }
    } catch (err) {
      this.logger.warn(`WABA ${wabaId} webhook subscription error:`, err);
    }
  }

  async saveCloudCredentials(
    workspaceId: string,
    accountId: string,
    data: { cloudPhoneNumberId: string; cloudAccessToken: string; cloudWabaId?: string; phone?: string },
  ) {
    const account = await this.findOne(workspaceId, accountId);
    if (account.providerType !== 'CLOUD') {
      throw new BadRequestException('Only CLOUD accounts support manual credential configuration');
    }
    return this.prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: {
        cloudPhoneNumberId: data.cloudPhoneNumberId,
        cloudAccessToken: data.cloudAccessToken,
        cloudWabaId: data.cloudWabaId ?? null,
        phone: data.phone ?? null,
      },
    });
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
   * Build the Meta OAuth URL for WhatsApp Embedded Signup.
   * Stores { workspaceId, accountId } in Redis under a CSRF state token (10 min TTL).
   * The callback handler reads this state to know which account to update.
   */
  async buildMetaOAuthUrl(workspaceId: string, accountId: string): Promise<string> {
    const appId =
      this.config.get<string>('META_APP_ID') ??
      this.config.get<string>('FACEBOOK_APP_ID') ??
      '';
    if (!appId) {
      throw new BadRequestException(
        'Meta app not configured — set META_APP_ID (or FACEBOOK_APP_ID) env var',
      );
    }

    const account = await this.findOne(workspaceId, accountId);
    if (account.providerType !== 'CLOUD') {
      throw new BadRequestException('Meta Embedded Signup is only available for Cloud API accounts');
    }

    const state = randomUUID();
    await this.redis.redis.set(
      `meta:wa:oauth:${state}`,
      JSON.stringify({ workspaceId, accountId }),
      'EX',
      OAUTH_STATE_TTL,
    );

    const apiUrl =
      this.config.get<string>('API_URL') ??
      this.config.get<string>('API_PUBLIC_URL') ??
      'http://localhost:3001';
    const callbackUrl = `${apiUrl}/webhooks/whatsapp/meta-callback`;

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: callbackUrl,
      scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
      response_type: 'code',
      state,
    });

    this.logger.log(`Built Meta OAuth URL for account ${accountId}`);
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  }
}
