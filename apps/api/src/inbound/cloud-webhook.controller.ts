import { Controller, Get, Headers, Logger, Post, Query, RawBody, Res } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Response } from 'express';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';
import { INCOMING_MESSAGES_QUEUE, type IncomingMessageJob } from '../queue/queue.constants';

// ── Meta Cloud API webhook payload types ─────────────────────────────────────

interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string };
  button?: { text: string; payload: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
}

interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: MetaMessage[];
        statuses?: unknown[];
      };
    }>;
  }>;
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('webhooks/whatsapp')
@SkipThrottle()
export class CloudWebhookController {
  private readonly logger = new Logger(CloudWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(INCOMING_MESSAGES_QUEUE) private readonly incomingQueue: Queue,
  ) {}

  /**
   * GET /webhooks/whatsapp/cloud
   * Meta calls this once to verify the endpoint.
   * Responds with hub.challenge as plain text if the verify token matches.
   */
  @Public()
  @Get('cloud')
  verifyWebhook(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ): void {
    const expected = this.config.get<string>('META_WEBHOOK_VERIFY_TOKEN') ?? '';
    if (!expected) {
      this.logger.warn('META_WEBHOOK_VERIFY_TOKEN not set — Cloud API webhook verification will fail');
      res.status(403).send('Webhook verify token not configured');
      return;
    }
    if (mode === 'subscribe' && token === expected) {
      this.logger.log('Meta Cloud API webhook verified successfully');
      res.status(200).send(challenge ?? '');
      return;
    }
    this.logger.warn(`Cloud API webhook verification failed — mode=${mode} token_match=${token === expected}`);
    res.status(403).send('Forbidden');
  }

  /**
   * POST /webhooks/whatsapp/cloud
   * Receives all inbound WhatsApp Cloud API events.
   * Verifies X-Hub-Signature-256 when META_APP_SECRET is set.
   * Always responds 200 immediately — processing is fire-and-forget so Meta
   * does not retry on slow downstream operations.
   */
  @Public()
  @Post('cloud')
  receiveWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('x-hub-signature-256') sig: string | undefined,
    @Res() res: Response,
  ): void {
    const appSecret = this.config.get<string>('META_APP_SECRET') ?? '';

    if (appSecret) {
      if (!sig) {
        this.logger.warn('Cloud API webhook: missing X-Hub-Signature-256 — request rejected');
        res.status(403).send('Missing signature');
        return;
      }
      const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
      const sigBuf = Buffer.from(sig);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        this.logger.warn('Cloud API webhook: invalid HMAC signature — request rejected');
        res.status(403).send('Forbidden');
        return;
      }
    }

    // Respond immediately — Meta requires 200 within 20 s
    res.status(200).send('EVENT_RECEIVED');

    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as MetaWebhookPayload;
    } catch {
      this.logger.error('Cloud API webhook: failed to parse JSON body');
      return;
    }

    if (payload.object !== 'whatsapp_business_account') return;

    void this.processPayload(payload);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async processPayload(payload: MetaWebhookPayload): Promise<void> {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value.messages?.length) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Map Meta phone_number_id → our WhatsAppAccount row
        const account = await this.prisma.whatsAppAccount.findFirst({
          where: { cloudPhoneNumberId: phoneNumberId, isArchived: false },
        });
        if (!account) {
          this.logger.warn(
            `Cloud API webhook: no account found for phone_number_id=${phoneNumberId}`,
          );
          continue;
        }

        // Build a name lookup from the contacts array
        const nameMap: Record<string, string> = {};
        for (const c of value.contacts ?? []) {
          nameMap[c.wa_id] = c.profile.name;
        }

        for (const msg of value.messages) {
          // Skip status updates routed to the messages array (shouldn't happen, but safe)
          if (!msg.from || !msg.id) continue;

          const text = this.extractText(msg);
          if (!text) {
            this.logger.warn(
              `Cloud API webhook: message from ${msg.from} has no extractable text — ` +
              `type=${msg.type} msgId=${msg.id}`,
            );
            continue;
          }

          const job: IncomingMessageJob = {
            whatsappAccountId: account.id,
            from: msg.from,
            remoteJid: msg.from,
            text,
            senderName: nameMap[msg.from],
            externalMessageId: msg.id,
          };

          await this.incomingQueue.add('incoming', job, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1500 },
            removeOnComplete: 2000,
            removeOnFail: false,
          });

          this.logger.log(
            `Cloud API: enqueued inbound from ${msg.from} (account=${account.id})`,
          );
        }
      }
    }
  }

  /**
   * Extract a plain-text string from the Meta message payload.
   * Returns null for types that carry no automatable text (audio, sticker, etc.).
   */
  private extractText(msg: MetaMessage): string | null {
    switch (msg.type) {
      case 'text':
        return msg.text?.body?.trim() || null;
      case 'button':
        // Quick-reply button tap — the button label is the trigger text
        return msg.button?.text?.trim() || null;
      case 'interactive':
        return (
          msg.interactive?.button_reply?.title?.trim() ||
          msg.interactive?.list_reply?.title?.trim() ||
          null
        );
      case 'image':
        return msg.image?.caption?.trim() || null;
      case 'video':
        return msg.video?.caption?.trim() || null;
      case 'document':
        return msg.document?.caption?.trim() || null;
      default:
        return null;
    }
  }
}
