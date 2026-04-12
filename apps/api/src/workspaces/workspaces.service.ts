import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AuthService } from '../auth/auth.service';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto';

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return base || 'workspace';
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly auth: AuthService,
  ) {}

  async listForUser(userId: string, organizationId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { organizationId },
          include: { role: true },
        },
      },
    });

    if (!user?.memberships.length) {
      throw new ForbiddenException('No access to organization');
    }

    const orgRole = user.memberships[0].role.slug;

    if (user.isSuperAdmin || orgRole === 'owner' || orgRole === 'admin') {
      return this.prisma.workspace.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      });
    }

    const memberships = await this.prisma.workspaceMembership.findMany({
      where: { userId, workspace: { organizationId } },
      include: { workspace: true },
    });

    return memberships.map((m) => m.workspace);
  }

  async create(
    userId: string,
    organizationId: string,
    dto: CreateWorkspaceDto,
  ) {
    let base = slugify(dto.name);
    let slug = base;
    let n = 0;
    while (
      await this.prisma.workspace.findUnique({
        where: {
          organizationId_slug: { organizationId, slug },
        },
      })
    ) {
      n += 1;
      slug = `${base}-${n}`;
    }

    const workspace = await this.prisma.workspace.create({
      data: {
        organizationId,
        name: dto.name,
        slug,
      },
    });

    const orgMembership = await this.prisma.membership.findFirstOrThrow({
      where: { userId, organizationId },
    });

    await this.prisma.workspaceMembership.upsert({
      where: {
        userId_workspaceId: { userId, workspaceId: workspace.id },
      },
      update: {},
      create: {
        userId,
        workspaceId: workspace.id,
        roleId: orgMembership.roleId,
      },
    });

    return workspace;
  }

  async switch(
    userId: string,
    email: string,
    organizationId: string,
    workspaceId: string,
  ) {
    await this.rbac.resolveWorkspaceAccess(userId, organizationId, workspaceId);

    const tokens = await this.auth.issueTokenPair(
      userId,
      email,
      organizationId,
      workspaceId,
    );

    return {
      workspaceId,
      ...tokens,
    };
  }

  async joinWorkspace(
    userId: string,
    organizationId: string,
    workspaceId: string,
  ) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, organizationId },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const orgMembership = await this.prisma.membership.findFirst({
      where: { userId, organizationId },
    });
    if (!orgMembership) {
      throw new ForbiddenException('Not a member of organization');
    }

    const agentRole = await this.prisma.role.findUniqueOrThrow({
      where: { slug: 'agent' },
    });

    await this.prisma.workspaceMembership.upsert({
      where: { userId_workspaceId: { userId, workspaceId } },
      update: {},
      create: {
        userId,
        workspaceId,
        roleId: agentRole.id,
      },
    });

    return { workspaceId, status: 'joined' as const };
  }
}
