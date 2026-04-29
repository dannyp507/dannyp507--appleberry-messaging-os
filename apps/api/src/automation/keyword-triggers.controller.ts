import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';
import { AutomationService } from './automation.service';
import { CreateKeywordTriggerDto } from './dto/create-keyword-trigger.dto';

@Controller('keyword-triggers')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
@Permissions('manage_automation')
export class KeywordTriggersController {
  constructor(private readonly automation: AutomationService) {}

  @Get()
  list(@CurrentWorkspace() workspace: Workspace) {
    return this.automation.listKeywordTriggers(workspace.id);
  }

  @Post()
  create(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: CreateKeywordTriggerDto,
  ) {
    return this.automation.createKeywordTrigger(workspace.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { active?: boolean },
  ) {
    return this.automation.updateKeywordTrigger(workspace.id, id, body);
  }

  @Delete(':id')
  remove(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.automation.deleteKeywordTrigger(workspace.id, id);
  }
}
