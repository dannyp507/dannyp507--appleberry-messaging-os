import { Module } from '@nestjs/common';
import { OrgRolesGuard } from './guards/org-roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RolesGuard } from './guards/roles.guard';
import { WorkspaceContextGuard } from './guards/workspace-context.guard';

@Module({
  providers: [
    WorkspaceContextGuard,
    RolesGuard,
    PermissionsGuard,
    OrgRolesGuard,
  ],
  exports: [
    WorkspaceContextGuard,
    RolesGuard,
    PermissionsGuard,
    OrgRolesGuard,
  ],
})
export class CommonModule {}
