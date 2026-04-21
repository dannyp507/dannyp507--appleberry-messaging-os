import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { RedisModule } from '../redis/redis.module';
import { MessagingModule } from '../messaging/messaging.module';
import { FacebookPagesController } from './facebook-pages.controller';
import { FacebookWebhookController } from './facebook-webhook.controller';
import { FacebookPagesService } from './facebook-pages.service';
import { FacebookInboundService } from './facebook-inbound.service';

@Module({
  imports: [CommonModule, RedisModule, MessagingModule],
  controllers: [FacebookPagesController, FacebookWebhookController],
  providers: [FacebookPagesService, FacebookInboundService],
  exports: [FacebookPagesService],
})
export class FacebookPagesModule {}
