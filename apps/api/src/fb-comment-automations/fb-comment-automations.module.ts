import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AiModule } from '../ai/ai.module';
import { FbCommentAutomationsController } from './fb-comment-automations.controller';
import { FbCommentAutomationsService } from './fb-comment-automations.service';
import { FbCommentProcessorService } from './fb-comment-processor.service';
import { FbPageAiSettingsService } from './fb-page-ai-settings.service';

@Module({
  imports: [CommonModule, AiModule],
  controllers: [FbCommentAutomationsController],
  providers: [FbCommentAutomationsService, FbCommentProcessorService, FbPageAiSettingsService],
  exports: [FbCommentProcessorService, FbPageAiSettingsService],
})
export class FbCommentAutomationsModule {}
