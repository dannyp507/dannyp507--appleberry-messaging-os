import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';
import { InstagramAccountsService, UpsertIgAiSettingsDto } from './instagram-accounts.service';

@Controller('instagram/accounts')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin')
@Permissions('manage_facebook')
export class InstagramAccountsController {
  constructor(private readonly service: InstagramAccountsService) {}

  /** List all connected Instagram accounts for this workspace */
  @Get()
  list(@CurrentWorkspace() workspace: Workspace) {
    return this.service.list(workspace.id);
  }

  /**
   * GET /instagram/accounts/auth-url
   * Returns the Meta OAuth URL to redirect the user to for Instagram access.
   */
  @Get('auth-url')
  async getAuthUrl(@CurrentWorkspace() workspace: Workspace) {
    const url = await this.service.buildAuthUrl(workspace.id);
    return { url };
  }

  /**
   * GET /instagram/accounts/pending?token=xxx
   * Returns the list of Instagram accounts available for selection after OAuth.
   * Token expires in 10 minutes.
   */
  @Get('pending')
  async getPendingAccounts(@Query('token') token: string) {
    if (!token) throw new BadRequestException('token required');
    const result = await this.service.getPendingAccounts(token);
    if (!result) throw new NotFoundException('Selection token expired or not found');
    return result;
  }

  /**
   * POST /instagram/accounts/sync-from-pages
   * Discovers Instagram Business accounts linked to already-connected Facebook Pages
   * for this workspace — no new OAuth required.
   * Returns a pending token (same as OAuth flow) so the frontend can open the
   * account-picker dialog.
   */
  @Post('sync-from-pages')
  syncFromPages(@CurrentWorkspace() workspace: Workspace) {
    return this.service.syncFromPages(workspace.id);
  }

  /**
   * POST /instagram/accounts/confirm
   * Body: { token: string, igUserIds: string[] }
   * Saves only the selected accounts and subscribes them to webhooks.
   */
  @Post('confirm')
  async confirmAccounts(@Body() body: { token: string; igUserIds: string[] }) {
    if (!body?.token) throw new BadRequestException('token required');
    if (!Array.isArray(body.igUserIds) || body.igUserIds.length === 0) {
      throw new BadRequestException('igUserIds array required');
    }
    return this.service.confirmAccounts(body.token, body.igUserIds);
  }

  /** GET /instagram/accounts/:id/ai-settings */
  @Get(':id/ai-settings')
  getAiSettings(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getAiSettings(workspace.id, id);
  }

  /** POST /instagram/accounts/:id/ai-settings */
  @Post(':id/ai-settings')
  upsertAiSettings(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertIgAiSettingsDto,
  ) {
    return this.service.upsertAiSettings(workspace.id, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(workspace.id, id);
  }
}
