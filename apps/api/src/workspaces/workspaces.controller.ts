import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgRoles } from '../common/decorators/org-roles.decorator';
import { OrgRolesGuard } from '../common/guards/org-roles.guard';
import type { AuthUser } from '../types/express';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { JoinWorkspaceDto } from './dto/join-workspace.dto';
import { SwitchWorkspaceDto } from './dto/switch-workspace.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.listForUser(user.userId, user.organizationId);
  }

  @Post()
  @UseGuards(OrgRolesGuard)
  @OrgRoles('owner', 'admin')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.userId, user.organizationId, dto);
  }

  @Post('switch')
  switch(@CurrentUser() user: AuthUser, @Body() dto: SwitchWorkspaceDto) {
    return this.workspaces.switch(
      user.userId,
      user.email,
      user.organizationId,
      dto.workspaceId,
    );
  }

  @Post('join')
  join(@CurrentUser() user: AuthUser, @Body() dto: JoinWorkspaceDto) {
    return this.workspaces.joinWorkspace(
      user.userId,
      user.organizationId,
      dto.workspaceId,
    );
  }
}
