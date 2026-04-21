import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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

  /**
   * Start a Baileys QR-code session for this account.
   * The QR code will be available via GET /:id/session once generated.
   */
  @Post(':id/connect')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('owner', 'admin')
  @Permissions('manage_whatsapp')
  connect(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accounts.connectBaileys(workspace.id, id);
  }

  /**
   * Returns current session status + QR code (base64 data URL).
   * Poll every 2-3 s until status === CONNECTED.
   */
  @Get(':id/session')
  session(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accounts.getSession(workspace.id, id);
  }

  /**
   * Disconnect the Baileys session and clear stored credentials.
   * Next connect will require a fresh QR scan.
   */
  @Delete(':id/session')
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles('owner', 'admin')
  @Permissions('manage_whatsapp')
  disconnect(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accounts.disconnectBaileys(workspace.id, id);
  }
}
