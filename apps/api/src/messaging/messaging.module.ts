import { Global, Module } from '@nestjs/common';
import { TemplateRenderService } from './template-render.service';

@Global()
@Module({
  providers: [TemplateRenderService],
  exports: [TemplateRenderService],
})
export class MessagingModule {}
