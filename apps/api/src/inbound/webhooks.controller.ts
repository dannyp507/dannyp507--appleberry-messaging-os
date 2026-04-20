import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import {
  INCOMING_MESSAGES_QUEUE,
  type IncomingMessageJob,
} from '../queue/queue.constants';
import { InboundWebhookDto } from './dto/inbound-webhook.dto';
import { WebhookSecretGuard } from './guards/webhook-secret.guard';

@SkipThrottle()
@Controller()
export class WebhooksController {
  constructor(
    @InjectQueue(INCOMING_MESSAGES_QUEUE)
    private readonly incomingQueue: Queue,
  ) {}

  @Public()
  @UseGuards(WebhookSecretGuard)
  @Post('webhooks/whatsapp/inbound')
  async inbound(@Body() body: InboundWebhookDto) {
    const job: IncomingMessageJob = {
      whatsappAccountId: body.whatsappAccountId,
      from: body.from,
      remoteJid: body.from, // webhook callers provide phone as from; use as JID fallback
      text: body.text,
      externalMessageId: body.externalMessageId,
    };
    await this.incomingQueue.add('incoming', job, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
    });
    return { queued: true as const };
  }
}
