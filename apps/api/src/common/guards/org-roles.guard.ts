import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ORG_ROLES_KEY } from '../decorators/org-roles.decorator';
import type { AuthUser } from '../../types/express';

@Injectable()
export class OrgRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
    const user = request.user;

    if (!user?.organizationId) {
      throw new ForbiddenException('Organization context missing');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.userId },
    });

    if (dbUser?.isSuperAdmin) {
      return true;
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: user.userId,
        organizationId: user.organizationId,
      },
      include: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException('Not a member of this organization');
    }

    if (!required.includes(membership.role.slug)) {
      throw new ForbiddenException('Insufficient organization role');
    }

    return true;
  }
}
