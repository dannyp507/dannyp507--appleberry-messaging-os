import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import type { AuthUser } from '../../types/express';

const HEADER = 'x-workspace-id';

/**
 * Resolves workspace from X-Workspace-Id header or JWT, verifies membership/RBAC,
 * and attaches `request.workspace`.
 */
@Injectable()
export class WorkspaceContextGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user: AuthUser;
      headers: Record<string, string | string[] | undefined>;
      workspace?: Awaited<ReturnType<PrismaService['workspace']['findFirst']>>;
    }>();

    const user = request.user;
    if (!user?.organizationId) {
      throw new BadRequestException('Organization context missing');
    }

    const headerVal = request.headers[HEADER];
    const headerWorkspaceId =
      typeof headerVal === 'string'
        ? headerVal
        : Array.isArray(headerVal)
          ? headerVal[0]
          : undefined;

    const workspaceId = headerWorkspaceId ?? user.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException(
        'Workspace required: set X-Workspace-Id or switch workspace via POST /workspaces/switch',
      );
    }

    await this.rbac.resolveWorkspaceAccess(
      user.userId,
      user.organizationId,
      workspaceId,
    );

    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, organizationId: user.organizationId },
    });

    if (!workspace) {
      throw new BadRequestException('Invalid workspace for organization');
    }

    request.workspace = workspace;
    return true;
  }
}
