import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InboxMessageDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';

// How long after a price reply before we send the first nudge
const FIRST_FOLLOW_UP_MS  =  2 * 60 * 60 * 1000; // 2h after price
// How long after the first nudge before the second
const SECOND_FOLLOW_UP_MS = 22 * 60 * 60 * 1000; // 22h later = ~24h after price
// How long after the second nudge before the third (and final) one
const THIRD_FOLLOW_UP_MS  = 24 * 60 * 60 * 1000; // 24h later = ~48h after price
// Maximum follow-ups per lead (3 total)
const MAX_FOLLOW_UPS = 3;
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
      const nextDelayMs = newCount === 1 ? SECOND_FOLLOW_UP_MS : THIRD_FOLLOW_UP_MS;
      const nextInLabel = newCount === 1 ? '22h' : '24h';
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: {
          followUpScheduledFor: new Date(Date.now() + nextDelayMs),
          followUpCount: newCount,
        },
      });
      this.logger.log(`[FollowUp] Thread ${thread.id} — follow-up #${newCount} sent, next in ${nextInLabel}`);
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
    const priceRef = priceContext ? `that ${priceContext} repair` : 'the repair';

    if (count === 0) {
      // 2h — soft check-in + open the door to negotiation
      return (
        `${hi} Just checking in from AppleBerry 😊\n\n` +
        `Still thinking about ${priceRef}? If the quote felt a bit steep, don't stress — ` +
        `pop in and we can have a chat. We always try to find a way to help 💪\n\n` +
        `We're open Mon–Fri 9am–5pm and Sat 9am–2pm 🔧`
      );
    }

    if (count === 1) {
      // 24h — empathy + genuine negotiation offer
      return (
        `${hi} We'd genuinely rather help you get sorted than see your device stay broken 🙏\n\n` +
        `Pop in and tell us your budget — our technicians will see what we can work out together. No pressure at all.\n\n` +
        `Beacon Bay Crossing (East London) or 152 Main Road Walmer (GQ)\n` +
        `Mon–Fri 9am–5pm · Sat 9am–2pm`
      );
    }

    // 48h — final close with last-chance energy
    return (
      `Last chance to get this sorted 👀\n\n` +
      `We still have a couple of slots left this week. Even if budget is tight — come in, let's talk. ` +
      `We'd much rather work something out than leave you without your device 📱\n\n` +
      `Beacon Bay Crossing (East London) or 152 Main Road Walmer (GQ)\n` +
      `Mon–Fri 9am–5pm · Sat 9am–2pm`
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
