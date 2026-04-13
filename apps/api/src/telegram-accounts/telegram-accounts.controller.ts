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
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';
import { TelegramAccountsService } from './telegram-accounts.service';
import { CreateTelegramAccountDto } from './dto/create-telegram-account.dto';
import { ConfigService } from '@nestjs/config';

@Controller('telegram/accounts')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin')
@Permissions('manage_whatsapp')
export class TelegramAccountsController {
  constructor(
    private readonly service: TelegramAccountsService,
    private readonly config: ConfigService,
  ) {}

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
    @Body() dto: CreateTelegramAccountDto,
  ) {
    return this.service.create(workspace.id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(workspace.id, id);
  }

  @Post(':id/set-webhook')
  setWebhook(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const apiUrl = this.config.get<string>('API_URL') ?? 'https://appleberry-api.duckdns.org';
    const webhookUrl = `${apiUrl}/telegram/webhook/${id}`;
    return this.service.setWebhook(workspace.id, id, webhookUrl);
  }
}
