import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { randomUUID } from 'crypto';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
// Instagram Business Login tokens must be used with graph.instagram.com
const IG_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;

interface FbTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface FbPageEntry {
  id: string;
  name: string;
  category?: string;
  access_token: string;
}

interface IgBusinessAccount {
  id: string;
  username?: string;
  name?: string;
}

interface IgTokenResponse {
  access_token: string;
  user_id?: number;
  error_message?: string;
  error_type?: string;
}

interface IgMeResponse {
  user_id?: string;
  username?: string;
  name?: string;
  error?: { message: string };
}

@Injectable()
export class InstagramAccountsService {
  private readonly logger = new Logger(InstagramAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private get appId() {
    return this.config.get<string>('FACEBOOK_APP_ID') ?? '';
  }
  private get appSecret() {
    return this.config.get<string>('FACEBOOK_APP_SECRET') ?? '';
  }
  /**
   * Instagram OAuth client_id.
   * Uses INSTAGRAM_APP_ID if explicitly set; otherwise falls back to the parent
   * Facebook app ID (FACEBOOK_APP_ID). For Instagram Business Login the parent
   * app ID (e.g. 1458836185143612) is the correct client_id — do NOT set this
   * to a Meta-internal/first-party sub-app ID.
   */
  private get igAppId() {
    return this.config.get<string>('INSTAGRAM_APP_ID') ?? this.appId;
  }
  /**
   * Instagram OAuth client_secret — must match the app whose ID is used above.
   * Falls back to FACEBOOK_APP_SECRET when INSTAGRAM_APP_SECRET is not set.
   */
  private get igAppSecret() {
    return this.config.get<string>('INSTAGRAM_APP_SECRET') ?? this.appSecret;
  }
  private get redirectUri() {
    // Reuse the Facebook callback URL — it's already whitelisted in Meta app settings.
    // The state prefix (ig:oauth: vs fb:oauth:) distinguishes the two flows.
    const apiUrl = this.config.get<string>('API_PUBLIC_URL') ?? this.config.get<string>('API_URL') ?? 'http://localhost:3001';
    return `${apiUrl}/facebook/callback`;
  }
  private get frontendUrl() {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  }
  private get fbConfigId() {
    return this.config.get<string>('FACEBOOK_CONFIG_ID') ?? '';
  }

  /** Returns true when this state UUID belongs to an Instagram OAuth flow */
  async isInstagramOAuthState(state: string): Promise<boolean> {
    const val = await this.redis.redis.get(`ig:oauth:${state}`);
    return val !== null;
  }

  /**
   * Build the Instagram Business Login OAuth URL.
   * Uses www.instagram.com/oauth/authorize with the Instagram sub-app ID
   * (INSTAGRAM_APP_ID = 2989024921287659, shown in Meta console embed URL).
   * Redirect URI must be registered in Meta → Instagram → Business login settings.
   */
  async buildAuthUrl(workspaceId: string): Promise<string> {
    const state = randomUUID();
    await this.redis.redis.set(`ig:oauth:${state}`, workspaceId, 'EX', 600);

    const params = new URLSearchParams({
      client_id: this.igAppId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state,
    });

    // Scope must use instagram_business_* variants (not instagram_manage_*)
    const scope = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments';

    return `https://www.instagram.com/oauth/authorize?force_reauth=true&${params.toString()}&scope=${scope}`;
  }

  /** Handle the OAuth callback: exchange code → Instagram user token → long-lived → save */
  async handleCallback(code: string, state: string): Promise<string> {
    const workspaceId = await this.redis.redis.get(`ig:oauth:${state}`);
    if (!workspaceId) {
      return `${this.frontendUrl}/instagram-accounts?error=invalid_state`;
    }
    await this.redis.redis.del(`ig:oauth:${state}`);

    try {
      // Step 1: Exchange code for short-lived Instagram user access token
      const exchangeBody = new URLSearchParams({
        client_id: this.igAppId,
        client_secret: this.igAppSecret,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
        code,
      });
      const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: exchangeBody,
      });
      const tokenData = (await tokenRes.json()) as IgTokenResponse;
      if (!tokenData.access_token) {
        this.logger.error('Instagram token exchange failed', tokenData);
        return `${this.frontendUrl}/instagram-accounts?error=token_exchange_failed`;
      }
      const shortToken = tokenData.access_token;
      const rawUserId = tokenData.user_id?.toString();

      // Step 2: Exchange for long-lived Instagram user token (60 days)
      const longRes = await fetch(
        `https://graph.instagram.com/access_token?` +
          new URLSearchParams({
            grant_type: 'ig_exchange_token',
            client_secret: this.igAppSecret,
            access_token: shortToken,
          }),
      );
      const longData = (await longRes.json()) as { access_token?: string; error?: { message: string } };
      const longToken = longData.access_token ?? shortToken;

      // Step 3: Get Instagram user info
      const meRes = await fetch(
        `https://graph.instagram.com/me?fields=user_id,username,name&access_token=${longToken}`,
      );
      const meData = (await meRes.json()) as IgMeResponse;
      const igUserId = meData.user_id?.toString() ?? rawUserId ?? '';
      const username = meData.username ?? null;
      const name = meData.name ?? username ?? 'Instagram Account';

      if (!igUserId) {
        this.logger.error('Could not determine Instagram user ID', meData);
        return `${this.frontendUrl}/instagram-accounts?error=no_ig_user`;
      }

      this.logger.log(`Instagram Login: @${username ?? igUserId} (ID: ${igUserId})`);

      // Step 4: Store pending account for confirmation
      const pendingToken = randomUUID();
      await this.redis.redis.set(
        `ig:pending:${pendingToken}`,
        JSON.stringify({
          workspaceId,
          accounts: [{ igUserId, username, name, pageAccessToken: longToken, linkedFbPageId: null }],
        }),
        'EX',
        600,
      );

      return `${this.frontendUrl}/instagram-accounts?pending=${pendingToken}`;
    } catch (err) {
      this.logger.error('Instagram OAuth callback error', err);
      return `${this.frontendUrl}/instagram-accounts?error=unknown`;
    }
  }

  /** Return the pending Instagram accounts for a given selection token */
  async getPendingAccounts(token: string) {
    const raw = await this.redis.redis.get(`ig:pending:${token}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as {
      workspaceId: string;
      accounts: Array<{
        igUserId: string;
        username: string | null;
        name: string;
        pageAccessToken: string;
        linkedFbPageId: string;
      }>;
    };
    return {
      token,
      accounts: data.accounts.map((a) => ({
        igUserId: a.igUserId,
        username: a.username,
        name: a.name,
        linkedFbPageId: a.linkedFbPageId,
      })),
    };
  }

  /** Save the user-selected Instagram accounts and subscribe them to webhooks */
  async confirmAccounts(
    token: string,
    selectedIgUserIds: string[],
  ): Promise<{ connected: number }> {
    const raw = await this.redis.redis.get(`ig:pending:${token}`);
    if (!raw) throw new Error('Selection token expired or invalid');

    const data = JSON.parse(raw) as {
      workspaceId: string;
      accounts: Array<{
        igUserId: string;
        username: string | null;
        name: string;
        pageAccessToken: string;
        linkedFbPageId: string;
      }>;
    };

    const { workspaceId, accounts } = data;
    const toConnect = selectedIgUserIds.length
      ? accounts.filter((a) => selectedIgUserIds.includes(a.igUserId))
      : accounts;

    let savedCount = 0;
    for (const acc of toConnect) {
      await this.prisma.instagramAccount.upsert({
        where: { workspaceId_igUserId: { workspaceId, igUserId: acc.igUserId } },
        create: {
          workspaceId,
          igUserId: acc.igUserId,
          username: acc.username,
          name: acc.name,
          pageAccessToken: acc.pageAccessToken,
          linkedFbPageId: acc.linkedFbPageId,
          isActive: true,
        },
        update: {
          username: acc.username,
          name: acc.name,
          pageAccessToken: acc.pageAccessToken,
          linkedFbPageId: acc.linkedFbPageId,
          isActive: true,
        },
      });
      await this.subscribeToWebhook(acc.igUserId, acc.pageAccessToken);
      savedCount++;
    }

    await this.redis.redis.del(`ig:pending:${token}`);

    this.logger.log(`Confirmed ${savedCount} Instagram account(s) for workspace ${workspaceId}`);
    return { connected: savedCount };
  }

  /**
   * Discover Instagram Business accounts linked to already-connected Facebook Pages
   * for this workspace.  No new OAuth needed — we use the stored page access tokens.
   *
   * Returns a pending token (same shape as the OAuth flow) so the caller can open
   * the same account-picker UI and confirm which accounts to connect.
   * Returns { token: '', accounts: [] } when no pages are connected or no IG accounts
   * are linked.
   */
  async syncFromPages(workspaceId: string): Promise<{
    token: string;
    accounts: Array<{
      igUserId: string;
      username: string | null;
      name: string;
      linkedFbPageId: string | null;
    }>;
  }> {
    const pages = await this.prisma.facebookPage.findMany({
      where: { workspaceId, isActive: true },
    });

    if (pages.length === 0) {
      return { token: '', accounts: [] };
    }

    const found: Array<{
      igUserId: string;
      username: string | null;
      name: string;
      pageAccessToken: string;
      linkedFbPageId: string | null;
    }> = [];

    for (const page of pages) {
      try {
        const url =
          `${GRAPH_BASE}/${page.pageId}` +
          `?fields=instagram_business_account{id,username,name}` +
          `&access_token=${encodeURIComponent(page.pageAccessToken)}`;
        const res = await fetch(url);
        const body = (await res.json()) as {
          instagram_business_account?: IgBusinessAccount;
          error?: { message: string; code?: number };
        };

        if (body.error) {
          this.logger.warn(
            `Graph API error for page ${page.pageId}: ${body.error.message}`,
          );
          continue;
        }

        if (body.instagram_business_account) {
          const ig = body.instagram_business_account;
          this.logger.log(
            `Found linked IG account @${ig.username ?? ig.id} on FB page ${page.name}`,
          );
          found.push({
            igUserId: ig.id,
            username: ig.username ?? null,
            name: ig.name ?? ig.username ?? 'Instagram Account',
            pageAccessToken: page.pageAccessToken,
            linkedFbPageId: page.id,
          });
        } else {
          this.logger.debug(
            `No linked IG account on FB page ${page.name} (${page.pageId})`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to query IG account for page ${page.pageId}: ${String(err)}`,
        );
      }
    }

    if (found.length === 0) {
      return { token: '', accounts: [] };
    }

    // Deduplicate: same IG account could theoretically be linked to multiple pages
    const seen = new Set<string>();
    const unique = found.filter((a) => {
      if (seen.has(a.igUserId)) return false;
      seen.add(a.igUserId);
      return true;
    });

    const token = randomUUID();
    await this.redis.redis.set(
      `ig:pending:${token}`,
      JSON.stringify({ workspaceId, accounts: unique }),
      'EX',
      600,
    );

    return {
      token,
      accounts: unique.map((a) => ({
        igUserId: a.igUserId,
        username: a.username,
        name: a.name,
        linkedFbPageId: a.linkedFbPageId,
      })),
    };
  }

  list(workspaceId: string) {
    return this.prisma.instagramAccount.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        igUserId: true,
        username: true,
        name: true,
        linkedFbPageId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { inboxThreads: true } },
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    const account = await this.prisma.instagramAccount.findFirst({
      where: { id, workspaceId },
    });
    if (!account) throw new NotFoundException('Instagram account not found');
    await this.prisma.instagramAccount.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Subscribe an Instagram account to webhook events.
   * Subscribes the FB page (linked to the IG account) to receive Instagram messages.
   */
  async subscribeToWebhook(igUserId: string, pageAccessToken: string): Promise<void> {
    const res = await fetch(`${IG_GRAPH_BASE}/${igUserId}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        subscribed_fields: 'messages',
        access_token: pageAccessToken,
      }).toString(),
    });
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: { message: string; code?: number };
    };
    if (!body.success) {
      this.logger.error(
        `Failed to subscribe IG account ${igUserId} to webhook: ${body.error?.message ?? JSON.stringify(body)}`,
      );
    } else {
      this.logger.log(`Instagram account ${igUserId} subscribed to webhook fields: messages`);
    }
  }

  /** Send a text message via the Instagram Messaging Graph API */
  async sendMessage(
    igUserId: string,
    pageAccessToken: string,
    recipientId: string,
    text: string,
  ): Promise<void> {
    const res = await fetch(`${IG_GRAPH_BASE}/${igUserId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message: string } };
      const msg = body.error?.message ?? `HTTP ${res.status}`;
      this.logger.error(`IG sendMessage failed: ${msg} → recipient=${recipientId}`);
      throw new Error(`Instagram send failed: ${msg}`);
    }
    this.logger.log(`IG message sent to ${recipientId}`);
  }

  /** Look up an Instagram account by its IG user ID (for webhook dispatch) */
  findByIgUserId(igUserId: string) {
    return this.prisma.instagramAccount.findFirst({
      where: { igUserId, isActive: true },
    });
  }

  // ── AI Settings ────────────────────────────────────────────────────────────

  async getAiSettings(workspaceId: string, instagramAccountId: string) {
    const account = await this.prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, workspaceId },
    });
    if (!account) throw new NotFoundException('Instagram account not found');

    const row = await this.prisma.instagramAccountAiSettings.findUnique({
      where: { instagramAccountId },
    });
    return this.toPublicAiSettings(row);
  }

  async upsertAiSettings(
    workspaceId: string,
    instagramAccountId: string,
    dto: UpsertIgAiSettingsDto,
  ) {
    const account = await this.prisma.instagramAccount.findFirst({
      where: { id: instagramAccountId, workspaceId },
    });
    if (!account) throw new NotFoundException('Instagram account not found');

    const existing = await this.prisma.instagramAccountAiSettings.findUnique({
      where: { instagramAccountId },
    });

    const MASKED = '••••••••••••••••';
    const openaiApiKey =
      dto.openaiApiKey !== undefined && dto.openaiApiKey !== MASKED
        ? dto.openaiApiKey || null
        : existing?.openaiApiKey ?? null;

    const geminiApiKey =
      dto.geminiApiKey !== undefined && dto.geminiApiKey !== MASKED
        ? dto.geminiApiKey || null
        : existing?.geminiApiKey ?? null;

    const row = await this.prisma.instagramAccountAiSettings.upsert({
      where: { instagramAccountId },
      create: {
        instagramAccountId,
        aiProvider: dto.aiProvider ?? null,
        openaiApiKey,
        openaiModel: dto.openaiModel ?? null,
        geminiApiKey,
        geminiModel: dto.geminiModel ?? null,
        systemPrompt: dto.systemPrompt ?? null,
        dmAiEnabled: dto.dmAiEnabled ?? false,
        dmAiFallbackOnly: dto.dmAiFallbackOnly ?? true,
        dmWelcomeEnabled: dto.dmWelcomeEnabled ?? false,
        dmWelcomeText: dto.dmWelcomeText ?? null,
        dmDefaultReply: dto.dmDefaultReply ?? null,
        dmTypingEnabled: dto.dmTypingEnabled ?? false,
        aiOffKeyword: dto.aiOffKeyword ?? null,
        aiOffReply: dto.aiOffReply ?? null,
        aiOnKeyword: dto.aiOnKeyword ?? null,
        aiOnReply: dto.aiOnReply ?? null,
      },
      update: {
        ...(dto.aiProvider !== undefined && { aiProvider: dto.aiProvider || null }),
        openaiApiKey,
        ...(dto.openaiModel !== undefined && { openaiModel: dto.openaiModel || null }),
        geminiApiKey,
        ...(dto.geminiModel !== undefined && { geminiModel: dto.geminiModel || null }),
        ...(dto.systemPrompt !== undefined && { systemPrompt: dto.systemPrompt || null }),
        ...(dto.dmAiEnabled !== undefined && { dmAiEnabled: dto.dmAiEnabled }),
        ...(dto.dmAiFallbackOnly !== undefined && { dmAiFallbackOnly: dto.dmAiFallbackOnly }),
        ...(dto.dmWelcomeEnabled !== undefined && { dmWelcomeEnabled: dto.dmWelcomeEnabled }),
        ...(dto.dmWelcomeText !== undefined && { dmWelcomeText: dto.dmWelcomeText || null }),
        ...(dto.dmDefaultReply !== undefined && { dmDefaultReply: dto.dmDefaultReply || null }),
        ...(dto.dmTypingEnabled !== undefined && { dmTypingEnabled: dto.dmTypingEnabled }),
        ...(dto.aiOffKeyword !== undefined && { aiOffKeyword: dto.aiOffKeyword || null }),
        ...(dto.aiOffReply !== undefined && { aiOffReply: dto.aiOffReply || null }),
        ...(dto.aiOnKeyword !== undefined && { aiOnKeyword: dto.aiOnKeyword || null }),
        ...(dto.aiOnReply !== undefined && { aiOnReply: dto.aiOnReply || null }),
      },
    });

    return this.toPublicAiSettings(row);
  }

  /** Internal use only — returns raw (unmasked) IG account AI settings */
  async getAiSettingsRaw(instagramAccountId: string) {
    return this.prisma.instagramAccountAiSettings.findUnique({
      where: { instagramAccountId },
    });
  }

  private toPublicAiSettings(row: {
    aiProvider?: string | null;
    openaiApiKey?: string | null;
    openaiModel?: string | null;
    geminiApiKey?: string | null;
    geminiModel?: string | null;
    systemPrompt?: string | null;
    dmAiEnabled?: boolean;
    dmAiFallbackOnly?: boolean;
    dmWelcomeEnabled?: boolean;
    dmWelcomeText?: string | null;
    dmDefaultReply?: string | null;
    dmTypingEnabled?: boolean;
    aiOffKeyword?: string | null;
    aiOffReply?: string | null;
    aiOnKeyword?: string | null;
    aiOnReply?: string | null;
  } | null) {
    const MASKED = '••••••••••••••••';
    const maskKey = (k: string | null | undefined) => (k?.trim() ? MASKED : null);
    return {
      aiProvider: row?.aiProvider ?? null,
      openaiApiKey: maskKey(row?.openaiApiKey),
      openaiModel: row?.openaiModel ?? null,
      geminiApiKey: maskKey(row?.geminiApiKey),
      geminiModel: row?.geminiModel ?? null,
      systemPrompt: row?.systemPrompt ?? null,
      openaiKeySet: !!row?.openaiApiKey,
      geminiKeySet: !!row?.geminiApiKey,
      dmAiEnabled: row?.dmAiEnabled ?? false,
      dmAiFallbackOnly: row?.dmAiFallbackOnly ?? true,
      dmWelcomeEnabled: row?.dmWelcomeEnabled ?? false,
      dmWelcomeText: row?.dmWelcomeText ?? null,
      dmDefaultReply: row?.dmDefaultReply ?? null,
      dmTypingEnabled: row?.dmTypingEnabled ?? false,
      aiOffKeyword: row?.aiOffKeyword ?? null,
      aiOffReply: row?.aiOffReply ?? null,
      aiOnKeyword: row?.aiOnKeyword ?? null,
      aiOnReply: row?.aiOnReply ?? null,
    };
  }
}

export interface UpsertIgAiSettingsDto {
  aiProvider?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  systemPrompt?: string;
  dmAiEnabled?: boolean;
  dmAiFallbackOnly?: boolean;
  dmWelcomeEnabled?: boolean;
  dmWelcomeText?: string;
  dmDefaultReply?: string;
  dmTypingEnabled?: boolean;
  aiOffKeyword?: string;
  aiOffReply?: string;
  aiOnKeyword?: string;
  aiOnReply?: string;
}
