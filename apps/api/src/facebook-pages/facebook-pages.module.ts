import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { RedisModule } from '../redis/redis.module';
import { MessagingModule } from '../messaging/messaging.module';
import { AiModule } from '../ai/ai.module';
import { FacebookPagesController } from './facebook-pages.controller';
import { FacebookWebhookController } from './facebook-webhook.controller';
import { FacebookPagesService } from './facebook-pages.service';
import { FacebookInboundService } from './facebook-inbound.service';
import { FbCommentProcessorService } from '../fb-comment-automations/fb-comment-processor.service';

@Module({
  imports: [CommonModule, RedisModule, MessagingModule, AiModule],
  controllers: [FacebookPagesController, FacebookWebhookController],
  providers: [FacebookPagesService, FacebookInboundService, FbCommentProcessorService],
  exports: [FacebookPagesService],
})
export class FacebookPagesModule {}
