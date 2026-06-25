import { forwardRef, Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { CommonModule } from '../common/common.module';
import { MessagingModule } from '../messaging/messaging.module';
import { MessagesModule } from '../messages/messages.module';
import { OptOutModule } from '../opt-out/opt-out.module';
import { QueueModule } from '../queue/queue.module';
import { WorkspaceAiSettingsModule } from '../workspace-ai-settings/workspace-ai-settings.module';
import { SequencesModule } from '../sequences/sequences.module';
import { SubscribersModule } from '../subscribers/subscribers.module';
import { FollowUpModule } from '../follow-up/follow-up.module';
import { IncomingMessageService } from './incoming-message.service';
import { WebhookSecretGuard } from './guards/webhook-secret.guard';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [
    CommonModule,
    AiModule,
    MessagingModule,
    MessagesModule,
    OptOutModule,
    WorkspaceAiSettingsModule,
    SequencesModule,
    SubscribersModule,
    FollowUpModule,
    forwardRef(() => ChatbotModule),
    forwardRef(() => QueueModule),
  ],
  controllers: [WebhooksController],
  providers: [IncomingMessageService, WebhookSecretGuard],
  exports: [IncomingMessageService],
})
export class InboundModule {}
