import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeyScope } from '@prisma/client';

export interface ApiKeyWithSecret {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  ipAllowlist: string[];
  expiresAt: Date | null;
  createdAt: Date;
  /** Only returned once at creation time. Never stored in plain text. */
  secret: string;
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  private hashKey(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateApiKeyDto,
  ): Promise<ApiKeyWithSecret> {
    await this.billing.assertHasApiAccess(workspaceId);

    // Generate: "apb_" + 40 random hex chars
    const rawSecret = `apb_${randomBytes(20).toString('hex')}`;
    const keyHash = this.hashKey(rawSecret);
    const keyPrefix = rawSecret.slice(0, 10);

    const key = await this.prisma.apiKey.create({
      data: {
        workspaceId,
        userId,
        name: dto.name,
        keyHash,
        keyPrefix,
        scopes: dto.scopes ?? [ApiKeyScope.READ],
        ipAllowlist: dto.ipAllowlist ?? [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    return {
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      ipAllowlist: key.ipAllowlist,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      secret: rawSecret,
    };
  }

  list(workspaceId: string) {
    return this.prisma.apiKey.findMany({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        ipAllowlist: true,
        lastUsedAt: true,
        lastUsedIp: true,
        expiresAt: true,
        requestCount: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async revoke(workspaceId: string, id: string): Promise<void> {
    const key = await this.prisma.apiKey.findFirst({ where: { id, workspaceId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.prisma.apiKey.update({ where: { id }, data: { isActive: false } });
  }

  /** Used by the ApiKeyGuard to authenticate inbound requests. */
  async validateKey(
    rawKey: string,
    requiredScope: ApiKeyScope,
    ipAddress?: string,
  ) {
    const keyHash = this.hashKey(rawKey);
    const key = await this.prisma.apiKey.findUnique({ where: { keyHash } });

    if (!key || !key.isActive) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expired');
    }
    if (
      key.ipAllowlist.length > 0 &&
      ipAddress &&
      !key.ipAllowlist.includes(ipAddress)
    ) {
      throw new UnauthorizedException('IP address not allowed for this API key');
    }
    if (!key.scopes.includes(requiredScope) && !key.scopes.includes(ApiKeyScope.ADMIN)) {
      throw new UnauthorizedException(
        `API key does not have required scope: ${requiredScope}`,
      );
    }

    // Update usage stats (fire-and-forget)
    this.prisma.apiKey
      .update({
        where: { id: key.id },
        data: {
          lastUsedAt: new Date(),
          lastUsedIp: ipAddress ?? null,
          requestCount: { increment: 1 },
        },
      })
      .catch(() => undefined);

    // Track API usage against plan
    this.billing.recordApiRequest(key.workspaceId).catch(() => undefined);

    return key;
  }
}
