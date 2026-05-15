import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkspaceAiSettingsService } from '../workspace-ai-settings/workspace-ai-settings.service';

export type AiReplyContext = {
  workspaceId: string;
  contactId: string;
  threadId?: string;
  recentMessages?: Array<{ direction: string; message: string }>;
  /** When set, page-level AI settings are checked first (key + system prompt) */
  facebookPageId?: string;
  /** When set, Instagram account AI settings are checked first (key + system prompt) */
  instagramAccountId?: string;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly aiSettings: WorkspaceAiSettingsService,
  ) {}

  async generateReply(
    context: AiReplyContext,
    message: string,
    overrideSystemPrompt?: string,
  ): Promise<string | null> {
    // Resolution order: page settings → workspace settings → env var
    const workspaceSettings = await this.aiSettings.getRaw(context.workspaceId);

    // Lazily load channel-level settings (Facebook page or Instagram account)
    let pageSettings: {
      aiProvider?: string | null;
      openaiApiKey?: string | null;
      openaiModel?: string | null;
      geminiApiKey?: string | null;
      geminiModel?: string | null;
      systemPrompt?: string | null;
    } | null = null;

    if (context.facebookPageId) {
      // Avoid circular dep — query prisma directly via the settings service
      pageSettings = await this.aiSettings.getPageRaw(context.facebookPageId);
    } else if (context.instagramAccountId) {
      pageSettings = await this.aiSettings.getIgAccountRaw(context.instagramAccountId);
    }

    const isChannelScoped = !!(context.facebookPageId || context.instagramAccountId);

    // Provider: channel → workspace → default
    const provider =
      pageSettings?.aiProvider ||
      workspaceSettings?.defaultProvider ||
      'openai';

    // System prompt resolution:
    // - For channel-scoped (FB/IG): channel prompt only (never leak workspace/WhatsApp prompt)
    // - For other channels: workspace prompt → built-in default
    const CHANNEL_DEFAULT =
      'You are a helpful customer support assistant. Reply concisely and professionally. If you cannot help, ask the customer to contact the team directly.';
    const systemPrompt =
      overrideSystemPrompt ??
      pageSettings?.systemPrompt ??
      (isChannelScoped
        ? CHANNEL_DEFAULT                  // channel-scoped — never fall back to workspace prompt
        : (workspaceSettings?.systemPrompt ?? CHANNEL_DEFAULT));

    const history =
      context.recentMessages?.map((m) => ({
        role:
          m.direction === 'INBOUND' || m.direction === 'inbound'
            ? ('user' as const)
            : ('assistant' as const),
        content: m.message,
      })) ?? [];

    // The inbound message is persisted to DB *before* the history is queried,
    // so it already appears as the last entry in `history`. Remove it here to
    // avoid sending it twice (once in history, once as the final user turn).
    const lastH = history[history.length - 1];
    const dedupedHistory =
      lastH?.role === 'user' && lastH.content === message
        ? history.slice(0, -1)
        : history;

    if (provider === 'gemini') {
      // Key: page → workspace → env
      const apiKey =
        pageSettings?.geminiApiKey?.trim() ||
        workspaceSettings?.geminiApiKey?.trim() ||
        this.config.get<string>('GEMINI_API_KEY') ||
        '';
      if (!apiKey) {
        this.logger.debug('Gemini API key not set; skipping AI reply');
        return null;
      }
      const model =
        pageSettings?.geminiModel ||
        workspaceSettings?.geminiModel ||
        'gemini-2.5-flash';
      return this.callGemini(apiKey, model, systemPrompt, dedupedHistory, message);
    }

    // Default: OpenAI — key: page → workspace → env
    const apiKey =
      pageSettings?.openaiApiKey?.trim() ||
      workspaceSettings?.openaiApiKey?.trim() ||
      this.config.get<string>('OPENAI_API_KEY') ||
      '';
    if (!apiKey) {
      this.logger.debug('OpenAI API key not set; skipping AI reply');
      return null;
    }
    const model =
      pageSettings?.openaiModel ||
      workspaceSettings?.openaiModel ||
      this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    return this.callOpenAi(apiKey, model, systemPrompt, dedupedHistory, message);
  }

  // ── OpenAI ──────────────────────────────────────────────────────────────────

  private async callOpenAi(
    apiKey: string,
    model: string,
    systemPrompt: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    userMessage: string,
  ): Promise<string | null> {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.4 }),
      });

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (!res.ok) {
        this.logger.warn(`OpenAI error ${res.status}: ${data.error?.message ?? JSON.stringify(data)}`);
        return null;
      }
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) {
      this.logger.warn(`OpenAI request failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  // ── Gemini ──────────────────────────────────────────────────────────────────

  private async callGemini(
    apiKey: string,
    model: string,
    systemPrompt: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    userMessage: string,
  ): Promise<string | null> {
    const contents = [
      ...history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 500, temperature: 0.4 },
        }),
      });

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { message?: string };
      };

      if (!res.ok) {
        this.logger.warn(`Gemini error ${res.status}: ${data.error?.message ?? JSON.stringify(data)}`);
        return null;
      }
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (e) {
      this.logger.warn(`Gemini request failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
