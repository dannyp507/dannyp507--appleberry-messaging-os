import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { WhatsAppProvider } from './whatsapp-provider.interface';
import type { WaInteractive, CloudApiCredentials } from '../../whatsapp-cloud/whatsapp-cloud.types';

/**
 * Meta WhatsApp Cloud API provider.
 *
 * Credential resolution order:
 *   1. Per-account credentials stored in WhatsAppAccount.credentials JSON field
 *   2. Legacy ENV fallback (WHATSAPP_TOKEN + WHATSAPP_PHONE_ID) for backwards compat
 */
@Injectable()
export class CloudWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger(CloudWhatsAppProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Credential lookup ──────────────────────────────────────────────────────

  private async resolveCredentials(accountId?: string): Promise<{
    phoneNumberId: string;
    accessToken: string;
    graphVersion: string;
  }> {
    if (accountId) {
      const account = await this.prisma.whatsAppAccount.findUnique({
        where: { id: accountId },
        select: { credentials: true },
      });
      const creds = account?.credentials as unknown as CloudApiCredentials | null;
      if (creds?.phoneNumberId && creds?.accessToken) {
        return {
          phoneNumberId: creds.phoneNumberId,
          accessToken: creds.accessToken,
          graphVersion: creds.graphVersion ?? this.config.get('WHATSAPP_GRAPH_VERSION', 'v21.0'),
        };
      }
    }

    // Legacy ENV fallback
    const token = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_ID');
    if (token && phoneNumberId) {
      return {
        phoneNumberId,
        accessToken: token,
        graphVersion: this.config.get('WHATSAPP_GRAPH_VERSION', 'v21.0'),
      };
    }

    throw new Error(
      accountId
        ? `Cloud API credentials not configured for account ${accountId}`
        : 'Cloud API not configured — set WHATSAPP_TOKEN + WHATSAPP_PHONE_ID or store credentials on the account',
    );
  }

  // ── Shared HTTP helper ─────────────────────────────────────────────────────

  private async callMessagesApi(
    phoneNumberId: string,
    accessToken: string,
    graphVersion: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...body,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errMsg =
        typeof json.error === 'object' &&
        json.error !== null &&
        'message' in json.error
          ? String((json.error as { message?: string }).message)
          : JSON.stringify(json);
      this.logger.error(`Cloud API ${res.status}: ${errMsg}`);
      throw new Error(`WhatsApp Cloud API: ${errMsg}`);
    }
  }

  // ── Public send methods ────────────────────────────────────────────────────

  async sendText(to: string, message: string, accountId?: string): Promise<void> {
    const { phoneNumberId, accessToken, graphVersion } =
      await this.resolveCredentials(accountId);
    const recipient = to.replace(/\D/g, '');
    if (!recipient) throw new Error('Invalid recipient phone number');

    await this.callMessagesApi(phoneNumberId, accessToken, graphVersion, {
      to: recipient,
      type: 'text',
      text: { preview_url: false, body: message },
    });
    this.logger.log(`Cloud API text → ${recipient} (account=${accountId ?? 'env'})`);
  }

  async sendInteractive(
    to: string,
    interactive: WaInteractive,
    accountId?: string,
  ): Promise<void> {
    const { phoneNumberId, accessToken, graphVersion } =
      await this.resolveCredentials(accountId);
    const recipient = to.replace(/\D/g, '');
    if (!recipient) throw new Error('Invalid recipient phone number');

    await this.callMessagesApi(phoneNumberId, accessToken, graphVersion, {
      to: recipient,
      type: 'interactive',
      interactive,
    });
    this.logger.log(
      `Cloud API interactive(${interactive.type}) → ${recipient} (account=${accountId ?? 'env'})`,
    );
  }

  async sendMedia(
    to: string,
    filePath: string,
    caption: string | undefined,
    accountId?: string,
  ): Promise<void> {
    // Cloud API media sends require hosted URLs, not local paths.
    // Fall back to sending the caption as plain text until media upload is implemented.
    this.logger.warn(
      `CloudWhatsAppProvider.sendMedia not yet implemented — sending caption as text to=${to}`,
    );
    if (caption) await this.sendText(to, caption, accountId);
  }
}
