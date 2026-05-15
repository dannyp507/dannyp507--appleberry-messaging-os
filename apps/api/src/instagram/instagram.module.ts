import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { RedisModule } from '../redis/redis.module';
import { MessagingModule } from '../messaging/messaging.module';
import { AiModule } from '../ai/ai.module';
import { InstagramAccountsController } from './instagram-accounts.controller';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { InstagramAccountsService } from './instagram-accounts.service';
import { InstagramInboundService } from './instagram-inbound.service';

@Module({
  imports: [CommonModule, RedisModule, MessagingModule, AiModule],
  controllers: [InstagramAccountsController, InstagramWebhookController],
  providers: [InstagramAccountsService, InstagramInboundService],
  exports: [InstagramAccountsService, InstagramInboundService],
})
export class InstagramModule {}
