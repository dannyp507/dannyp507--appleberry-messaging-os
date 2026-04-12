import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WhatsAppProvider } from './whatsapp-provider.interface';

/**
 * Meta WhatsApp Cloud API — text messages.
 * Requires WHATSAPP_TOKEN and WHATSAPP_PHONE_ID (Phone number ID from Meta app).
 */
@Injectable()
export class CloudWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger(CloudWhatsAppProvider.name);

  constructor(private readonly config: ConfigService) {}

  async sendText(to: string, message: string): Promise<void> {
    const token = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_ID');
    if (!token || !phoneNumberId) {
      throw new Error(
        'WhatsApp Cloud API is not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID)',
      );
    }

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

    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

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

    this.logger.log(`WhatsApp Cloud sent message to=${recipient}`);
  }
}
