import { Injectable, Logger } from '@nestjs/common';
import type { WhatsAppProvider } from './whatsapp-provider.interface';

@Injectable()
export class MockWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger(MockWhatsAppProvider.name);

  async sendText(to: string, message: string): Promise<void> {
    this.logger.log(`[MOCK] sendText to=${to} message=${message}`);
  }
}
