import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Workspace } from '@prisma/client';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { SubscribersService } from './subscribers.service';
import { ListSubscribersDto } from './dto/list-subscribers.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';

@Controller('subscribers')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
export class SubscribersController {
  constructor(private readonly service: SubscribersService) {}

  @Get()
  list(
    @CurrentWorkspace() workspace: Workspace,
    @Query() query: ListSubscribersDto,
  ) {
    return this.service.list(workspace.id, query);
  }

  @Patch(':id')
  updateStatus(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriberDto,
  ) {
    return this.service.updateStatus(workspace.id, id, dto.status);
  }

  @Post(':id/tags/:tagId')
  assignTag(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ) {
    return this.service.assignTag(workspace.id, id, tagId);
  }

  @Delete(':id/tags/:tagId')
  removeTag(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ) {
    return this.service.removeTag(workspace.id, id, tagId);
  }

  @Get('export')
  async exportCsv(
    @CurrentWorkspace() workspace: Workspace,
    @Query('accountId') accountId: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.service.exportCsv(workspace.id, accountId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="subscribers.csv"',
    );
    res.send(csv);
  }
}
