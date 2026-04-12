import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../../rbac/rbac.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { AuthUser } from '../../types/express';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
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

    const access = await this.rbac.resolveWorkspaceAccess(
      user.userId,
      user.organizationId,
      workspace.id,
    );

    if (!this.rbac.hasAllPermissions(access, required)) {
      throw new ForbiddenException('Missing permission');
    }

    return true;
  }
}
