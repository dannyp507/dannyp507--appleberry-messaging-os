import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AiReplyContext = {
  workspaceId: string;
  contactId: string;
  threadId?: string;
  recentMessages?: Array<{ direction: string; message: string }>;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Returns assistant reply text, or null if AI is disabled / call fails.
   */
  async generateReply(
    context: AiReplyContext,
    message: string,
  ): Promise<string | null> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey?.trim()) {
      this.logger.debug('OPENAI_API_KEY not set; skipping AI reply');
      return null;
    }

    const model = this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');

    const history =
      context.recentMessages?.map((m) => ({
        role:
          m.direction === 'INBOUND' || m.direction === 'inbound'
            ? ('user' as const)
            : ('assistant' as const),
        content: m.message,
      })) ?? [];

    const messages: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content:
          'You are a helpful customer support assistant for a business using WhatsApp. ' +
          'Reply concisely in plain text. If you cannot help, suggest the user contact a human agent.',
      },
      ...history,
      { role: 'user', content: message },
    ];

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 500,
          temperature: 0.4,
        }),
      });

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (!res.ok) {
        this.logger.warn(
          `OpenAI error ${res.status}: ${data.error?.message ?? JSON.stringify(data)}`,
        );
        return null;
      }

      const text = data.choices?.[0]?.message?.content?.trim();
      return text || null;
    } catch (e) {
      this.logger.warn(
        `OpenAI request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }
}
