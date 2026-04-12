import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AutoresponderController } from './autoresponder.controller';
import { AutomationService } from './automation.service';
import { KeywordTriggersController } from './keyword-triggers.controller';

@Module({
  imports: [CommonModule],
  controllers: [AutoresponderController, KeywordTriggersController],
  providers: [AutomationService],
})
export class AutomationModule {}
