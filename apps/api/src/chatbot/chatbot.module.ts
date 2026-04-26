import { forwardRef, Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { MessagesModule } from '../messages/messages.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ChatbotEngineService } from './chatbot-engine.service';
import { ChatbotAdminController } from './chatbot-admin.controller';
import { ChatbotAdminService } from './chatbot-admin.service';
import { ChatbotFlowIoService } from './chatbot-flow-io.service';

@Module({
  imports: [MessagingModule, forwardRef(() => MessagesModule), IntegrationsModule],
  controllers: [ChatbotAdminController],
  providers: [ChatbotEngineService, ChatbotAdminService, ChatbotFlowIoService],
  exports: [ChatbotEngineService],
})
export class ChatbotModule {}
