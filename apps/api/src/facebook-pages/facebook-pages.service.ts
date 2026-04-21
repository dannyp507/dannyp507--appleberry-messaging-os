import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { randomUUID } from 'crypto';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

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

@Injectable()
export class FacebookPagesService {
  private readonly logger = new Logger(FacebookPagesService.name);

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
  private get redirectUri() {
    const apiUrl = this.config.get<string>('API_URL') ?? 'http://localhost:3001';
    return `${apiUrl}/facebook/callback`;
  }
  private get frontendUrl() {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  }

  /** Build the Facebook OAuth URL and store a short-lived state → workspaceId mapping */
  async buildAuthUrl(workspaceId: string): Promise<string> {
    const state = randomUUID();
    // Store state in Redis for 10 minutes
    await this.redis.redis.set(`fb:oauth:${state}`, workspaceId, 'EX', 600);

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      scope: 'pages_messaging,pages_manage_metadata,pages_read_engagement',
      response_type: 'code',
      state,
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  }

  /** Handle the OAuth callback: exchange code → user token → long-lived → pages */
  async handleCallback(code: string, state: string): Promise<string> {
    // Look up workspaceId from Redis state
    const workspaceId = await this.redis.redis.get(`fb:oauth:${state}`);
    if (!workspaceId) {
      return `${this.frontendUrl}/facebook-pages?error=invalid_state`;
    }
    await this.redis.redis.del(`fb:oauth:${state}`);

    try {
      // Step 1: Exchange code for short-lived user access token
      const tokenRes = await fetch(
        `${GRAPH_BASE}/oauth/access_token?` +
          new URLSearchParams({
            client_id: this.appId,
            client_secret: this.appSecret,
            redirect_uri: this.redirectUri,
            code,
          }),
      );
      const tokenData = (await tokenRes.json()) as FbTokenResponse & { error?: { message: string } };
      if (!tokenData.access_token) {
        this.logger.error('Token exchange failed', tokenData);
        return `${this.frontendUrl}/facebook-pages?error=token_exchange_failed`;
      }
      const shortToken = tokenData.access_token;

      // Step 2: Exchange for long-lived user token (60 days)
      const longRes = await fetch(
        `${GRAPH_BASE}/oauth/access_token?` +
          new URLSearchParams({
            grant_type: 'fb_exchange_token',
            client_id: this.appId,
            client_secret: this.appSecret,
            fb_exchange_token: shortToken,
          }),
      );
      const longData = (await longRes.json()) as FbTokenResponse;
      const longToken = longData.access_token ?? shortToken;

      // Step 3: Get pages the user manages (page tokens are already permanent)
      const pagesRes = await fetch(
        `${GRAPH_BASE}/me/accounts?fields=id,name,category,access_token&access_token=${longToken}`,
      );
      const pagesData = (await pagesRes.json()) as { data?: FbPageEntry[]; error?: { message: string } };

      if (!pagesData.data?.length) {
        this.logger.warn(`No pages found for workspace ${workspaceId}`);
        return `${this.frontendUrl}/facebook-pages?error=no_pages`;
      }

      // Step 4: Upsert each page into the database
      let savedCount = 0;
      for (const page of pagesData.data) {
        await this.prisma.facebookPage.upsert({
          where: {
            workspaceId_pageId: { workspaceId, pageId: page.id },
          },
          create: {
            workspaceId,
            pageId: page.id,
            name: page.name,
            category: page.category ?? null,
            pageAccessToken: page.access_token,
            isActive: true,
          },
          update: {
            name: page.name,
            category: page.category ?? null,
            pageAccessToken: page.access_token,
            isActive: true,
          },
        });

        // Step 5: Subscribe the page to webhook events.
        // This is required in addition to the app-level webhook URL — without it,
        // Meta will NOT deliver events for this page even if the webhook URL is set.
        await this.subscribePageToWebhook(page.id, page.access_token);

        savedCount++;
      }

      this.logger.log(`Connected ${savedCount} Facebook page(s) for workspace ${workspaceId}`);
      return `${this.frontendUrl}/facebook-pages?connected=${savedCount}`;
    } catch (err) {
      this.logger.error('Facebook OAuth callback error', err);
      return `${this.frontendUrl}/facebook-pages?error=unknown`;
    }
  }

  list(workspaceId: string) {
    return this.prisma.facebookPage.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        pageId: true,
        name: true,
        category: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { inboxThreads: true } },
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    const page = await this.prisma.facebookPage.findFirst({
      where: { id, workspaceId },
    });
    if (!page) throw new NotFoundException('Facebook page not found');
    await this.prisma.facebookPage.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Subscribe a Facebook Page to webhook events for this app.
   * Must be called after OAuth connect — this is separate from the app-level
   * webhook URL and controls whether Meta actually delivers events for this page.
   * Safe to call multiple times (idempotent).
   */
  async subscribePageToWebhook(pageId: string, pageAccessToken: string): Promise<void> {
    const res = await fetch(
      `${GRAPH_BASE}/${pageId}/subscribed_apps`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          subscribed_fields: 'messages,messaging_postbacks,message_deliveries,message_reads',
          access_token: pageAccessToken,
        }).toString(),
      },
    );
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message: string } };
    if (!body.success) {
      this.logger.error(`Failed to subscribe page ${pageId} to webhook: ${body.error?.message ?? JSON.stringify(body)}`);
    } else {
      this.logger.log(`Page ${pageId} subscribed to webhook fields: messages, messaging_postbacks, message_deliveries, message_reads`);
    }
  }

  /** Send a text message via the Messenger Graph API */
  async sendMessage(pageAccessToken: string, recipientId: string, text: string): Promise<void> {
    const res = await fetch(`${GRAPH_BASE}/me/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        messaging_type: 'RESPONSE',
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message: string } };
      const msg = body.error?.message ?? `HTTP ${res.status}`;
      this.logger.error(`FB sendMessage failed: ${msg} → recipient=${recipientId}`);
      throw new Error(`Facebook send failed: ${msg}`);
    }
    this.logger.log(`FB message sent to ${recipientId}`);
  }

  /** Look up a page by its Facebook page ID (for webhook dispatch) */
  findByPageId(pageId: string) {
    return this.prisma.facebookPage.findFirst({
      where: { pageId, isActive: true },
    });
  }
}
