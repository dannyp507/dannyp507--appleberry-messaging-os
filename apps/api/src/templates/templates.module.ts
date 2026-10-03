import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { MetaTemplateService } from './meta-template.service';

@Module({
  imports: [CommonModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, MetaTemplateService],
  exports: [MetaTemplateService],
})
export class TemplatesModule {}
