import { Injectable } from '@nestjs/common';
import { BaileysSessionService } from '../../baileys/baileys-session.service';
import type { WhatsAppProvider } from './whatsapp-provider.interface';

@Injectable()
export class BaileysWhatsAppProvider implements WhatsAppProvider {
  constructor(private readonly baileys: BaileysSessionService) {}

  // accountId must be passed in; the factory will inject it per-send
  async sendText(to: string, message: string, accountId?: string): Promise<void> {
    if (!accountId) throw new Error('accountId required for BAILEYS provider');
    await this.baileys.sendText(accountId, to, message);
  }

  async sendMedia(to: string, filePath: string, caption: string | undefined, accountId?: string): Promise<void> {
    if (!accountId) throw new Error('accountId required for BAILEYS provider');
    await this.baileys.sendMedia(accountId, to, filePath, caption);
  }
}
