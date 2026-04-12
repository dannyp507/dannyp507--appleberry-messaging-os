import { Global, Module } from '@nestjs/common';
import { CloudWhatsAppProvider } from './cloud-whatsapp.provider';
import { MockWhatsAppProvider } from './mock-whatsapp.provider';
import { WhatsAppProviderFactory } from './whatsapp-provider.factory';

@Global()
@Module({
  providers: [MockWhatsAppProvider, CloudWhatsAppProvider, WhatsAppProviderFactory],
  exports: [WhatsAppProviderFactory],
})
export class WhatsAppProvidersModule {}
