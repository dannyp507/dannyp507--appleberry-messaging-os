import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { WhatsappAccountsController } from './whatsapp-accounts.controller';
import { WhatsappAccountsService } from './whatsapp-accounts.service';
import { BaileysModule } from '../baileys/baileys.module';
import { WorkspaceAiSettingsModule } from '../workspace-ai-settings/workspace-ai-settings.module';

@Module({
  imports: [CommonModule, BaileysModule, WorkspaceAiSettingsModule],
  controllers: [WhatsappAccountsController],
  providers: [WhatsappAccountsService],
  exports: [WhatsappAccountsService],
})
export class WhatsappAccountsModule {}
