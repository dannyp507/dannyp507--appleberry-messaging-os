import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';
import { IgCommentAutomationsService } from './ig-comment-automations.service';
import { CreateIgAutomationDto } from './dto/create-ig-automation.dto';
import { UpdateIgAutomationDto } from './dto/update-ig-automation.dto';

@Controller('ig-comment-automations')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
@Permissions('manage_campaigns')
export class IgCommentAutomationsController {
  constructor(private readonly service: IgCommentAutomationsService) {}

  @Get()
  list(@CurrentWorkspace() workspace: Workspace) {
    return this.service.list(workspace.id);
  }

  @Get(':id')
  findOne(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(workspace.id, id);
  }

  @Post()
  create(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: CreateIgAutomationDto,
  ) {
    return this.service.create(workspace.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIgAutomationDto,
  ) {
    return this.service.update(workspace.id, id, dto);
  }

  @Post(':id/toggle')
  toggle(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.toggle(workspace.id, id);
  }

  @Delete(':id')
  remove(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(workspace.id, id);
  }

  /** GET /ig-comment-automations/:id/events?skip=0&take=50 */
  @Get(':id/events')
  listEvents(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(50), ParseIntPipe) take: number,
  ) {
    return this.service.listEvents(workspace.id, id, skip, take);
  }

  /** GET /ig-comment-automations/accounts/:accountId/posts
   *  Lists recent Instagram media for the given connected account. */
  @Get('accounts/:accountId/posts')
  listPosts(
    @CurrentWorkspace() workspace: Workspace,
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ) {
    return this.service.listPosts(workspace.id, accountId);
  }
}
