import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type WorkspaceAccess = {
  workspaceId: string;
  organizationId: string;
  roleSlug: string;
  permissionKeys: Set<string>;
};

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveWorkspaceAccess(
    userId: string,
    organizationId: string,
    workspaceId: string,
  ): Promise<WorkspaceAccess> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { organizationId },
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
        workspaceMemberships: {
          where: { workspaceId },
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    if (user.isSuperAdmin) {
      const all = await this.prisma.permission.findMany({ select: { key: true } });
      return {
        workspaceId,
        organizationId,
        roleSlug: 'superadmin',
        permissionKeys: new Set(all.map((p) => p.key)),
      };
    }

    const orgMembership = user.memberships[0];
    if (!orgMembership) {
      throw new ForbiddenException('Not a member of this organization');
    }

    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, organizationId },
    });

    if (!workspace) {
      throw new ForbiddenException('Workspace not found in organization');
    }

    const orgRoleSlug = orgMembership.role.slug;
    const orgPerms = new Set<string>(
      orgMembership.role.permissions.map((rp) => rp.permission.key),
    );

    if (orgRoleSlug === 'owner' || orgRoleSlug === 'admin') {
      return {
        workspaceId,
        organizationId,
        roleSlug: orgRoleSlug,
        permissionKeys: orgPerms,
      };
    }

    const wsMembership = user.workspaceMemberships[0];
    if (!wsMembership) {
      throw new ForbiddenException('No access to this workspace');
    }

    const wsPerms = new Set<string>(
      wsMembership.role.permissions.map((rp) => rp.permission.key),
    );

    return {
      workspaceId,
      organizationId,
      roleSlug: wsMembership.role.slug,
      permissionKeys: wsPerms,
    };
  }

  hasAllPermissions(access: WorkspaceAccess, required: string[]): boolean {
    return required.every((p) => access.permissionKeys.has(p));
  }

  hasAnyRole(access: WorkspaceAccess, roles: string[]): boolean {
    return roles.includes(access.roleSlug);
  }
}
