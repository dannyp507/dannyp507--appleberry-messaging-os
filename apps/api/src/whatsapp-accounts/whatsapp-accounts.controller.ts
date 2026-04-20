import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
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

  @Get(':id/qr')
  getQr(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accounts.getQrCode(workspace.id, id);
  }

  @Post(':id/connect')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('owner', 'admin')
  @Permissions('manage_whatsapp')
  connect(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accounts.startBaileysSession(workspace.id, id);
  }

  @Post(':id/pairing-code')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('owner', 'admin')
  @Permissions('manage_whatsapp')
  requestPairingCode(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { phone: string },
  ) {
    return this.accounts.requestPairingCode(workspace.id, id, body.phone);
  }

  @Post(':id/disconnect')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('owner', 'admin')
  @Permissions('manage_whatsapp')
  disconnect(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accounts.disconnectBaileysSession(workspace.id, id);
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
