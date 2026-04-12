import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload, RefreshTokenPayload } from './auth.types';
import type { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get accessExpiresSeconds(): number {
    const v = this.config.get<string>('JWT_ACCESS_SEC');
    if (v) return Number(v);
    return 15 * 60;
  }

  private get refreshExpiresSeconds(): number {
    const v = this.config.get<string>('JWT_REFRESH_SEC');
    if (v) return Number(v);
    return 7 * 24 * 60 * 60;
  }

  private get refreshSecret(): string {
    return (
      this.config.get<string>('JWT_REFRESH_SECRET') ??
      `${this.config.getOrThrow<string>('JWT_SECRET')}_refresh`
    );
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const ownerRole = await this.prisma.role.findUniqueOrThrow({
      where: { slug: 'owner' },
    });

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const orgSlugBase = dto.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          name: dto.name,
        },
      });

      let slug = orgSlugBase || 'org';
      let suffix = 0;
      while (await tx.organization.findUnique({ where: { slug } })) {
        suffix += 1;
        slug = `${orgSlugBase || 'org'}-${suffix}`;
      }

      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          organizationId: organization.id,
          name: 'Default',
          slug: 'default',
        },
      });

      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          roleId: ownerRole.id,
        },
      });

      await tx.workspaceMembership.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          roleId: ownerRole.id,
        },
      });

      return { user, organization, workspace };
    });

    const tokens = await this.issueTokens(
      result.user.id,
      result.user.email,
      result.organization.id,
      result.workspace.id,
    );

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      organizationId: result.organization.id,
      workspaceId: result.workspace.id,
      ...tokens,
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ctx = await this.getDefaultOrgWorkspace(user.id);
    if (!ctx) {
      throw new UnauthorizedException('User has no organization membership');
    }

    const tokens = await this.issueTokens(
      user.id,
      user.email,
      ctx.organizationId,
      ctx.workspaceId,
    );

    return {
      user: { id: user.id, email: user.email, name: user.name },
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const tokens = await this.issueTokens(
      user.id,
      user.email,
      payload.organizationId,
      payload.workspaceId,
    );

    return {
      user: { id: user.id, email: user.email, name: user.name },
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      ...tokens,
    };
  }

  private async getDefaultOrgWorkspace(userId: string): Promise<{
    organizationId: string;
    workspaceId: string | null;
  } | null> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      return null;
    }

    const workspace = await this.prisma.workspace.findFirst({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      organizationId: membership.organizationId,
      workspaceId: workspace?.id ?? null,
    };
  }

  /** Used by WorkspacesModule when switching active workspace. */
  async issueTokenPair(
    userId: string,
    email: string,
    organizationId: string,
    workspaceId: string | null,
  ) {
    return this.issueTokens(userId, email, organizationId, workspaceId);
  }

  private async issueTokens(
    userId: string,
    email: string,
    organizationId: string,
    workspaceId: string | null,
  ) {
    const accessPayload: AccessTokenPayload = {
      sub: userId,
      email,
      organizationId,
      workspaceId,
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      email,
      organizationId,
      workspaceId,
      typ: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: this.accessExpiresSeconds,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshExpiresSeconds,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
