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
        geminiModel: 'gemini-1.5-flash',
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
        geminiModel: dto.geminiModel ?? 'gemini-1.5-flash',
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

  /** Internal use only — returns raw (unmasked) keys for AI calls */
  async getRaw(workspaceId: string) {
    return this.prisma.workspaceAiSettings.findUnique({
      where: { workspaceId },
    });
  }
}
