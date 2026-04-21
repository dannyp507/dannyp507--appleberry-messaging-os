import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AutoresponderMatchType,
  KeywordMatchType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAutoresponderDto } from './dto/create-autoresponder.dto';
import type { CreateKeywordTriggerDto } from './dto/create-keyword-trigger.dto';

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  listAutoresponders(workspaceId: string, whatsappAccountId?: string) {
    return this.prisma.autoresponderRule.findMany({
      where: {
        workspaceId,
        ...(whatsappAccountId
          ? { whatsappAccountId }
          : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  createAutoresponder(workspaceId: string, dto: CreateAutoresponderDto) {
    return this.prisma.autoresponderRule.create({
      data: {
        workspaceId,
        whatsappAccountId: dto.whatsappAccountId ?? null,
        name: dto.name ?? null,
        keyword: dto.keyword,
        matchType: dto.matchType ?? AutoresponderMatchType.CONTAINS,
        response: dto.response ?? '',
        mediaUrl: dto.mediaUrl ?? null,
        priority: dto.priority ?? 0,
        active: dto.active ?? true,
      },
    });
  }

  async updateAutoresponder(workspaceId: string, id: string, dto: Partial<CreateAutoresponderDto>) {
    const row = await this.prisma.autoresponderRule.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException('Rule not found');
    return this.prisma.autoresponderRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.keyword !== undefined && { keyword: dto.keyword }),
        ...(dto.matchType !== undefined && { matchType: dto.matchType }),
        ...(dto.response !== undefined && { response: dto.response }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.mediaUrl !== undefined && { mediaUrl: dto.mediaUrl || null }),
      },
    });
  }

  async toggleAutoresponder(workspaceId: string, id: string) {
    const row = await this.prisma.autoresponderRule.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('Rule not found');
    return this.prisma.autoresponderRule.update({
      where: { id },
      data: { active: !row.active },
    });
  }

  async deleteAutoresponder(workspaceId: string, id: string) {
    const row = await this.prisma.autoresponderRule.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('Rule not found');
    await this.prisma.autoresponderRule.delete({ where: { id } });
    return { id, deleted: true as const };
  }

  listKeywordTriggers(workspaceId: string) {
    return this.prisma.keywordTrigger.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  createKeywordTrigger(workspaceId: string, dto: CreateKeywordTriggerDto) {
    return this.prisma.keywordTrigger.create({
      data: {
        workspaceId,
        keyword: dto.keyword,
        matchType: dto.matchType ?? KeywordMatchType.CONTAINS,
        actionType: dto.actionType,
        targetId: dto.targetId,
        active: dto.active ?? true,
      },
    });
  }

  async deleteKeywordTrigger(workspaceId: string, id: string) {
    const row = await this.prisma.keywordTrigger.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('Trigger not found');
    await this.prisma.keywordTrigger.delete({ where: { id } });
    return { id, deleted: true as const };
  }
}
