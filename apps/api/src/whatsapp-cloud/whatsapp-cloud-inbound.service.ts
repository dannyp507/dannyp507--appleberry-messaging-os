import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  INCOMING_MESSAGES_QUEUE,
  type IncomingMessageJob,
} from '../queue/queue.constants';
import type {
  CloudApiMessage,
  CloudApiWebhookChange,
  CloudApiCredentials,
} from './whatsapp-cloud.types';

@Injectable()
export class WhatsAppCloudInboundService {
  private readonly logger = new Logger(WhatsAppCloudInboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(INCOMING_MESSAGES_QUEUE) private readonly incomingQueue: Queue,
  ) {}

  async handleWebhookChange(change: CloudApiWebhookChange): Promise<void> {
    if (change.field !== 'messages') return;

    const { metadata, contacts = [], messages = [] } = change.value;
    const phoneNumberId = metadata.phone_number_id;

    // Resolve phoneNumberId → WhatsApp account
    const account = await this.findAccountByPhoneNumberId(phoneNumberId);
    if (!account) {
      this.logger.warn(
        `No Cloud API account found for phone_number_id=${phoneNumberId}`,
      );
      return;
    }

    for (const msg of messages) {
      // Skip outgoing echoes (shouldn't arrive, but guard anyway)
      if (!msg.from) continue;

      const text = this.extractText(msg);
      if (!text) {
        this.logger.debug(
          `Cloud API: skipping message type=${msg.type} id=${msg.id}`,
        );
        continue;
      }

      const contactProfile = contacts.find((c) => c.wa_id === msg.from);
      const senderName = contactProfile?.profile?.name;

      const job: IncomingMessageJob = {
        whatsappAccountId: account.id,
        from: msg.from,
        remoteJid: msg.from,
        text,
        senderName,
        externalMessageId: msg.id,
      };

      await this.incomingQueue.add('incoming', job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1500 },
        removeOnComplete: 2000,
        removeOnFail: false,
      });

      this.logger.log(
        `Cloud API inbound: from=${msg.from} account=${account.id} text="${text.slice(0, 60)}"`,
      );
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async findAccountByPhoneNumberId(phoneNumberId: string) {
    const accounts = await this.prisma.whatsAppAccount.findMany({
      where: { providerType: 'CLOUD', isArchived: false },
      select: { id: true, credentials: true },
    });
    return (
      accounts.find((a) => {
        const creds = a.credentials as unknown as CloudApiCredentials | null;
        return creds?.phoneNumberId === phoneNumberId;
      }) ?? null
    );
  }

  /**
   * Extract the text payload from a Cloud API message.
   * Handles: plain text, interactive replies (button tap, list selection),
   * and quick-reply button payloads.
   */
  private extractText(msg: CloudApiMessage): string | null {
    if (msg.type === 'text' && msg.text?.body) {
      return msg.text.body;
    }
    if (msg.type === 'interactive' && msg.interactive) {
      if (
        msg.interactive.type === 'button_reply' &&
        msg.interactive.button_reply?.id
      ) {
        return msg.interactive.button_reply.id;
      }
      if (
        msg.interactive.type === 'list_reply' &&
        msg.interactive.list_reply?.id
      ) {
        return msg.interactive.list_reply.id;
      }
    }
    // Quick reply / template button click
    if (msg.type === 'button' && msg.button?.payload) {
      return msg.button.payload;
    }
    return null;
  }
}
