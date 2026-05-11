import { Injectable, NotFoundException } from '@nestjs/common';
import { FbCommentActionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateFbAutomationDto } from './dto/create-fb-automation.dto';
import type { UpdateFbAutomationDto } from './dto/update-fb-automation.dto';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

@Injectable()
export class FbCommentAutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── CRUD ────────────────────────────────────────────────────────────────────

  list(workspaceId: string) {
    return this.prisma.fbCommentAutomation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        fbPage: { select: { id: true, pageId: true, name: true } },
        keywords: { orderBy: { createdAt: 'asc' } },
        _count: { select: { events: true } },
      },
    });
  }

  async findOne(workspaceId: string, id: string) {
    const automation = await this.prisma.fbCommentAutomation.findFirst({
      where: { id, workspaceId },
      include: {
        fbPage: { select: { id: true, pageId: true, name: true } },
        keywords: { orderBy: { createdAt: 'asc' } },
        _count: { select: { events: true } },
      },
    });
    if (!automation) throw new NotFoundException('Automation not found');
    return automation;
  }

  async create(workspaceId: string, dto: CreateFbAutomationDto) {
    // Verify the page belongs to this workspace
    const page = await this.prisma.facebookPage.findFirst({
      where: { id: dto.facebookPageId, workspaceId },
    });
    if (!page) throw new NotFoundException('Facebook page not found');

    return this.prisma.fbCommentAutomation.create({
      data: {
        workspaceId,
        facebookPageId: dto.facebookPageId,
        postId: dto.postId,
        postSnippet: dto.postSnippet ?? null,
        name: dto.name,
        isActive: dto.isActive ?? true,
        actionType: (dto.actionType ?? 'PRIVATE_REPLY') as FbCommentActionType,
        messageText: dto.messageText,
        buttonLabel: dto.buttonLabel ?? null,
        buttonUrl: dto.buttonUrl ?? null,
        mediaUrl: dto.mediaUrl ?? null,
        aiEnabled: dto.aiEnabled ?? false,
        aiSystemPrompt: dto.aiSystemPrompt ?? null,
        keywords: {
          create: dto.keywords.map((k) => ({
            keyword: k.keyword,
            matchType: k.matchType ?? 'CONTAINS',
          })),
        },
      },
      include: {
        keywords: true,
        fbPage: { select: { id: true, pageId: true, name: true } },
      },
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateFbAutomationDto) {
    const existing = await this.prisma.fbCommentAutomation.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Automation not found');

    // Replace keywords if provided — delete all existing and re-insert
    if (dto.keywords !== undefined) {
      await this.prisma.fbAutomationKeyword.deleteMany({ where: { automationId: id } });
    }

    return this.prisma.fbCommentAutomation.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.postId !== undefined && { postId: dto.postId }),
        ...(dto.postSnippet !== undefined && { postSnippet: dto.postSnippet }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.actionType !== undefined && { actionType: dto.actionType as FbCommentActionType }),
        ...(dto.messageText !== undefined && { messageText: dto.messageText }),
        ...(dto.buttonLabel !== undefined && { buttonLabel: dto.buttonLabel }),
        ...(dto.buttonUrl !== undefined && { buttonUrl: dto.buttonUrl }),
        ...(dto.mediaUrl !== undefined && { mediaUrl: dto.mediaUrl }),
        ...(dto.aiEnabled !== undefined && { aiEnabled: dto.aiEnabled }),
        ...(dto.aiSystemPrompt !== undefined && { aiSystemPrompt: dto.aiSystemPrompt }),
        ...(dto.keywords !== undefined && {
          keywords: {
            create: dto.keywords.map((k) => ({
              keyword: k.keyword,
              matchType: k.matchType ?? 'CONTAINS',
            })),
          },
        }),
      },
      include: {
        keywords: true,
        fbPage: { select: { id: true, pageId: true, name: true } },
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    const existing = await this.prisma.fbCommentAutomation.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Automation not found');
    await this.prisma.fbCommentAutomation.delete({ where: { id } });
    return { deleted: true };
  }

  async toggle(workspaceId: string, id: string) {
    const existing = await this.prisma.fbCommentAutomation.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException('Automation not found');
    return this.prisma.fbCommentAutomation.update({
      where: { id },
      data: { isActive: !existing.isActive },
      select: { id: true, isActive: true },
    });
  }

  // ── Events / Logs ────────────────────────────────────────────────────────────

  listEvents(
    workspaceId: string,
    automationId: string,
    skip = 0,
    take = 50,
  ) {
    return this.prisma.fbCommentEvent.findMany({
      where: { workspaceId, automationId },
      orderBy: { processedAt: 'desc' },
      skip,
      take,
    });
  }

  // ── Facebook Posts ────────────────────────────────────────────────────────────

  /** Fetch recent posts for a connected Facebook Page via Graph API.
   *  Only returns posts that belong to this workspace. */
  async listPosts(workspaceId: string, pageDbId: string) {
    const page = await this.prisma.facebookPage.findFirst({
      where: { id: pageDbId, workspaceId },
    });
    if (!page) throw new NotFoundException('Facebook page not found');

    const url =
      `${GRAPH_BASE}/${page.pageId}/posts` +
      `?fields=id,message,story,created_time,permalink_url,full_picture` +
      `&limit=30&access_token=${page.pageAccessToken}`;

    const res = await fetch(url);
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        message?: string;
        story?: string;
        created_time?: string;
        permalink_url?: string;
        full_picture?: string;
      }>;
      error?: { message: string };
    };

    if (json.error) {
      throw new Error(`Facebook Graph API error: ${json.error.message}`);
    }

    return (json.data ?? []).map((p) => ({
      postId: p.id,
      message: p.message ?? p.story ?? '(no text)',
      snippet: (p.message ?? p.story ?? '').slice(0, 120),
      createdTime: p.created_time ?? null,
      permalinkUrl: p.permalink_url ?? null,
      thumbnail: p.full_picture ?? null,
    }));
  }
}
