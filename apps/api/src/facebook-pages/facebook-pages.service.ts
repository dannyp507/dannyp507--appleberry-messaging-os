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
  /** Optional Facebook Login for Business config_id.
   *  When set, the OAuth URL uses the FLfB dialog (required for published apps
   *  that only have "Facebook Login for Business" enabled, not classic FB Login).
   */
  private get fbConfigId() {
    return this.config.get<string>('FACEBOOK_CONFIG_ID') ?? '';
  }

  /** Build the Facebook OAuth URL and store a short-lived state → workspaceId mapping */
  async buildAuthUrl(workspaceId: string): Promise<string> {
    const state = randomUUID();
    // Store state in Redis for 10 minutes
    await this.redis.redis.set(`fb:oauth:${state}`, workspaceId, 'EX', 600);

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state,
      // auth_type=rerequest forces Facebook to show the full page-selection dialog
      // even when the user has previously authorized this app, so they can add/remove pages.
      auth_type: 'rerequest',
    });

    // If a Facebook Login for Business config_id is set, use it instead of
    // listing scopes manually — the config defines the permissions in Meta's
    // dashboard and avoids the "Feature Unavailable" error on published apps.
    if (this.fbConfigId) {
      params.set('config_id', this.fbConfigId);
    } else {
      params.set('scope', 'pages_messaging,pages_manage_metadata,pages_show_list');
    }

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

      // Step 3: Get ALL pages the user manages.
      // Source A — personal pages via /me/accounts (follow pagination cursors).
      // Source B — Business Manager pages via /me/businesses → /{businessId}/owned_pages.
      // Both sources are merged and de-duplicated by page ID.
      const pageMap = new Map<string, FbPageEntry>();

      // Source A: personal pages
      let nextUrl: string | null =
        `${GRAPH_BASE}/me/accounts?fields=id,name,category,access_token&limit=200&access_token=${longToken}`;

      while (nextUrl) {
        const pageRes = await fetch(nextUrl);
        const pageJson = (await pageRes.json()) as {
          data?: FbPageEntry[];
          paging?: { cursors?: { after?: string }; next?: string };
          error?: { message: string };
        };
        if (pageJson.error) {
          this.logger.error('Error fetching /me/accounts', pageJson.error.message);
          break;
        }
        if (pageJson.data?.length) {
          for (const p of pageJson.data) pageMap.set(p.id, p);
        }
        nextUrl = pageJson.paging?.next ?? null;
      }

      // Source B: Business Manager pages
      try {
        const bizRes = await fetch(
          `${GRAPH_BASE}/me/businesses?fields=id,name&limit=100&access_token=${longToken}`,
        );
        const bizJson = (await bizRes.json()) as {
          data?: { id: string; name: string }[];
          error?: { message: string };
        };
        if (bizJson.error) {
          this.logger.warn('Could not fetch /me/businesses: ' + bizJson.error.message);
        } else if (bizJson.data?.length) {
          this.logger.log(`Found ${bizJson.data.length} Business Manager account(s)`);
          for (const biz of bizJson.data) {
            let bizNextUrl: string | null =
              `${GRAPH_BASE}/${biz.id}/owned_pages?fields=id,name,category,access_token&limit=200&access_token=${longToken}`;
            while (bizNextUrl) {
              const bizPageRes = await fetch(bizNextUrl);
              const bizPageJson = (await bizPageRes.json()) as {
                data?: FbPageEntry[];
                paging?: { next?: string };
                error?: { message: string };
              };
              if (bizPageJson.error) {
                this.logger.warn(
                  `Could not fetch owned_pages for business ${biz.id}: ${bizPageJson.error.message}`,
                );
                break;
              }
              if (bizPageJson.data?.length) {
                for (const p of bizPageJson.data) pageMap.set(p.id, p);
              }
              bizNextUrl = bizPageJson.paging?.next ?? null;
            }
          }
        }
      } catch (bizErr) {
        // Non-fatal — still proceed with personal pages if Business Manager lookup fails
        this.logger.warn('Business Manager page lookup failed', bizErr);
      }

      // For pages that came back without an access_token (common for Business Manager
      // pages), try to resolve the token individually. The user-level token can fetch
      // a page token via GET /{pageId}?fields=access_token as long as the user has an
      // admin role on that page.
      const tokenlessPages = Array.from(pageMap.values()).filter((p) => !p.access_token);
      if (tokenlessPages.length) {
        this.logger.log(`Attempting to resolve tokens for ${tokenlessPages.length} tokenless page(s)`);
        await Promise.all(
          tokenlessPages.map(async (page) => {
            try {
              const r = await fetch(
                `${GRAPH_BASE}/${page.id}?fields=id,name,category,access_token&access_token=${longToken}`,
              );
              const j = (await r.json()) as FbPageEntry & { error?: { message: string } };
              if (j.access_token) {
                pageMap.set(page.id, { ...page, access_token: j.access_token });
                this.logger.log(`Resolved token for page ${page.id} (${page.name})`);
              } else {
                this.logger.warn(
                  `Could not resolve token for page ${page.id} (${page.name}): ${j.error?.message ?? 'no token in response'}`,
                );
              }
            } catch {
              this.logger.warn(`Token resolution failed for page ${page.id}`);
            }
          }),
        );
      }

      // Only keep pages that have a valid access_token — pages we still can't
      // get a token for cannot receive webhooks or send messages.
      const allPages = Array.from(pageMap.values()).filter((p) => !!p.access_token);

      if (!allPages.length) {
        this.logger.warn(`No pages found for workspace ${workspaceId}`);
        return `${this.frontendUrl}/facebook-pages?error=no_pages`;
      }

      // Step 4: Store all pages in Redis and redirect to the page-picker UI
      // so the user can choose which page(s) to connect.
      const pendingToken = randomUUID();
      await this.redis.redis.set(
        `fb:pending:${pendingToken}`,
        JSON.stringify({ workspaceId, pages: allPages }),
        'EX',
        600, // 10-minute window to complete selection
      );

      this.logger.log(
        `Stored ${allPages.length} page(s) for workspace ${workspaceId} pending selection`,
      );
      return `${this.frontendUrl}/facebook-pages?pending=${pendingToken}`;
    } catch (err) {
      this.logger.error('Facebook OAuth callback error', err);
      return `${this.frontendUrl}/facebook-pages?error=unknown`;
    }
  }

  /** Return the pending page list for a given selection token (no auth needed
   *  beyond knowing the token — it's single-use and expires in 10 min). */
  async getPendingPages(token: string) {
    const raw = await this.redis.redis.get(`fb:pending:${token}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as { workspaceId: string; pages: FbPageEntry[] };
    // Return page list without access tokens (frontend doesn't need them)
    return {
      token,
      pages: data.pages.map((p) => ({
        pageId: p.id,
        name: p.name,
        category: p.category ?? null,
      })),
    };
  }

  /** Save the user-selected pages and subscribe them to webhooks. */
  async confirmPages(token: string, selectedPageIds: string[]): Promise<{ connected: number }> {
    const raw = await this.redis.redis.get(`fb:pending:${token}`);
    if (!raw) throw new Error('Selection token expired or invalid');

    const data = JSON.parse(raw) as { workspaceId: string; pages: FbPageEntry[] };

    const { workspaceId, pages } = data;
    const toConnect = selectedPageIds.length
      ? pages.filter((p) => selectedPageIds.includes(p.id))
      : pages; // fallback: connect all if none specified

    // Delete the Redis token AFTER we've finished saving, so that a mid-loop
    // Prisma error doesn't consume the token and prevent retries.
    let savedCount = 0;
    for (const page of toConnect) {
      if (!page.access_token) {
        this.logger.warn(`Skipping page ${page.id} (${page.name}): no access_token`);
        continue;
      }
      await this.prisma.facebookPage.upsert({
        where: { workspaceId_pageId: { workspaceId, pageId: page.id } },
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
      await this.subscribePageToWebhook(page.id, page.access_token);
      savedCount++;
    }

    // Token consumed — delete only after successful saves so retries work if
    // an error occurred mid-loop.
    await this.redis.redis.del(`fb:pending:${token}`);

    this.logger.log(`Confirmed ${savedCount} Facebook page(s) for workspace ${workspaceId}`);
    return { connected: savedCount };
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
