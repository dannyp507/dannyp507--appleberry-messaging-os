import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpsertBrandSettingsDto } from './dto/upsert-brand-settings.dto';

@Injectable()
export class BrandSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(workspaceId: string) {
    const row = await this.prisma.workspaceBrandSettings.findUnique({
      where: { workspaceId },
    });
    return (
      row ?? {
        businessName: null,
        industry: null,
        toneOfVoice: null,
        productsServices: null,
        faqs: null,
        businessHours: null,
        contactDetails: null,
        websiteUrl: null,
        wordsToUse: null,
        wordsToAvoid: null,
        escalationInstructions: null,
        customInstructions: null,
      }
    );
  }

  async upsert(workspaceId: string, dto: UpsertBrandSettingsDto) {
    return this.prisma.workspaceBrandSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, ...dto },
      update: {
        ...dto,
        updatedAt: new Date(),
      },
    });
  }

  /** Build an AI system prompt string from the stored brand settings.
   *  Used by the comment processor to enrich AI-generated replies. */
  async buildSystemPrompt(workspaceId: string, overridePrompt?: string | null): Promise<string> {
    if (overridePrompt) return overridePrompt;

    const s = await this.prisma.workspaceBrandSettings.findUnique({
      where: { workspaceId },
    });
    if (!s) {
      return 'You are a helpful customer service assistant. Reply concisely and professionally. Keep replies under 200 characters.';
    }

    const parts: string[] = [];
    if (s.businessName) parts.push(`Business: ${s.businessName}`);
    if (s.industry)     parts.push(`Industry: ${s.industry}`);
    if (s.toneOfVoice)  parts.push(`Tone: ${s.toneOfVoice}`);
    if (s.productsServices) parts.push(`Products/Services: ${s.productsServices}`);
    if (s.faqs)         parts.push(`FAQs: ${s.faqs}`);
    if (s.businessHours) parts.push(`Business Hours: ${s.businessHours}`);
    if (s.contactDetails) parts.push(`Contact: ${s.contactDetails}`);
    if (s.websiteUrl)   parts.push(`Website: ${s.websiteUrl}`);
    if (s.wordsToUse)   parts.push(`Always use phrases like: ${s.wordsToUse}`);
    if (s.wordsToAvoid) parts.push(`Never use: ${s.wordsToAvoid}`);
    if (s.escalationInstructions) parts.push(`Escalation: ${s.escalationInstructions}`);
    if (s.customInstructions) parts.push(s.customInstructions);

    parts.push('Reply concisely in plain text. Keep replies under 250 characters for social media.');

    return parts.join('\n');
  }
}
