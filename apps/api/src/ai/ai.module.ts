import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { WorkspaceAiSettingsModule } from '../workspace-ai-settings/workspace-ai-settings.module';

@Global()
@Module({
  imports: [WorkspaceAiSettingsModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
