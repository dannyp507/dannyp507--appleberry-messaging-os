import { forwardRef, Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { CommonModule } from '../common/common.module';
import { MessagingModule } from '../messaging/messaging.module';
import { MessagesModule } from '../messages/messages.module';
import { QueueModule } from '../queue/queue.module';
import { IncomingMessageService } from './incoming-message.service';
import { WebhookSecretGuard } from './guards/webhook-secret.guard';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [
    CommonModule,
    AiModule,
    MessagingModule,
    MessagesModule,
    forwardRef(() => ChatbotModule),
    forwardRef(() => QueueModule),
  ],
  controllers: [WebhooksController],
  providers: [IncomingMessageService, WebhookSecretGuard],
  exports: [IncomingMessageService],
})
export class InboundModule {}
