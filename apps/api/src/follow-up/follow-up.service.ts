import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InboxMessageDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';

// How long after a price reply before we send the first nudge
const FIRST_FOLLOW_UP_MS  = 2  * 60 * 60 * 1000; // 2 hours
// How long after the first nudge before the second (and final) one
const SECOND_FOLLOW_UP_MS = 22 * 60 * 60 * 1000; // 22h later = ~24h after price
// Maximum follow-ups per lead (2 total: a soft nudge + a closing push)
const MAX_FOLLOW_UPS = 2;
// How often the worker checks for due follow-ups
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

@Injectable()
export class FollowUpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FollowUpService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
  ) {}

  onModuleInit() {
    // Delay first run by 30s so the app is fully ready before we start querying
    setTimeout(() => {
      this.processFollowUps().catch((e) =>
        this.logger.error(`Initial follow-up run failed: ${e?.message}`),
      );
      this.timer = setInterval(() => {
        this.processFollowUps().catch((e) =>
          this.logger.error(`Follow-up run failed: ${e?.message}`),
        );
      }, CHECK_INTERVAL_MS);
    }, 30_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processFollowUps(): Promise<void> {
    const due = await this.prisma.inboxThread.findMany({
      where: {
        followUpScheduledFor: { lte: new Date() },
        aiPaused: false,
        whatsappAccountId: { not: null },
      },
      include: {
        contact: { select: { id: true, phone: true, firstName: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: { direction: true, message: true },
        },
      },
    });

    if (due.length > 0) {
      this.logger.log(`[FollowUp] ${due.length} thread(s) due for follow-up`);
    }

    for (const thread of due) {
      try {
        await this.handleThread(thread);
      } catch (e) {
        this.logger.error(
          `[FollowUp] Failed to process thread ${thread.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  private async handleThread(thread: {
    id: string;
    workspaceId: string;
    whatsappAccountId: string | null;
    followUpCount: number;
    contact: { id: string; phone: string; firstName: string };
    messages: { direction: InboxMessageDirection; message: string }[];
  }): Promise<void> {
    // If the most recent message is INBOUND, the customer already replied — cancel
    const lastMsg = thread.messages[0];
    if (!lastMsg || lastMsg.direction === InboxMessageDirection.INBOUND) {
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { followUpScheduledFor: null, followUpCount: 0 },
      });
      this.logger.log(`[FollowUp] Thread ${thread.id} — customer replied, cancelled`);
      return;
    }

    const priceContext = this.extractPriceContext(thread.messages);
    const followUpText = this.buildMessage(thread.followUpCount, priceContext, thread.contact.firstName);

    await this.messages.enqueueOutboundText({
      workspaceId: thread.workspaceId,
      whatsappAccountId: thread.whatsappAccountId!,
      to: thread.contact.phone,
      message: followUpText,
      contactId: thread.contact.id,
      inboxThreadId: thread.id,
    });

    const newCount = thread.followUpCount + 1;

    if (newCount < MAX_FOLLOW_UPS) {
      // Schedule the next (final) follow-up
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: {
          followUpScheduledFor: new Date(Date.now() + SECOND_FOLLOW_UP_MS),
          followUpCount: newCount,
        },
      });
      this.logger.log(`[FollowUp] Thread ${thread.id} — follow-up #${newCount} sent, next in 22h`);
    } else {
      // All follow-ups exhausted — clear the scheduler
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { followUpScheduledFor: null, followUpCount: newCount },
      });
      this.logger.log(`[FollowUp] Thread ${thread.id} — final follow-up #${newCount} sent, sequence complete`);
    }
  }

  // Pull the most recently mentioned price (e.g. "R1999", "R 999") from messages
  private extractPriceContext(
    messages: { direction: InboxMessageDirection; message: string }[],
  ): string {
    for (const msg of messages) {
      if (msg.direction !== InboxMessageDirection.OUTBOUND) continue;
      const match = msg.message.match(/R\s?\d{3,}/i);
      if (match) return match[0].replace(/\s/, '');
    }
    return '';
  }

  private buildMessage(count: number, priceContext: string, firstName: string): string {
    const name = firstName && firstName !== 'Unknown' ? firstName : null;
    const hi = name ? `Hey ${name}!` : 'Hey!';

    if (count === 0) {
      // First nudge — soft check-in
      if (priceContext) {
        return (
          `${hi} Just checking in from AppleBerry 😊\n\n` +
          `Still thinking about that ${priceContext} repair? We can usually get it sorted same day — ` +
          `pop in anytime or let us know when works for you and we'll have a technician ready 🔧`
        );
      }
      return (
        `${hi} Just checking in from AppleBerry 😊\n\n` +
        `Still thinking about the repair? We can usually get it done same day — ` +
        `pop in anytime Mon–Fri 9am–5pm or Sat 9am–2pm 🔧`
      );
    }

    // Second nudge — closing push with urgency
    return (
      `Last chance this week 👀\n\n` +
      `Our technicians are ready and slots are filling up fast. ` +
      `We're open Mon–Fri 9am–5pm and Sat 9am–2pm at Beacon Bay Crossing (East London) or 152 Main Road Walmer (GQ).\n\n` +
      `Don't let your device get worse — come through whenever works for you 📱`
    );
  }

  /**
   * Called by IncomingMessageService when the bot sends a reply containing a price.
   * Schedules the first follow-up in 2 hours.
   */
  async scheduleForThread(threadId: string): Promise<void> {
    await this.prisma.inboxThread.update({
      where: { id: threadId },
      data: {
        followUpScheduledFor: new Date(Date.now() + FIRST_FOLLOW_UP_MS),
        followUpCount: 0,
      },
    });
    this.logger.log(`[FollowUp] Scheduled for thread ${threadId} (fires in 2h)`);
  }

  /**
   * Called by IncomingMessageService when a customer replies.
   * Cancels any pending follow-up for that thread.
   */
  async cancelForThread(threadId: string, hadScheduled: boolean): Promise<void> {
    if (!hadScheduled) return;
    await this.prisma.inboxThread.update({
      where: { id: threadId },
      data: { followUpScheduledFor: null, followUpCount: 0 },
    });
    this.logger.log(`[FollowUp] Cancelled for thread ${threadId} (customer replied)`);
  }
}
