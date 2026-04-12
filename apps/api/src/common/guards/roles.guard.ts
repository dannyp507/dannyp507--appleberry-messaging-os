import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../../types/express';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user: AuthUser;
      workspace: { id: string };
    }>();

    const user = request.user;
    const workspace = request.workspace;

    if (!user?.organizationId || !workspace?.id) {
      throw new ForbiddenException('Workspace context required');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { isSuperAdmin: true },
    });
    if (dbUser?.isSuperAdmin) {
      return true;
    }

    const access = await this.rbac.resolveWorkspaceAccess(
      user.userId,
      user.organizationId,
      workspace.id,
    );

    if (!this.rbac.hasAnyRole(access, requiredRoles)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
