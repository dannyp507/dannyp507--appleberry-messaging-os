import { Global, Module } from '@nestjs/common';
import { BaileysSessionManager } from './baileys-session.manager';
import { BaileysWhatsAppProvider } from './baileys-whatsapp.provider';
import { CloudWhatsAppProvider } from './cloud-whatsapp.provider';
import { MockWhatsAppProvider } from './mock-whatsapp.provider';
import { WhatsAppProviderFactory } from './whatsapp-provider.factory';

@Global()
@Module({
  providers: [
    MockWhatsAppProvider,
    CloudWhatsAppProvider,
    BaileysSessionManager,
    BaileysWhatsAppProvider,
    WhatsAppProviderFactory,
  ],
  exports: [WhatsAppProviderFactory, BaileysSessionManager],
})
export class WhatsAppProvidersModule {}
