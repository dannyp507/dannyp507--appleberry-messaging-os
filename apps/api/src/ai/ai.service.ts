import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkspaceAiSettingsService } from '../workspace-ai-settings/workspace-ai-settings.service';

export type AiReplyContext = {
  workspaceId: string;
  contactId: string;
  threadId?: string;
  recentMessages?: Array<{ direction: string; message: string }>;
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
    const settings = await this.aiSettings.getRaw(context.workspaceId);

    // Resolve provider, key, model — workspace DB wins over env vars
    const provider = settings?.defaultProvider ?? 'openai';
    const systemPrompt =
      overrideSystemPrompt ??
      settings?.systemPrompt ??
      'You are a helpful customer support assistant. Reply concisely in plain text. If you cannot help, suggest the user contact a human agent.';

    const history =
      context.recentMessages?.map((m) => ({
        role:
          m.direction === 'INBOUND' || m.direction === 'inbound'
            ? ('user' as const)
            : ('assistant' as const),
        content: m.message,
      })) ?? [];

    if (provider === 'gemini') {
      const apiKey =
        settings?.geminiApiKey?.trim() ||
        this.config.get<string>('GEMINI_API_KEY') ||
        '';
      if (!apiKey) {
        this.logger.debug('Gemini API key not set; skipping AI reply');
        return null;
      }
      const model = settings?.geminiModel ?? 'gemini-1.5-flash';
      return this.callGemini(apiKey, model, systemPrompt, history, message);
    }

    // Default: OpenAI
    const apiKey =
      settings?.openaiApiKey?.trim() ||
      this.config.get<string>('OPENAI_API_KEY') ||
      '';
    if (!apiKey) {
      this.logger.debug('OpenAI API key not set; skipping AI reply');
      return null;
    }
    const model =
      settings?.openaiModel ??
      this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    return this.callOpenAi(apiKey, model, systemPrompt, history, message);
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
