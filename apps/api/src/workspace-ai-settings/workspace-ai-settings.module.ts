import { Module } from '@nestjs/common';
import { WorkspaceAiSettingsController } from './workspace-ai-settings.controller';
import { WorkspaceAiSettingsService } from './workspace-ai-settings.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [WorkspaceAiSettingsController],
  providers: [WorkspaceAiSettingsService],
  exports: [WorkspaceAiSettingsService],
})
export class WorkspaceAiSettingsModule {}
