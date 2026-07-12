import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OPT_OUT_DELETE_QUEUE } from '../queue/queue.constants';

const OPT_OUT_KEYWORDS = new Set(['stop', 'unsubscribe', 'cancel', 'end', 'quit']);
const OPT_IN_KEYWORDS = new Set(['start', 'subscribe', 'unstop', 'begin']);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const OPT_OUT_REPLY = "You've been unsubscribed. Reply START to resubscribe.";
export const OPT_IN_REPLY = "You've been resubscribed and will receive messages again. Reply STOP at any time to unsubscribe.";

@Injectable()
export class OptOutService {
  private readonly logger = new Logger(OptOutService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(OPT_OUT_DELETE_QUEUE) private readonly deleteQueue: Queue,
  ) {}

  static isOptOut(text: string): boolean {
    return OPT_OUT_KEYWORDS.has(text.trim().toLowerCase());
  }

  static isOptIn(text: string): boolean {
    return OPT_IN_KEYWORDS.has(text.trim().toLowerCase());
  }

  async markOptOut(contactId: string): Promise<void> {
    await this.prisma.contact.update({
      where: { id: contactId },
      data: { optOut: true },
    });
    await this.deleteQueue.add(
      'delete-opted-out-contact',
      { contactId },
      { delay: SEVEN_DAYS_MS },
    );
    this.logger.log(`Contact ${contactId} opted out — deletion scheduled in 7 days`);
  }

  async markOptIn(contactId: string): Promise<void> {
    await this.prisma.contact.update({
      where: { id: contactId },
      data: { optOut: false },
    });
    // Any pending deletion job is harmless — the processor checks optOut before deleting
    this.logger.log(`Contact ${contactId} opted back in`);
  }
}
