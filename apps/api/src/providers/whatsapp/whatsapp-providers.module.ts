import { Global, Module } from '@nestjs/common';
import { CloudWhatsAppProvider } from './cloud-whatsapp.provider';
import { MockWhatsAppProvider } from './mock-whatsapp.provider';
import { BaileysWhatsAppProvider } from './baileys-whatsapp.provider';
import { WhatsAppProviderFactory } from './whatsapp-provider.factory';
import { BaileysModule } from '../../baileys/baileys.module';

@Global()
@Module({
  imports: [BaileysModule],
  providers: [MockWhatsAppProvider, CloudWhatsAppProvider, BaileysWhatsAppProvider, WhatsAppProviderFactory],
  exports: [WhatsAppProviderFactory],
})
export class WhatsAppProvidersModule {}
