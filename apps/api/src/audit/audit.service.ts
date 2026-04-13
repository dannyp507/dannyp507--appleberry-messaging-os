import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogEntry {
  workspaceId?: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  private buildAuditData(entry: AuditLogEntry): Prisma.AuditLogCreateInput {
    return {
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      oldValue: (entry.oldValue as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      newValue: (entry.newValue as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      ...(entry.workspaceId ? { workspace: { connect: { id: entry.workspaceId } } } : {}),
      ...(entry.userId ? { user: { connect: { id: entry.userId } } } : {}),
    };
  }

  /** Fire-and-forget audit log write — never throws. */
  log(entry: AuditLogEntry): void {
    this.prisma.auditLog
      .create({ data: this.buildAuditData(entry) })
      .catch((err: unknown) =>
        this.logger.error('Failed to write audit log', err),
      );
  }

  /** Awaitable version for critical operations. */
  async logAsync(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: this.buildAuditData(entry) });
  }

  list(
    workspaceId: string,
    opts: { skip?: number; take?: number; resource?: string } = {},
  ) {
    return this.prisma.auditLog.findMany({
      where: {
        workspaceId,
        ...(opts.resource ? { resource: opts.resource } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip: opts.skip ?? 0,
      take: opts.take ?? 50,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /** Log an activity (less structured than audit — for timeline feeds). */
  activity(
    workspaceId: string,
    type: string,
    description: string,
    opts: { userId?: string; metadata?: Record<string, unknown> } = {},
  ): void {
    this.prisma.activityLog
      .create({
        data: {
          workspaceId,
          userId: opts.userId,
          type,
          description,
          metadata: (opts.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      })
      .catch((err: unknown) =>
        this.logger.error('Failed to write activity log', err),
      );
  }
}
