import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppCloudInboundService } from './whatsapp-cloud-inbound.service';
import type { CloudApiCredentials, CloudApiWebhookPayload } from './whatsapp-cloud.types';

/**
 * Handles Meta's WhatsApp Cloud API webhooks.
 *
 * Register this URL in Meta Business Manager:
 *   Webhook URL:   https://appleberry-app.duckdns.org/api/whatsapp-cloud/webhook
 *   Verify token:  (the verifyToken stored in your WhatsApp account credentials)
 *   Subscribe to:  messages
 */
@Controller('whatsapp-cloud')
export class WhatsAppCloudWebhookController {
  private readonly logger = new Logger(WhatsAppCloudWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbound: WhatsAppCloudInboundService,
  ) {}

  /**
   * GET — Meta's webhook verification challenge.
   * Meta sends hub.challenge and expects it echoed back when hub.verify_token matches.
   */
  @Get('webhook')
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode !== 'subscribe' || !verifyToken) {
      res.sendStatus(400);
      return;
    }

    const accounts = await this.prisma.whatsAppAccount.findMany({
      where: { providerType: 'CLOUD', isArchived: false },
      select: { id: true, credentials: true },
    });

    const match = accounts.find((a) => {
      const creds = a.credentials as unknown as CloudApiCredentials | null;
      return creds?.verifyToken && creds.verifyToken === verifyToken;
    });

    if (!match) {
      this.logger.warn(
        `Webhook verification failed — no account with verifyToken="${verifyToken}"`,
      );
      res.sendStatus(403);
      return;
    }

    this.logger.log(`Webhook verified for account ${match.id}`);
    res.status(200).send(challenge);
  }

  /**
   * POST — inbound messages from Meta.
   * Must respond 200 immediately; process async to avoid Meta timeouts.
   */
  @Post('webhook')
  @HttpCode(200)
  handleWebhook(@Body() body: CloudApiWebhookPayload) {
    if (body?.object !== 'whatsapp_business_account') return { status: 'ignored' };

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        this.inbound.handleWebhookChange(change).catch((e: Error) =>
          this.logger.error(`Cloud inbound error: ${e.message}`, e.stack),
        );
      }
    }

    return { status: 'ok' };
  }
}
