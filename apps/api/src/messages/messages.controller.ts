import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
@Permissions('send_messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post('send')
  send(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.enqueueSend(workspace.id, dto);
  }
}
