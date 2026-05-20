import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AiModule } from '../ai/ai.module';
import { IgCommentAutomationsController } from './ig-comment-automations.controller';
import { IgCommentAutomationsService } from './ig-comment-automations.service';
import { IgCommentProcessorService } from './ig-comment-processor.service';

@Module({
  imports: [CommonModule, AiModule],
  controllers: [IgCommentAutomationsController],
  providers: [IgCommentAutomationsService, IgCommentProcessorService],
  exports: [IgCommentProcessorService],
})
export class IgCommentAutomationsModule {}
