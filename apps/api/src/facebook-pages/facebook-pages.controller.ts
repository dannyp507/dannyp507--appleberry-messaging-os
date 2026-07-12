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
import { FacebookPagesService } from './facebook-pages.service';
import { BillingService } from '../billing/billing.service';

@Controller('facebook/pages')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin')
@Permissions('manage_facebook')
export class FacebookPagesController {
  constructor(
    private readonly service: FacebookPagesService,
    private readonly billing: BillingService,
  ) {}

  /** List all connected Facebook pages for this workspace */
  @Get()
  list(@CurrentWorkspace() workspace: Workspace) {
    return this.service.list(workspace.id);
  }

  /**
   * GET /facebook/pages/auth-url
   * Returns the Facebook OAuth URL to redirect the user to.
   * Frontend opens this URL to start the "Connect Facebook Page" flow.
   */
  @Get('auth-url')
  async getAuthUrl(@CurrentWorkspace() workspace: Workspace) {
    await this.billing.assertHasFacebook(workspace.id);
    const url = await this.service.buildAuthUrl(workspace.id);
    return { url };
  }

  /**
   * GET /facebook/pages/pending?token=xxx
   * Returns the list of pages available for selection after OAuth.
   * Token expires in 10 minutes.
   */
  @Get('pending')
  async getPendingPages(@Query('token') token: string) {
    if (!token) throw new BadRequestException('token required');
    const result = await this.service.getPendingPages(token);
    if (!result) throw new NotFoundException('Selection token expired or not found');
    return result;
  }

  /**
   * POST /facebook/pages/confirm
   * Body: { token: string, pageIds: string[] }
   * Saves only the selected pages and subscribes them to webhooks.
   */
  @Post('confirm')
  async confirmPages(
    @CurrentWorkspace() workspace: Workspace,
    @Body() body: { token: string; pageIds: string[] },
  ) {
    await this.billing.assertHasFacebook(workspace.id);
    if (!body?.token) throw new BadRequestException('token required');
    if (!Array.isArray(body.pageIds) || body.pageIds.length === 0) {
      throw new BadRequestException('pageIds array required');
    }
    return this.service.confirmPages(body.token, body.pageIds);
  }

  @Delete(':id')
  remove(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(workspace.id, id);
  }
}
