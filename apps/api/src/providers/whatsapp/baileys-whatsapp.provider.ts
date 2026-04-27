import { Injectable } from '@nestjs/common';
import { BaileysSessionService } from '../../baileys/baileys-session.service';
import type { ButtonItem, ListSection, WhatsAppProvider } from './whatsapp-provider.interface';

@Injectable()
export class BaileysWhatsAppProvider implements WhatsAppProvider {
  constructor(private readonly baileys: BaileysSessionService) {}

  async sendText(to: string, message: string, accountId?: string): Promise<void> {
    if (!accountId) throw new Error('accountId required for BAILEYS provider');
    await this.baileys.sendText(accountId, to, message);
  }

  async sendMedia(to: string, filePath: string, caption: string | undefined, accountId?: string): Promise<void> {
    if (!accountId) throw new Error('accountId required for BAILEYS provider');
    await this.baileys.sendMedia(accountId, to, filePath, caption);
  }

  async sendButtons(
    to: string,
    body: string,
    buttons: ButtonItem[],
    header?: string,
    footer?: string,
    accountId?: string,
  ): Promise<void> {
    if (!accountId) throw new Error('accountId required for BAILEYS provider');
    await this.baileys.sendButtons(accountId, to, body, buttons, header, footer);
  }

  async sendList(
    to: string,
    body: string,
    buttonText: string,
    sections: ListSection[],
    header?: string,
    footer?: string,
    accountId?: string,
  ): Promise<void> {
    if (!accountId) throw new Error('accountId required for BAILEYS provider');
    await this.baileys.sendList(accountId, to, body, buttonText, sections, header, footer);
  }
}
