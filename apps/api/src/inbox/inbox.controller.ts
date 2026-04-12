import {
  Body,
  Controller,
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
import { SendInboxMessageDto } from './dto/send-inbox-message.dto';
import { UpdateInboxThreadDto } from './dto/update-inbox-thread.dto';
import { InboxService } from './inbox.service';

@Controller('inbox')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get('threads')
  @Permissions('manage_inbox')
  threads(@CurrentWorkspace() workspace: Workspace) {
    return this.inbox.listThreads(workspace.id);
  }

  @Get('threads/:id/messages')
  @Permissions('manage_inbox')
  messages(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inbox.listMessages(workspace.id, id);
  }

  @Patch('threads/:id')
  @Permissions('manage_inbox')
  patchThread(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInboxThreadDto,
  ) {
    return this.inbox.updateThread(workspace.id, id, dto);
  }

  @Post('send')
  @Permissions('send_messages')
  send(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: SendInboxMessageDto,
  ) {
    return this.inbox.send(workspace.id, dto);
  }
}
