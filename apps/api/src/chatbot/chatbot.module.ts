import { forwardRef, Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { MessagesModule } from '../messages/messages.module';
import { ChatbotEngineService } from './chatbot-engine.service';
import { ChatbotAdminController } from './chatbot-admin.controller';
import { ChatbotAdminService } from './chatbot-admin.service';

@Module({
  imports: [MessagingModule, forwardRef(() => MessagesModule)],
  controllers: [ChatbotAdminController],
  providers: [ChatbotEngineService, ChatbotAdminService],
  exports: [ChatbotEngineService],
})
export class ChatbotModule {}
