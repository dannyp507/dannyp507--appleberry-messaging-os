import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
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
import { CreateAutoresponderDto } from './dto/create-autoresponder.dto';

@Controller('autoresponder/rules')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
@Permissions('manage_automation')
export class AutoresponderController {
  constructor(private readonly automation: AutomationService) {}

  @Get()
  list(@CurrentWorkspace() workspace: Workspace) {
    return this.automation.listAutoresponders(workspace.id);
  }

  @Post()
  create(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: CreateAutoresponderDto,
  ) {
    return this.automation.createAutoresponder(workspace.id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.automation.deleteAutoresponder(workspace.id, id);
  }
}
