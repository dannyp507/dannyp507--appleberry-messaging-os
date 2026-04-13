import { Injectable } from '@nestjs/common';
import { WhatsAppProviderType } from '@prisma/client';
import { CloudWhatsAppProvider } from './cloud-whatsapp.provider';
import { MockWhatsAppProvider } from './mock-whatsapp.provider';
import { BaileysWhatsAppProvider } from './baileys-whatsapp.provider';
import type { WhatsAppProvider } from './whatsapp-provider.interface';

@Injectable()
export class WhatsAppProviderFactory {
  constructor(
    private readonly mockProvider: MockWhatsAppProvider,
    private readonly cloudProvider: CloudWhatsAppProvider,
    private readonly baileysProvider: BaileysWhatsAppProvider,
  ) {}

  getProvider(type: WhatsAppProviderType): WhatsAppProvider {
    switch (type) {
      case WhatsAppProviderType.CLOUD:
        return this.cloudProvider;
      case WhatsAppProviderType.BAILEYS:
        return this.baileysProvider;
      case WhatsAppProviderType.MOCK:
      default:
        return this.mockProvider;
    }
  }
}
