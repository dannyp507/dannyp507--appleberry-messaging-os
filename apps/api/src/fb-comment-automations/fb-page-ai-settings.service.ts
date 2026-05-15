import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MASKED = '••••••••••••••••';

function maskKey(key: string | null | undefined): string | null {
  if (!key?.trim()) return null;
  return MASKED;
}

export interface UpsertPageAiSettingsDto {
  aiProvider?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  systemPrompt?: string;
  // DM Bot settings
  dmAiEnabled?: boolean;
  dmAiFallbackOnly?: boolean;
  dmWelcomeEnabled?: boolean;
  dmWelcomeText?: string;
  dmDefaultReply?: string;
  dmTypingEnabled?: boolean;
  // Human takeover
  aiOffKeyword?: string;
  aiOffReply?: string;
  aiOnKeyword?: string;
  aiOnReply?: string;
}

@Injectable()
export class FbPageAiSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(workspaceId: string, facebookPageId: string) {
    // Verify page belongs to this workspace
    const page = await this.prisma.facebookPage.findFirst({
      where: { id: facebookPageId, workspaceId },
    });
    if (!page) throw new NotFoundException('Facebook page not found');

    const row = await this.prisma.facebookPageAiSettings.findUnique({
      where: { facebookPageId },
    });
    return this.toPublic(row);
  }

  async upsert(workspaceId: string, facebookPageId: string, dto: UpsertPageAiSettingsDto) {
    const page = await this.prisma.facebookPage.findFirst({
      where: { id: facebookPageId, workspaceId },
    });
    if (!page) throw new NotFoundException('Facebook page not found');

    const existing = await this.prisma.facebookPageAiSettings.findUnique({
      where: { facebookPageId },
    });

    // "" = explicit clear, undefined = keep existing, any other string = update
    const openaiApiKey =
      dto.openaiApiKey !== undefined && dto.openaiApiKey !== MASKED
        ? dto.openaiApiKey || null
        : existing?.openaiApiKey ?? null;

    const geminiApiKey =
      dto.geminiApiKey !== undefined && dto.geminiApiKey !== MASKED
        ? dto.geminiApiKey || null
        : existing?.geminiApiKey ?? null;

    const row = await this.prisma.facebookPageAiSettings.upsert({
      where: { facebookPageId },
      create: {
        facebookPageId,
        aiProvider: dto.aiProvider ?? null,
        openaiApiKey,
        openaiModel: dto.openaiModel ?? null,
        geminiApiKey,
        geminiModel: dto.geminiModel ?? null,
        systemPrompt: dto.systemPrompt ?? null,
        dmAiEnabled: dto.dmAiEnabled ?? false,
        dmAiFallbackOnly: dto.dmAiFallbackOnly ?? true,
        dmWelcomeEnabled: dto.dmWelcomeEnabled ?? false,
        dmWelcomeText: dto.dmWelcomeText ?? null,
        dmDefaultReply: dto.dmDefaultReply ?? null,
        dmTypingEnabled: dto.dmTypingEnabled ?? false,
        aiOffKeyword: dto.aiOffKeyword ?? null,
        aiOffReply: dto.aiOffReply ?? null,
        aiOnKeyword: dto.aiOnKeyword ?? null,
        aiOnReply: dto.aiOnReply ?? null,
      },
      update: {
        ...(dto.aiProvider !== undefined && { aiProvider: dto.aiProvider || null }),
        openaiApiKey,
        ...(dto.openaiModel !== undefined && { openaiModel: dto.openaiModel || null }),
        geminiApiKey,
        ...(dto.geminiModel !== undefined && { geminiModel: dto.geminiModel || null }),
        ...(dto.systemPrompt !== undefined && { systemPrompt: dto.systemPrompt || null }),
        ...(dto.dmAiEnabled !== undefined && { dmAiEnabled: dto.dmAiEnabled }),
        ...(dto.dmAiFallbackOnly !== undefined && { dmAiFallbackOnly: dto.dmAiFallbackOnly }),
        ...(dto.dmWelcomeEnabled !== undefined && { dmWelcomeEnabled: dto.dmWelcomeEnabled }),
        ...(dto.dmWelcomeText !== undefined && { dmWelcomeText: dto.dmWelcomeText || null }),
        ...(dto.dmDefaultReply !== undefined && { dmDefaultReply: dto.dmDefaultReply || null }),
        ...(dto.dmTypingEnabled !== undefined && { dmTypingEnabled: dto.dmTypingEnabled }),
        ...(dto.aiOffKeyword !== undefined && { aiOffKeyword: dto.aiOffKeyword || null }),
        ...(dto.aiOffReply !== undefined && { aiOffReply: dto.aiOffReply || null }),
        ...(dto.aiOnKeyword !== undefined && { aiOnKeyword: dto.aiOnKeyword || null }),
        ...(dto.aiOnReply !== undefined && { aiOnReply: dto.aiOnReply || null }),
        updatedAt: new Date(),
      },
    });

    return this.toPublic(row);
  }

  /** Raw (unmasked) — for internal AI calls only */
  async getRaw(facebookPageId: string) {
    return this.prisma.facebookPageAiSettings.findUnique({
      where: { facebookPageId },
    });
  }

  private toPublic(row: {
    aiProvider?: string | null;
    openaiApiKey?: string | null;
    openaiModel?: string | null;
    geminiApiKey?: string | null;
    geminiModel?: string | null;
    systemPrompt?: string | null;
    dmAiEnabled?: boolean;
    dmAiFallbackOnly?: boolean;
    dmWelcomeEnabled?: boolean;
    dmWelcomeText?: string | null;
    dmDefaultReply?: string | null;
    dmTypingEnabled?: boolean;
    aiOffKeyword?: string | null;
    aiOffReply?: string | null;
    aiOnKeyword?: string | null;
    aiOnReply?: string | null;
  } | null) {
    return {
      aiProvider: row?.aiProvider ?? null,
      openaiApiKey: maskKey(row?.openaiApiKey),
      openaiModel: row?.openaiModel ?? null,
      geminiApiKey: maskKey(row?.geminiApiKey),
      geminiModel: row?.geminiModel ?? null,
      systemPrompt: row?.systemPrompt ?? null,
      openaiKeySet: !!row?.openaiApiKey,
      geminiKeySet: !!row?.geminiApiKey,
      dmAiEnabled: row?.dmAiEnabled ?? false,
      dmAiFallbackOnly: row?.dmAiFallbackOnly ?? true,
      dmWelcomeEnabled: row?.dmWelcomeEnabled ?? false,
      dmWelcomeText: row?.dmWelcomeText ?? null,
      dmDefaultReply: row?.dmDefaultReply ?? null,
      dmTypingEnabled: row?.dmTypingEnabled ?? false,
      aiOffKeyword: row?.aiOffKeyword ?? null,
      aiOffReply: row?.aiOffReply ?? null,
      aiOnKeyword: row?.aiOnKeyword ?? null,
      aiOnReply: row?.aiOnReply ?? null,
    };
  }
}
