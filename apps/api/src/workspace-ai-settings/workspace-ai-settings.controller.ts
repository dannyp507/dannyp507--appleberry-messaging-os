import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import type { Workspace } from '@prisma/client';
import { WorkspaceAiSettingsService } from './workspace-ai-settings.service';
import { UpsertAiSettingsDto } from './dto/upsert-ai-settings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';

@UseGuards(JwtAuthGuard, WorkspaceContextGuard)
@Controller('workspace-ai-settings')
export class WorkspaceAiSettingsController {
  constructor(private readonly svc: WorkspaceAiSettingsService) {}

  @Get()
  get(@CurrentWorkspace() ws: Workspace) {
    return this.svc.get(ws.id);
  }

  @Put()
  upsert(
    @CurrentWorkspace() ws: Workspace,
    @Body() dto: UpsertAiSettingsDto,
  ) {
    return this.svc.upsert(ws.id, dto);
  }
}
