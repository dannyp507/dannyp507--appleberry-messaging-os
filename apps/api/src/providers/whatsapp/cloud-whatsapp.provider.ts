import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { WhatsAppProvider } from './whatsapp-provider.interface';

/**
 * Meta WhatsApp Cloud API provider.
 *
 * Credentials are resolved per-account from the DB (cloudAccessToken /
 * cloudPhoneNumberId columns set during Embedded Signup).  When those fields
 * are absent the provider falls back to the global WHATSAPP_TOKEN /
 * WHATSAPP_PHONE_ID env vars so that single-account deployments keep working
 * without any migration.
 */
@Injectable()
export class CloudWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger(CloudWhatsAppProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async sendText(to: string, message: string, accountId?: string): Promise<void> {
    const { token, phoneNumberId } = await this.resolveCredentials(accountId);
    const recipient = to.replace(/\D/g, '');
    if (!recipient) {
      throw new Error('Invalid recipient phone for WhatsApp Cloud API');
    }

    const version = this.config.get<string>('WHATSAPP_GRAPH_VERSION', 'v21.0');
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: { preview_url: false, body: message },
      }),
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const errMsg =
        typeof body.error === 'object' &&
        body.error !== null &&
        'message' in body.error
          ? String((body.error as { message?: string }).message)
          : JSON.stringify(body);
      this.logger.error(`WhatsApp Cloud API error ${res.status}: ${errMsg}`);
      throw new Error(`WhatsApp Cloud API: ${errMsg}`);
    }

    this.logger.log(`WhatsApp Cloud sent message to=${recipient} account=${accountId ?? 'env'}`);
  }

  async sendMedia(
    to: string,
    filePath: string,
    caption: string | undefined,
    accountId?: string,
  ): Promise<void> {
    // Cloud API media requires uploading to Meta's media API first to obtain a
    // media_id — that flow is not yet implemented.  Fall back to sending the
    // caption as a text message so the customer receives something.
    this.logger.warn(
      `CloudWhatsAppProvider.sendMedia not implemented — sending caption only ` +
      `to=${to} file=${filePath} account=${accountId ?? 'env'}`,
    );
    if (caption) {
      await this.sendText(to, caption, accountId);
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Return the token and phoneNumberId to use for this send.
   * Priority: DB account row → env vars.
   */
  private async resolveCredentials(
    accountId?: string,
  ): Promise<{ token: string; phoneNumberId: string }> {
    if (accountId) {
      const account = await this.prisma.whatsAppAccount.findUnique({
        where: { id: accountId },
        select: { cloudAccessToken: true, cloudPhoneNumberId: true },
      });

      if (account?.cloudAccessToken && account?.cloudPhoneNumberId) {
        return {
          token: account.cloudAccessToken,
          phoneNumberId: account.cloudPhoneNumberId,
        };
      }
    }

    // Fall back to global env vars (single-account / legacy deployments)
    const token = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_ID');

    if (!token || !phoneNumberId) {
      throw new Error(
        `WhatsApp Cloud API credentials not found for account ${accountId ?? '(none)'}.` +
        ' Set cloudAccessToken + cloudPhoneNumberId on the account, or configure' +
        ' WHATSAPP_TOKEN + WHATSAPP_PHONE_ID env vars as a fallback.',
      );
    }

    return { token, phoneNumberId };
  }
}
