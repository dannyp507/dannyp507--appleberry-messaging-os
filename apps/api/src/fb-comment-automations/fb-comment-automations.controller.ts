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
import { FbCommentAutomationsService } from './fb-comment-automations.service';
import { CreateFbAutomationDto } from './dto/create-fb-automation.dto';
import { UpdateFbAutomationDto } from './dto/update-fb-automation.dto';

@Controller('fb-comment-automations')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
@Permissions('manage_campaigns') // reuse existing permission key
export class FbCommentAutomationsController {
  constructor(private readonly service: FbCommentAutomationsService) {}

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
    @Body() dto: CreateFbAutomationDto,
  ) {
    return this.service.create(workspace.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFbAutomationDto,
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

  /** GET /fb-comment-automations/:id/events?skip=0&take=50 */
  @Get(':id/events')
  listEvents(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(50), ParseIntPipe) take: number,
  ) {
    return this.service.listEvents(workspace.id, id, skip, take);
  }

  /** GET /fb-comment-automations/pages/:pageId/posts
   *  Lists recent Facebook posts for the given connected page. */
  @Get('pages/:pageId/posts')
  listPosts(
    @CurrentWorkspace() workspace: Workspace,
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ) {
    return this.service.listPosts(workspace.id, pageId);
  }
}
