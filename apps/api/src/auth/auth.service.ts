import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AccessTokenPayload,
  OAuthSessionPayload,
  RefreshTokenPayload,
} from './auth.types';
import type { RegisterDto } from './dto/register.dto';

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

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

  private get webAppUrl(): string {
    return this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
  }

  private get googleCallbackUrl(): string {
    return (
      this.config.get<string>('GOOGLE_CALLBACK_URL') ??
      `${this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3001'}/auth/google/callback`
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
          authProvider: 'password',
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
        emailVerified: Boolean(result.user.emailVerifiedAt),
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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      ...tokens,
    };
  }

  buildGoogleAuthorizationUrl(state: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId?.trim()) {
      throw new BadRequestException('Google sign-in is not configured');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.googleCallbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async finishGoogleCallback(code: string) {
    const profile = await this.getGoogleProfile(code);
    if (!profile.email_verified) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const ctx = await this.findOrCreateGoogleUser(profile);
    const sessionToken = await this.jwt.signAsync(
      {
        sub: ctx.user.id,
        email: ctx.user.email,
        organizationId: ctx.organizationId,
        workspaceId: ctx.workspaceId,
        typ: 'oauth_session',
      } satisfies OAuthSessionPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: 120,
      },
    );

    const redirectUrl = new URL('/auth/callback', this.webAppUrl);
    redirectUrl.searchParams.set('sessionToken', sessionToken);
    return redirectUrl.toString();
  }

  async exchangeOAuthSession(sessionToken: string) {
    let payload: OAuthSessionPayload;
    try {
      payload = await this.jwt.verifyAsync<OAuthSessionPayload>(sessionToken, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid OAuth session');
    }

    if (payload.typ !== 'oauth_session') {
      throw new UnauthorizedException('Invalid OAuth session');
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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      ...tokens,
    };
  }

  private async getGoogleProfile(code: string): Promise<GoogleUserInfo> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    if (!clientId?.trim() || !clientSecret?.trim()) {
      throw new BadRequestException('Google sign-in is not configured');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: this.googleCallbackUrl,
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokenJson.access_token) {
      throw new UnauthorizedException(
        tokenJson.error_description ?? 'Google token exchange failed',
      );
    }

    const userInfoResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      },
    );
    if (!userInfoResponse.ok) {
      throw new UnauthorizedException('Google profile lookup failed');
    }

    return (await userInfoResponse.json()) as GoogleUserInfo;
  }

  private async findOrCreateGoogleUser(profile: GoogleUserInfo) {
    const email = profile.email.toLowerCase();
    const ownerRole = await this.prisma.role.findUniqueOrThrow({
      where: { slug: 'owner' },
    });

    return this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findFirst({
        where: {
          OR: [{ googleId: profile.sub }, { email }],
        },
      });

      if (user) {
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            googleId: user.googleId ?? profile.sub,
            authProvider:
              user.authProvider === 'password'
                ? 'password_google'
                : user.authProvider,
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
            name: user.name ?? profile.name,
            avatarUrl: user.avatarUrl ?? profile.picture,
          },
        });
      } else {
        const passwordHash = await bcrypt.hash(
          randomBytes(32).toString('hex'),
          12,
        );
        user = await tx.user.create({
          data: {
            email,
            passwordHash,
            googleId: profile.sub,
            authProvider: 'google',
            emailVerifiedAt: new Date(),
            name: profile.name,
            avatarUrl: profile.picture,
          },
        });
      }

      let membership = await tx.membership.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
      });

      if (!membership) {
        const organizationName =
          profile.name?.trim() || `${email.split('@')[0]}'s Organization`;
        const slugBase = organizationName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40);
        let slug = slugBase || 'org';
        let suffix = 0;
        while (await tx.organization.findUnique({ where: { slug } })) {
          suffix += 1;
          slug = `${slugBase || 'org'}-${suffix}`;
        }

        const organization = await tx.organization.create({
          data: { name: organizationName, slug },
        });
        const workspace = await tx.workspace.create({
          data: {
            organizationId: organization.id,
            name: 'Default',
            slug: 'default',
          },
        });
        membership = await tx.membership.create({
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

        return {
          user,
          organizationId: organization.id,
          workspaceId: workspace.id,
        };
      }

      const workspace = await tx.workspace.findFirst({
        where: { organizationId: membership.organizationId },
        orderBy: { createdAt: 'asc' },
      });

      return {
        user,
        organizationId: membership.organizationId,
        workspaceId: workspace?.id ?? null,
      };
    });
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
