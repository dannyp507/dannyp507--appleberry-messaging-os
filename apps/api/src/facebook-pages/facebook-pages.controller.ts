import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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

@Controller('facebook/pages')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin')
@Permissions('manage_facebook')
export class FacebookPagesController {
  constructor(private readonly service: FacebookPagesService) {}

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
    const url = await this.service.buildAuthUrl(workspace.id);
    return { url };
  }

  @Delete(':id')
  remove(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(workspace.id, id);
  }
}
