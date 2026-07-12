import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertAiSettingsDto } from './dto/upsert-ai-settings.dto';

const MASKED = '••••••••••••••••';

function maskKey(key: string | null | undefined): string | null {
  if (!key?.trim()) return null;
  return MASKED;
}

@Injectable()
export class WorkspaceAiSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(workspaceId: string) {
    const row = await this.prisma.workspaceAiSettings.findUnique({
      where: { workspaceId },
    });
    if (!row) {
      return {
        defaultProvider: 'openai',
        systemPrompt: null,
        openaiApiKey: null,
        openaiModel: 'gpt-4o-mini',
        geminiApiKey: null,
        geminiModel: 'gemini-2.5-flash',
        openaiKeySet: false,
        geminiKeySet: false,
      };
    }
    return {
      defaultProvider: row.defaultProvider,
      systemPrompt: row.systemPrompt,
      openaiApiKey: maskKey(row.openaiApiKey),
      openaiModel: row.openaiModel,
      geminiApiKey: maskKey(row.geminiApiKey),
      geminiModel: row.geminiModel,
      openaiKeySet: !!row.openaiApiKey,
      geminiKeySet: !!row.geminiApiKey,
    };
  }

  async upsert(workspaceId: string, dto: UpsertAiSettingsDto) {
    const existing = await this.prisma.workspaceAiSettings.findUnique({
      where: { workspaceId },
    });

    // Only update a key if the user passed a real value (not the masked string)
    const openaiApiKey =
      dto.openaiApiKey !== undefined && dto.openaiApiKey !== MASKED
        ? dto.openaiApiKey || null
        : existing?.openaiApiKey ?? null;

    const geminiApiKey =
      dto.geminiApiKey !== undefined && dto.geminiApiKey !== MASKED
        ? dto.geminiApiKey || null
        : existing?.geminiApiKey ?? null;

    const row = await this.prisma.workspaceAiSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        defaultProvider: dto.defaultProvider ?? 'openai',
        systemPrompt: dto.systemPrompt ?? null,
        openaiApiKey,
        openaiModel: dto.openaiModel ?? 'gpt-4o-mini',
        geminiApiKey,
        geminiModel: dto.geminiModel ?? 'gemini-2.5-flash',
      },
      update: {
        ...(dto.defaultProvider !== undefined && {
          defaultProvider: dto.defaultProvider,
        }),
        ...(dto.systemPrompt !== undefined && {
          systemPrompt: dto.systemPrompt,
        }),
        openaiApiKey,
        ...(dto.openaiModel !== undefined && { openaiModel: dto.openaiModel }),
        geminiApiKey,
        ...(dto.geminiModel !== undefined && { geminiModel: dto.geminiModel }),
        updatedAt: new Date(),
      },
    });

    return {
      defaultProvider: row.defaultProvider,
      systemPrompt: row.systemPrompt,
      openaiApiKey: maskKey(row.openaiApiKey),
      openaiModel: row.openaiModel,
      geminiApiKey: maskKey(row.geminiApiKey),
      geminiModel: row.geminiModel,
      openaiKeySet: !!row.openaiApiKey,
      geminiKeySet: !!row.geminiApiKey,
    };
  }

  /** Internal use only — returns raw (unmasked) workspace keys for AI calls */
  async getRaw(workspaceId: string) {
    return this.prisma.workspaceAiSettings.findUnique({
      where: { workspaceId },
    });
  }

  /** Internal use only — returns raw (unmasked) page-level AI settings */
  async getPageRaw(facebookPageId: string) {
    return this.prisma.facebookPageAiSettings.findUnique({
      where: { facebookPageId },
    });
  }

  /** Internal use only — returns raw (unmasked) Instagram account AI settings */
  async getIgAccountRaw(instagramAccountId: string) {
    return this.prisma.instagramAccountAiSettings.findUnique({
      where: { instagramAccountId },
    });
  }

  /** Internal use only — returns raw (unmasked) WhatsApp account AI settings */
  async getWhatsAppAccountRaw(whatsappAccountId: string) {
    return this.prisma.whatsAppAccountAiSettings.findUnique({
      where: { whatsappAccountId },
    });
  }

  /** Public — returns masked WhatsApp account AI settings */
  async getWhatsAppAccount(whatsappAccountId: string) {
    const row = await this.prisma.whatsAppAccountAiSettings.findUnique({
      where: { whatsappAccountId },
    });
    if (!row) {
      return {
        aiProvider: null, systemPrompt: null,
        openaiApiKey: null, openaiModel: null, openaiKeySet: false,
        geminiApiKey: null, geminiModel: null, geminiKeySet: false,
        dmAiEnabled: false, dmAiFallbackOnly: true,
        dmWelcomeEnabled: false, dmWelcomeText: null,
        dmDefaultReply: null, dmTypingEnabled: false,
        aiOffKeyword: null, aiOffReply: null,
        aiOnKeyword: null, aiOnReply: null,
        // AGENT FIX: agent-side takeover keywords (new fields)
        agentOffKeyword: null, agentOnKeyword: null,
      };
    }
    return {
      aiProvider: row.aiProvider,
      systemPrompt: row.systemPrompt,
      openaiApiKey: maskKey(row.openaiApiKey),
      openaiModel: row.openaiModel,
      openaiKeySet: !!row.openaiApiKey,
      geminiApiKey: maskKey(row.geminiApiKey),
      geminiModel: row.geminiModel,
      geminiKeySet: !!row.geminiApiKey,
      dmAiEnabled: row.dmAiEnabled,
      dmAiFallbackOnly: row.dmAiFallbackOnly,
      dmWelcomeEnabled: row.dmWelcomeEnabled,
      dmWelcomeText: row.dmWelcomeText,
      dmDefaultReply: row.dmDefaultReply,
      dmTypingEnabled: row.dmTypingEnabled,
      aiOffKeyword: row.aiOffKeyword,
      aiOffReply: row.aiOffReply,
      aiOnKeyword: row.aiOnKeyword,
      aiOnReply: row.aiOnReply,
      // AGENT FIX: agent-side takeover keywords
      agentOffKeyword: row.agentOffKeyword,
      agentOnKeyword: row.agentOnKeyword,
    };
  }

  /** Public — upserts WhatsApp account AI settings */
  async upsertWhatsAppAccount(whatsappAccountId: string, dto: Record<string, unknown>) {
    const existing = await this.prisma.whatsAppAccountAiSettings.findUnique({
      where: { whatsappAccountId },
    });
    const openaiApiKey =
      dto['openaiApiKey'] !== undefined && dto['openaiApiKey'] !== MASKED
        ? (dto['openaiApiKey'] as string) || null
        : existing?.openaiApiKey ?? null;
    const geminiApiKey =
      dto['geminiApiKey'] !== undefined && dto['geminiApiKey'] !== MASKED
        ? (dto['geminiApiKey'] as string) || null
        : existing?.geminiApiKey ?? null;

    const row = await this.prisma.whatsAppAccountAiSettings.upsert({
      where: { whatsappAccountId },
      create: {
        whatsappAccountId,
        aiProvider: (dto['aiProvider'] as string) ?? null,
        systemPrompt: (dto['systemPrompt'] as string) ?? null,
        openaiApiKey,
        openaiModel: (dto['openaiModel'] as string) ?? null,
        geminiApiKey,
        geminiModel: (dto['geminiModel'] as string) ?? null,
        dmAiEnabled: (dto['dmAiEnabled'] as boolean) ?? false,
        dmAiFallbackOnly: (dto['dmAiFallbackOnly'] as boolean) ?? true,
        dmWelcomeEnabled: (dto['dmWelcomeEnabled'] as boolean) ?? false,
        dmWelcomeText: (dto['dmWelcomeText'] as string) ?? null,
        dmDefaultReply: (dto['dmDefaultReply'] as string) ?? null,
        dmTypingEnabled: (dto['dmTypingEnabled'] as boolean) ?? false,
        aiOffKeyword: (dto['aiOffKeyword'] as string) ?? null,
        aiOffReply: (dto['aiOffReply'] as string) ?? null,
        aiOnKeyword: (dto['aiOnKeyword'] as string) ?? null,
        aiOnReply: (dto['aiOnReply'] as string) ?? null,
        // AGENT FIX: agent-side takeover keywords
        agentOffKeyword: (dto['agentOffKeyword'] as string) ?? null,
        agentOnKeyword: (dto['agentOnKeyword'] as string) ?? null,
      },
      update: {
        ...(dto['aiProvider'] !== undefined && { aiProvider: dto['aiProvider'] as string }),
        ...(dto['systemPrompt'] !== undefined && { systemPrompt: dto['systemPrompt'] as string }),
        openaiApiKey,
        ...(dto['openaiModel'] !== undefined && { openaiModel: dto['openaiModel'] as string }),
        geminiApiKey,
        ...(dto['geminiModel'] !== undefined && { geminiModel: dto['geminiModel'] as string }),
        ...(dto['dmAiEnabled'] !== undefined && { dmAiEnabled: dto['dmAiEnabled'] as boolean }),
        ...(dto['dmAiFallbackOnly'] !== undefined && { dmAiFallbackOnly: dto['dmAiFallbackOnly'] as boolean }),
        ...(dto['dmWelcomeEnabled'] !== undefined && { dmWelcomeEnabled: dto['dmWelcomeEnabled'] as boolean }),
        ...(dto['dmWelcomeText'] !== undefined && { dmWelcomeText: dto['dmWelcomeText'] as string }),
        ...(dto['dmDefaultReply'] !== undefined && { dmDefaultReply: dto['dmDefaultReply'] as string }),
        ...(dto['dmTypingEnabled'] !== undefined && { dmTypingEnabled: dto['dmTypingEnabled'] as boolean }),
        ...(dto['aiOffKeyword'] !== undefined && { aiOffKeyword: dto['aiOffKeyword'] as string }),
        ...(dto['aiOffReply'] !== undefined && { aiOffReply: dto['aiOffReply'] as string }),
        ...(dto['aiOnKeyword'] !== undefined && { aiOnKeyword: dto['aiOnKeyword'] as string }),
        ...(dto['aiOnReply'] !== undefined && { aiOnReply: dto['aiOnReply'] as string }),
        // AGENT FIX: agent-side takeover keywords
        ...(dto['agentOffKeyword'] !== undefined && { agentOffKeyword: dto['agentOffKeyword'] as string }),
        ...(dto['agentOnKeyword'] !== undefined && { agentOnKeyword: dto['agentOnKeyword'] as string }),
        updatedAt: new Date(),
      },
    });

    return this.getWhatsAppAccount(row.whatsappAccountId);
  }
}
