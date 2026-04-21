import { Injectable, Logger } from '@nestjs/common';
import type { WhatsAppProvider } from './whatsapp-provider.interface';

@Injectable()
export class MockWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger(MockWhatsAppProvider.name);

  async sendText(to: string, message: string): Promise<void> {
    this.logger.log(`[MOCK] sendText to=${to} message=${message}`);
  }

  async sendMedia(to: string, filePath: string, caption: string | undefined): Promise<void> {
    this.logger.log(`[MOCK] sendMedia to=${to} filePath=${filePath} caption=${caption ?? ''}`);
  }
}
