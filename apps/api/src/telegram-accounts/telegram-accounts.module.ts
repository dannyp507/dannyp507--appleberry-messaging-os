import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { OptOutModule } from '../opt-out/opt-out.module';
import { TelegramAccountsController } from './telegram-accounts.controller';
import { TelegramAccountsService } from './telegram-accounts.service';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramInboundService } from './telegram-inbound.service';

@Module({
  imports: [AiModule, OptOutModule],
  controllers: [TelegramAccountsController, TelegramWebhookController],
  providers: [TelegramAccountsService, TelegramInboundService],
  exports: [TelegramAccountsService],
})
export class TelegramAccountsModule {}
