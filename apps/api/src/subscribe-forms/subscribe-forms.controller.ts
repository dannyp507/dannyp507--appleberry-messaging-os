import {
  Body, Controller, Delete, Get, Param,
  ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import type { Workspace } from '@prisma/client';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { SubscribeFormsService } from './subscribe-forms.service';
import { CreateSubscribeFormDto } from './dto/create-subscribe-form.dto';

@Controller('subscribe-forms')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
export class SubscribeFormsController {
  constructor(private readonly service: SubscribeFormsService) {}

  @Get()
  list(@CurrentWorkspace() ws: Workspace) {
    return this.service.list(ws.id);
  }

  @Post()
  create(@CurrentWorkspace() ws: Workspace, @Body() dto: CreateSubscribeFormDto) {
    return this.service.create(ws.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() ws: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateSubscribeFormDto>,
  ) {
    return this.service.update(ws.id, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentWorkspace() ws: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(ws.id, id);
  }
}
