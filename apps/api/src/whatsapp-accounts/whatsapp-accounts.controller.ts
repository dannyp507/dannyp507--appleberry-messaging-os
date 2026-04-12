import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';
import { CreateWhatsAppAccountDto } from './dto/create-whatsapp-account.dto';
import { WhatsappAccountsService } from './whatsapp-accounts.service';

@Controller('whatsapp/accounts')
@UseGuards(WorkspaceContextGuard)
export class WhatsappAccountsController {
  constructor(private readonly accounts: WhatsappAccountsService) {}

  @Get()
  list(@CurrentWorkspace() workspace: Workspace) {
    return this.accounts.list(workspace.id);
  }

  @Post()
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('owner', 'admin')
  @Permissions('manage_whatsapp')
  create(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: CreateWhatsAppAccountDto,
  ) {
    return this.accounts.create(workspace.id, dto);
  }
}
