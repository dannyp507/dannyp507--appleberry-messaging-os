import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InboxMessageDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';

// ── Price-track constants ────────────────────────────────────────────────────
const FIRST_FOLLOW_UP_MS  =  2 * 60 * 60 * 1000; // 2h after price
const SECOND_FOLLOW_UP_MS = 22 * 60 * 60 * 1000; // 22h later ≈ 24h after price
const THIRD_FOLLOW_UP_MS  = 24 * 60 * 60 * 1000; // 24h later ≈ 48h after price
const MAX_FOLLOW_UPS = 3;

// ── Soft-track (location/hours lead) constants ───────────────────────────────
// followUpCount >= SOFT_SENTINEL means this thread is on the soft track (1 msg only)
const SOFT_SENTINEL        = 50;
const LOCATION_FOLLOW_UP_MS = 24 * 60 * 60 * 1000; // 24h after location reply

// ── Worker interval ──────────────────────────────────────────────────────────
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
    // (runs regardless of time so a reply at 2am still stops the sequence)
    const lastMsg = thread.messages[0];
    if (!lastMsg || lastMsg.direction === InboxMessageDirection.INBOUND) {
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { followUpScheduledFor: null, followUpCount: 0 },
      });
      this.logger.log(`[FollowUp] Thread ${thread.id} — customer replied, cancelled`);
      return;
    }

    // Load custom settings for this account — null means use hardcoded defaults
    const settings = await this.prisma.whatsAppFollowUpSettings.findUnique({
      where: { whatsappAccountId: thread.whatsappAccountId! },
    }).catch(() => null);

    // Hold outside sending window — defaults to 8am-8pm SAST, overridable per account
    const windowStart = settings?.sendWindowStart ?? 8;
    const windowEnd   = settings?.sendWindowEnd   ?? 20;
    if (!this.isWithinSendingHours(windowStart, windowEnd)) {
      this.logger.log(`[FollowUp] Thread ${thread.id} — outside sending hours, holding`);
      return;
    }

    // ── Soft track: location/hours lead — one message then done ─────────────
    if (thread.followUpCount >= SOFT_SENTINEL) {
      if (settings && !settings.softEnabled) {
        await this.prisma.inboxThread.update({
          where: { id: thread.id },
          data: { followUpScheduledFor: null, followUpCount: 0 },
        });
        return;
      }
      const rawName = thread.contact.firstName;
      const name = rawName && rawName !== 'Unknown' && !/^\d{6,}$/.test(rawName) ? rawName : null;
      const hi = name ? `Hey ${name}!` : 'Hey!';
      const defaultSoft =
        `${hi} Just checking in from AppleBerry 😊\n\n` +
        `Did you manage to pop in? If not, no stress — we're still here whenever suits you.\n\n` +
        `Beacon Bay Crossing (East London) or 152 Main Road Walmer (GQ)\n` +
        `Mon–Fri 9am–5pm · Sat 9am–2pm 🔧`;

      const softText = this.interpolate(settings?.softMessage || defaultSoft, { name, price: '' });

      await this.messages.enqueueOutboundText({
        workspaceId: thread.workspaceId,
        whatsappAccountId: thread.whatsappAccountId!,
        to: thread.contact.phone,
        message: softText,
        contactId: thread.contact.id,
        inboxThreadId: thread.id,
      });
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { followUpScheduledFor: null, followUpCount: 0 },
      });
      this.logger.log(`[FollowUp] Thread ${thread.id} — soft follow-up sent (location lead), sequence complete`);
      return;
    }

    // Check if this specific sequence step is disabled
    const seqEnabled = [settings?.seq1Enabled, settings?.seq2Enabled, settings?.seq3Enabled];
    if (seqEnabled[thread.followUpCount] === false) {
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { followUpScheduledFor: null, followUpCount: 0 },
      });
      this.logger.log(`[FollowUp] Thread ${thread.id} — seq${thread.followUpCount + 1} disabled, skipping`);
      return;
    }

    const priceContext = this.extractPriceContext(thread.messages);
    const followUpText = this.buildMessage(thread.followUpCount, priceContext, thread.contact.firstName, settings);

    await this.messages.enqueueOutboundText({
      workspaceId: thread.workspaceId,
      whatsappAccountId: thread.whatsappAccountId!,
      to: thread.contact.phone,
      message: followUpText,
      contactId: thread.contact.id,
      inboxThreadId: thread.id,
    });

    const newCount = thread.followUpCount + 1;

    // Resolve delays: use settings if set, otherwise hardcoded constants
    const delay2Ms = ((settings?.seq2DelayHours ?? 22)) * 60 * 60 * 1000;
    const delay3Ms = ((settings?.seq3DelayHours ?? 24)) * 60 * 60 * 1000;

    if (newCount < MAX_FOLLOW_UPS) {
      const nextDelayMs = newCount === 1 ? delay2Ms : delay3Ms;
      const nextInLabel = newCount === 1 ? `${settings?.seq2DelayHours ?? 22}h` : `${settings?.seq3DelayHours ?? 24}h`;
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

  private buildMessage(count: number, priceContext: string, firstName: string, settings?: { seq1Message?: string | null; seq2Message?: string | null; seq3Message?: string | null } | null): string {
    // Reject numeric-only strings (raw JID fragments like "229197020696605") as names
    const isNumericJid = /^\d{6,}$/.test(firstName ?? '');
    const name = firstName && firstName !== 'Unknown' && !isNumericJid ? firstName : null;
    const hi = name ? `Hey ${name}!` : 'Hey!';
    const priceRef = priceContext ? `that ${priceContext} repair` : 'the repair';
    const vars = { name: name ?? '', price: priceContext };

    // If a custom message is saved for this step, use it (with {{name}}/{{price}} interpolation)
    if (count === 0 && settings?.seq1Message) return this.interpolate(settings.seq1Message, vars);
    if (count === 1 && settings?.seq2Message) return this.interpolate(settings.seq2Message, vars);
    if (count === 2 && settings?.seq3Message) return this.interpolate(settings.seq3Message, vars);

    // ── Hardcoded defaults (used when no custom message is configured) ────────
    if (count === 0) {
      return (
        `${hi} Just checking in from AppleBerry 😊\n\n` +
        `Still thinking about ${priceRef}? If the quote felt a bit steep, don't stress — ` +
        `pop in and we can have a chat. We always try to find a way to help 💪\n\n` +
        `We're open Mon–Fri 9am–5pm and Sat 9am–2pm 🔧`
      );
    }

    if (count === 1) {
      return (
        `${hi} We'd genuinely rather help you get sorted than see your device stay broken 🙏\n\n` +
        `Pop in and tell us your budget — our technicians will see what we can work out together. No pressure at all.\n\n` +
        `Beacon Bay Crossing (East London) or 152 Main Road Walmer (GQ)\n` +
        `Mon–Fri 9am–5pm · Sat 9am–2pm`
      );
    }

    return (
      `Last chance to get this sorted 👀\n\n` +
      `We still have a couple of slots left this week. Even if budget is tight — come in, let's talk. ` +
      `We'd much rather work something out than leave you without your device 📱\n\n` +
      `Beacon Bay Crossing (East London) or 152 Main Road Walmer (GQ)\n` +
      `Mon–Fri 9am–5pm · Sat 9am–2pm`
    );
  }

  /** True if the current time is within the given SAST window (UTC+2, no DST). */
  private isWithinSendingHours(start = 8, end = 20): boolean {
    const hourSAST = (new Date().getUTCHours() + 2) % 24;
    return hourSAST >= start && hourSAST < end;
  }

  /** Replace {{name}} and {{price}} placeholders in a custom message template. */
  private interpolate(template: string, vars: { name: string; price: string }): string {
    return template
      .replace(/\{\{name\}\}/gi, vars.name || '')
      .replace(/\{\{price\}\}/gi, vars.price || '');
  }

  /**
   * Called when the bot sends a reply containing a price.
   * Schedules the first follow-up in 2 hours (price track).
   */
  async scheduleForThread(threadId: string): Promise<void> {
    // Respect custom seq1 delay if configured, otherwise default 2h
    const thread = await this.prisma.inboxThread.findUnique({ where: { id: threadId }, select: { whatsappAccountId: true } });
    const settings = thread?.whatsappAccountId
      ? await this.prisma.whatsAppFollowUpSettings.findUnique({ where: { whatsappAccountId: thread.whatsappAccountId } }).catch(() => null)
      : null;
    const delayMs = ((settings?.seq1DelayHours ?? 2)) * 60 * 60 * 1000;

    await this.prisma.inboxThread.update({
      where: { id: threadId },
      data: { followUpScheduledFor: new Date(Date.now() + delayMs), followUpCount: 0 },
    });
    this.logger.log(`[FollowUp] Price track scheduled for thread ${threadId} (fires in ${settings?.seq1DelayHours ?? 2}h)`);
  }

  /**
   * Called when the bot sends a location/hours reply with no price.
   * Schedules a single soft follow-up in 24 hours.
   * Will NOT overwrite an active price-track follow-up.
   */
  async scheduleSoftForThread(threadId: string): Promise<void> {
    const thread = await this.prisma.inboxThread.findUnique({
      where: { id: threadId },
      select: { followUpScheduledFor: true, followUpCount: true },
    });
    // Don't overwrite an active price-track follow-up
    if (thread?.followUpScheduledFor && (thread.followUpCount ?? 0) < SOFT_SENTINEL) return;

    await this.prisma.inboxThread.update({
      where: { id: threadId },
      data: {
        followUpScheduledFor: new Date(Date.now() + LOCATION_FOLLOW_UP_MS),
        followUpCount: SOFT_SENTINEL,
      },
    });
    this.logger.log(`[FollowUp] Soft track scheduled for thread ${threadId} (fires in 24h)`);
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
