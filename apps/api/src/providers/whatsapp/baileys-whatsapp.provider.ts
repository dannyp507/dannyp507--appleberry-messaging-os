import { Injectable, Logger } from '@nestjs/common';
import type { WhatsAppProvider } from './whatsapp-provider.interface';
import { BaileysSessionManager } from './baileys-session.manager';

@Injectable()
export class BaileysWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger(BaileysWhatsAppProvider.name);

  constructor(private readonly sessions: BaileysSessionManager) {}

  async sendText(to: string, message: string, accountId?: string): Promise<void> {
    if (!accountId) {
      throw new Error('BaileysWhatsAppProvider requires accountId to look up socket');
    }

    const sock = this.sessions.getSocket(accountId);
    if (!sock) {
      throw new Error(`No active Baileys session for account ${accountId}`);
    }

    // Format: strip non-digits, append @s.whatsapp.net
    const jid = `${to.replace(/\D/g, '')}@s.whatsapp.net`;

    await sock.sendMessage(jid, { text: message });
    this.logger.log(`[BAILEYS] sent to=${jid}`);
  }
}
