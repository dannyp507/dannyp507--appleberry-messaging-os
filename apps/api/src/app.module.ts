import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { AutomationModule } from './automation/automation.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { ContactGroupsModule } from './contact-groups/contact-groups.module';
import { ContactsModule } from './contacts/contacts.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { InboundModule } from './inbound/inbound.module';
import { InboxModule } from './inbox/inbox.module';
import { MessagingModule } from './messaging/messaging.module';
import { MessagesModule } from './messages/messages.module';
import { PrismaModule } from './prisma/prisma.module';
import { WhatsAppProvidersModule } from './providers/whatsapp/whatsapp-providers.module';
import { QueueModule } from './queue/queue.module';
import { RbacModule } from './rbac/rbac.module';
import { RedisModule } from './redis/redis.module';
import { TemplatesModule } from './templates/templates.module';
import { WhatsappAccountsModule } from './whatsapp-accounts/whatsapp-accounts.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { TelegramAccountsModule } from './telegram-accounts/telegram-accounts.module';
import { FacebookPagesModule } from './facebook-pages/facebook-pages.module';
import { WorkspaceAiSettingsModule } from './workspace-ai-settings/workspace-ai-settings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { SupportModule } from './support/support.module';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 200,
      },
    ]),
    PrismaModule,
    BillingModule,
    AuditModule,
    ApiKeysModule,
    RbacModule,
    RedisModule,
    AiModule,
    MessagingModule,
    WhatsAppProvidersModule,
    QueueModule,
    ChatbotModule,
    InboundModule,
    AuthModule,
    WorkspacesModule,
    WhatsappAccountsModule,
    MessagesModule,
    ContactsModule,
    ContactGroupsModule,
    TemplatesModule,
    CampaignsModule,
    AutomationModule,
    InboxModule,
    AnalyticsModule,
    TelegramAccountsModule,
    FacebookPagesModule,
    WorkspaceAiSettingsModule,
    NotificationsModule,
    IntegrationsModule,
    SupportModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
