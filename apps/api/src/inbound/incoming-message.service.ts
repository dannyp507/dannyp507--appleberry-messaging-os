import { Injectable, Logger } from '@nestjs/common';
import {
  AutoresponderMatchType,
  ChatbotFlowStatus,
  ChatbotRunStatus,
  InboxMessageDirection,
  InboxThreadStatus,
  KeywordActionType,
  KeywordMatchType,
} from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { BaileysSessionService } from '../baileys/baileys-session.service';
import { ChatbotEngineService } from '../chatbot/chatbot-engine.service';
import { TemplateRenderService } from '../messaging/template-render.service';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribersService } from '../subscribers/subscribers.service';
import { SequencesService } from '../sequences/sequences.service';
import type { IncomingMessageJob } from '../queue/queue.constants';
import { normalizePhoneE164 } from '../contacts/phone.util';
import { OptOutService } from '../opt-out/opt-out.service';
import { WorkspaceAiSettingsService } from '../workspace-ai-settings/workspace-ai-settings.service';
import { FollowUpService } from '../follow-up/follow-up.service';

@Injectable()
export class IncomingMessageService {
  private readonly logger = new Logger(IncomingMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatbot: ChatbotEngineService,
    private readonly templates: TemplateRenderService,
    private readonly messages: MessagesService,
    private readonly ai: AiService,
    private readonly subscribers: SubscribersService,
    private readonly sequences: SequencesService,
    private readonly optOut: OptOutService,
    private readonly aiSettings: WorkspaceAiSettingsService,
    private readonly baileys: BaileysSessionService,
    private readonly followUp: FollowUpService,
  ) {}

  /**
   * Sends a WhatsApp "composing" (typing) presence update before a bot reply,
   * then sleeps for `durationMs` ms to give a natural feel.
   * Only fires if typing is enabled in per-account settings.
   * Never throws.
   */
  private async maybeTyping(
    accountId: string,
    to: string,
    durationMs: number,
    dmSettings: { dmTypingEnabled: boolean } | null,
  ): Promise<void> {
    if (!dmSettings?.dmTypingEnabled) return;
    await this.baileys.sendTyping(accountId, to, durationMs);
  }

  /** Replace Planify X / common template variables in a response string */
  private substituteVars(text: string, name: string): string {
    return text
      .replace(/\[wa_name\]/gi, name)
      .replace(/\{wa_name\}/gi, name)
      .replace(/\{\{name\}\}/gi, name);
  }

  async dispatch(job: IncomingMessageJob): Promise<void> {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: job.whatsappAccountId },
    });
    if (!account) {
      this.logger.warn(`Unknown WhatsApp account ${job.whatsappAccountId}`);
      return;
    }

    const workspaceId = account.workspaceId;

    // For @lid JIDs the `from` is the full JID — use it as the phone identifier
    // For regular phone JIDs, normalise to E164
    const rawFrom = job.from ?? '';
    const isJid = rawFrom.includes('@');
    const { e164, isValid } = isJid
      ? { e164: rawFrom, isValid: false }
      : normalizePhoneE164(rawFrom, 'ZA');

    // Prefer sender's WhatsApp push name; fall back to phone/JID digits
    const senderName =
      job.senderName?.trim() ||
      (isJid ? rawFrom.replace(/@.*/, '') : e164.replace(/\D/g, ''));

    // Use remoteJid for replies so @lid accounts are reached correctly
    const replyTo = job.remoteJid ?? e164;

    // Use upsert against the DB-level unique constraint on (workspaceId, phone)
    // to atomically prevent duplicate contacts under concurrent inbound messages.
    const contact = await this.prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId, phone: e164 } },
      update: {}, // don't overwrite existing fields on collision
      create: {
        workspaceId,
        firstName: senderName || 'Unknown',
        lastName: '',
        phone: e164,
        isValid,
        isDuplicate: false,
      },
    });

    // Update name from push name if we have a better one now
    if (contact.firstName === 'Unknown' && senderName) {
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: { firstName: senderName },
      });
    }

    // Auto-register as subscriber for this WhatsApp account (awaited so
    // the subscription row exists before the opt-in/out check below)
    await this.subscribers
      .upsertFromInbound(workspaceId, contact.id, account.id)
      .catch((err) =>
        this.logger.warn(`subscriber upsert failed: ${err?.message}`),
      );

    // Find or create inbox thread + record inbound message (always, before any routing)
    let thread = await this.prisma.inboxThread.findFirst({
      where: { workspaceId, contactId: contact.id, whatsappAccountId: account.id },
    });
    if (!thread) {
      thread = await this.prisma.inboxThread.create({
        data: {
          workspaceId,
          contactId: contact.id,
          whatsappAccountId: account.id,
          status: InboxThreadStatus.OPEN,
        },
      });
    } else {
      thread = await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { status: InboxThreadStatus.OPEN },
      });
    }

    await this.prisma.inboxMessage.create({
      data: {
        threadId: thread.id,
        direction: InboxMessageDirection.INBOUND,
        message: job.text,
      },
    });

    // Cancel any pending follow-up — the customer is now actively engaged
    await this.followUp.cancelForThread(thread.id, !!thread.followUpScheduledFor);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 0: Reserved opt-out / opt-in keywords — handled before everything else
    // ─────────────────────────────────────────────────────────────────────────
    const optHandled = await this.handleOptInOut(
      workspaceId,
      contact.id,
      account,
      thread,
      replyTo,
      senderName,
      job.text,
    );
    if (optHandled) return;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 0.5: Per-account DM bot settings (human takeover + welcome message)
    // ─────────────────────────────────────────────────────────────────────────
    const dmSettings = await this.aiSettings.getWhatsAppAccountRaw(account.id);
    const msgLower = job.text.trim().toLowerCase();

    // AGENT FIX: Agent takeover — phrase typed BY THE AGENT on WhatsApp Business.
    // These are identified by isFromMe=true on the job (set in baileys-session.service).
    // We flip aiPaused and return immediately — no reply is sent (the agent's own
    // message already appears in the conversation as context for the client).
    if (job.isFromMe) {
      const offKw = dmSettings?.agentOffKeyword?.trim().toLowerCase() ?? '';
      const onKw  = dmSettings?.agentOnKeyword?.trim().toLowerCase()  ?? '';
      if (offKw && msgLower === offKw) {
        await this.prisma.inboxThread.update({ where: { id: thread.id }, data: { aiPaused: true } });
        this.logger.log(`[AgentTakeover] AI paused by agent for WA thread=${thread.id}`);
      } else if (onKw && msgLower === onKw) {
        await this.prisma.inboxThread.update({ where: { id: thread.id }, data: { aiPaused: false } });
        this.logger.log(`[AgentTakeover] AI resumed by agent for WA thread=${thread.id}`);
      }
      return; // never run automation on agent-sent messages
    }

    // Human takeover — AI OFF keyword
    if (dmSettings?.aiOffKeyword?.trim() && msgLower === dmSettings.aiOffKeyword.trim().toLowerCase()) {
      await this.prisma.inboxThread.update({ where: { id: thread.id }, data: { aiPaused: true } });
      if (dmSettings.aiOffReply?.trim()) {
        await this.messages.enqueueOutboundText({
          workspaceId,
          whatsappAccountId: account.id,
          to: replyTo,
          message: dmSettings.aiOffReply,
          contactId: contact.id,
          inboxThreadId: thread.id,
        });
      }
      this.logger.log(`AI paused (human takeover) for WA thread=${thread.id}`);
      return;
    }

    // Human takeover — AI ON keyword
    if (dmSettings?.aiOnKeyword?.trim() && msgLower === dmSettings.aiOnKeyword.trim().toLowerCase()) {
      await this.prisma.inboxThread.update({ where: { id: thread.id }, data: { aiPaused: false } });
      if (dmSettings.aiOnReply?.trim()) {
        await this.messages.enqueueOutboundText({
          workspaceId,
          whatsappAccountId: account.id,
          to: replyTo,
          message: dmSettings.aiOnReply,
          contactId: contact.id,
          inboxThreadId: thread.id,
        });
      }
      this.logger.log(`AI resumed for WA thread=${thread.id}`);
      return;
    }

    // If a human agent has taken over, skip all bot automation
    const freshThread = await this.prisma.inboxThread.findUnique({ where: { id: thread.id }, select: { aiPaused: true } });
    if (freshThread?.aiPaused) {
      this.logger.log(`AI paused — skipping WA automation for thread=${thread.id}`);
      return;
    }

    // Welcome message — fires only on the very first inbound message from this contact.
    // The message was just persisted above so count == 1 means it's the first.
    const inboundCount = await this.prisma.inboxMessage.count({
      where: { threadId: thread.id, direction: InboxMessageDirection.INBOUND },
    });
    if (inboundCount <= 1 && dmSettings?.dmWelcomeEnabled && dmSettings.dmWelcomeText?.trim()) {
      await this.maybeTyping(account.id, replyTo, 1200, dmSettings);
      await this.messages.enqueueOutboundText({
        workspaceId,
        whatsappAccountId: account.id,
        to: replyTo,
        message: dmSettings.dmWelcomeText,
        contactId: contact.id,
        inboxThreadId: thread.id,
      });
      this.logger.log(`Welcome message sent to WA thread=${thread.id}`);
      // Continue processing — welcome is sent in addition to the normal reply
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Autoresponder rules (chatbot items) — checked FIRST so that
    // keyword triggers (e.g. "1", "2", menu options) always fire regardless of
    // whether the contact is currently inside a chatbot flow.  If a rule
    // matches we also cancel any stuck ACTIVE run so the flow doesn't interfere.
    //
    // Account-scoped rules are checked first; workspace-wide rules (null account)
    // serve as a fallback.
    // ─────────────────────────────────────────────────────────────────────────
    const allRules = await this.prisma.autoresponderRule.findMany({
      where: {
        workspaceId,
        active: true,
        // Workspace-wide rules must have no facebookPageId set (those belong to Messenger)
        facebookPageId: null,
        OR: [
          { whatsappAccountId: account.id },
          { whatsappAccountId: null },
        ],
      },
      orderBy: [
        // Account-scoped rules have priority over workspace-wide ones
        { whatsappAccountId: 'desc' },
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    for (const r of allRules) {
      if (!this.keywordMatches(r.keyword, r.matchType, job.text)) {
        continue;
      }
      // Cancel any active chatbot run so keywords always interrupt flows
      await this.prisma.chatbotRun.updateMany({
        where: {
          workspaceId,
          contactId: contact.id,
          status: ChatbotRunStatus.ACTIVE,
        },
        data: { status: ChatbotRunStatus.COMPLETED, currentNodeId: null },
      });

      if (r.useAi) {
        // AI rule: `response` is the system prompt — generate a dynamic reply.
        // Show typing BEFORE the AI call so the "composing" bubble is visible during processing.
        await this.maybeTyping(account.id, replyTo, 0, dmSettings);
        const recentMessages = await this.prisma.inboxMessage.findMany({
          where: { threadId: thread.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { direction: true, message: true },
        });
        const aiReply = await this.ai.generateReply(
          { workspaceId, contactId: contact.id, threadId: thread.id, recentMessages: recentMessages.reverse(), whatsappAccountId: account.id },
          job.text,
          r.response?.trim() || undefined,
        );
        const message = aiReply ?? "I'm sorry, I couldn't process that right now. Type HUMAN to speak to a team member.";
        await this.messages.enqueueOutboundText({
          workspaceId,
          whatsappAccountId: account.id,
          to: replyTo,
          message,
          contactId: contact.id,
          inboxThreadId: thread.id,
        });
        await this.maybeScheduleFollowUp(thread.id, message);
        this.logger.log(`Autoresponder rule "${r.name ?? r.keyword}" matched (AI) for account ${account.id}`);
      } else if (r.mediaUrl) {
        // Media rule: send a single media message — response text becomes caption
        await this.maybeTyping(account.id, replyTo, 1200, dmSettings);
        const caption = this.substituteVars(r.response?.trim() ?? '', senderName);
        await this.messages.enqueueOutboundText({
          workspaceId,
          whatsappAccountId: account.id,
          to: replyTo,
          message: caption,
          contactId: contact.id,
          inboxThreadId: thread.id,
          mediaUrl: r.mediaUrl,
        });
        this.logger.log(`Autoresponder rule "${r.name ?? r.keyword}" matched (media) for account ${account.id}`);
      } else {
        // Text-only rule: split on '\n---\n' for multi-bubble messages
        await this.maybeTyping(account.id, replyTo, 1200, dmSettings);
        const parts = r.response
          .split(/\n---\n/)
          .map((p) => this.substituteVars(p.trim(), senderName))
          .filter(Boolean);

        for (const part of parts) {
          await this.messages.enqueueOutboundText({
            workspaceId,
            whatsappAccountId: account.id,
            to: replyTo,
            message: part,
            contactId: contact.id,
            inboxThreadId: thread.id,
          });
        }
        this.logger.log(`Autoresponder rule "${r.name ?? r.keyword}" matched (${parts.length} message${parts.length > 1 ? 's' : ''}) for account ${account.id}`);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Active chatbot flow (QUESTION node waiting for user input)
    // ─────────────────────────────────────────────────────────────────────────
    const ctx = {
      workspaceId,
      whatsappAccountId: account.id,
      contactId: contact.id,
      text: job.text,
      inboxThreadId: thread.id,
    };

    const continued = await this.chatbot.handleIncomingMessage(ctx);
    if (continued) {
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Keyword triggers (START_FLOW / SEND_TEMPLATE)
    // ─────────────────────────────────────────────────────────────────────────
    // Exclude MESSENGER-only triggers — those are handled by FacebookInboundService
    const triggers = await this.prisma.keywordTrigger.findMany({
      where: {
        workspaceId,
        active: true,
        // NULL-safe: include triggers with no channel (all channels) or any non-MESSENGER channel.
        // NOT: { channel: 'MESSENGER' } would incorrectly exclude NULL-channel rows.
        OR: [
          { channel: null },
          { channel: { not: 'MESSENGER' } },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    for (const t of triggers) {
      if (!this.keywordMatches(t.keyword, t.matchType, job.text)) {
        continue;
      }
      if (t.actionType === KeywordActionType.START_FLOW) {
        await this.chatbot.startFlow({
          workspaceId,
          whatsappAccountId: account.id,
          contactId: contact.id,
          flowId: t.targetId,
          inboxThreadId: thread.id,
        });
        return;
      }
      if (t.actionType === KeywordActionType.SEND_TEMPLATE) {
        const template = await this.prisma.template.findFirst({
          where: { id: t.targetId, workspaceId },
        });
        if (!template) continue;
        const body = this.substituteVars(this.templates.interpolate(template, contact), senderName);
        await this.messages.enqueueOutboundText({
          workspaceId,
          whatsappAccountId: account.id,
          to: replyTo,
          message: body,
          contactId: contact.id,
          inboxThreadId: thread.id,
        });
        return;
      }
      if (t.actionType === KeywordActionType.ENROLL_SEQUENCE && t.targetId) {
        // Find (or create) the subscription for this contact + account
        const subscription = await this.prisma.contactSubscription.findUnique({
          where: {
            contactId_whatsappAccountId: {
              contactId: contact.id,
              whatsappAccountId: account.id,
            },
          },
        });
        if (!subscription) continue;
        try {
          await this.sequences.enroll(workspaceId, t.targetId, {
            subscriptionIds: [subscription.id],
            whatsappAccountId: account.id,
          });
          this.logger.log(
            `Keyword "${t.keyword}" enrolled contact ${contact.id} in sequence ${t.targetId}`,
          );
        } catch (err: unknown) {
          // Already enrolled or sequence inactive — don't crash the inbound flow
          this.logger.warn(`Sequence enroll skipped: ${(err as Error)?.message}`);
        }
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Default / fallback rule — account-scoped first, then workspace-wide
    // This replaces (or enhances) the bare AI fallback so that users can configure
    // a custom AI system prompt (or static reply) that fires for any unmatched message.
    // ─────────────────────────────────────────────────────────────────────────
    const defaultRule = await this.prisma.autoresponderRule.findFirst({
      where: {
        workspaceId,
        active: true,
        isDefault: true,
        facebookPageId: null,
        OR: [
          { whatsappAccountId: account.id },
          { whatsappAccountId: null },
        ],
      },
      orderBy: [
        { whatsappAccountId: 'desc' }, // prefer account-scoped default
        { priority: 'desc' },
      ],
    });

    const recent = await this.prisma.inboxMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'desc' },
      take: 16,
      select: { direction: true, message: true },
    });

    if (defaultRule) {
      if (defaultRule.useAi) {
        // Show typing BEFORE the AI call so the "composing" bubble is visible during processing.
        await this.maybeTyping(account.id, replyTo, 0, dmSettings);
        // Use the default rule's system prompt for AI generation
        const aiReply = await this.ai.generateReply(
          { workspaceId, contactId: contact.id, threadId: thread.id, recentMessages: recent.reverse(), whatsappAccountId: account.id },
          job.text,
          defaultRule.response?.trim() || undefined,
        );
        const message = aiReply ?? "I'm sorry, I couldn't process that right now. Type HUMAN to speak to a team member.";
        await this.messages.enqueueOutboundText({
          workspaceId,
          whatsappAccountId: account.id,
          to: replyTo,
          message,
          contactId: contact.id,
          inboxThreadId: thread.id,
        });
        await this.maybeScheduleFollowUp(thread.id, message);
        this.logger.log(`Default rule fired (AI) for account ${account.id}`);
      } else if (defaultRule.mediaUrl) {
        await this.maybeTyping(account.id, replyTo, 1200, dmSettings);
        const caption = this.substituteVars(defaultRule.response?.trim() ?? '', senderName);
        await this.messages.enqueueOutboundText({
          workspaceId,
          whatsappAccountId: account.id,
          to: replyTo,
          message: caption,
          contactId: contact.id,
          inboxThreadId: thread.id,
          mediaUrl: defaultRule.mediaUrl,
        });
        this.logger.log(`Default rule fired (media) for account ${account.id}`);
      } else {
        await this.maybeTyping(account.id, replyTo, 1200, dmSettings);
        const parts = defaultRule.response
          .split(/\n---\n/)
          .map((p) => this.substituteVars(p.trim(), senderName))
          .filter(Boolean);
        for (const part of parts) {
          await this.messages.enqueueOutboundText({
            workspaceId,
            whatsappAccountId: account.id,
            to: replyTo,
            message: part,
            contactId: contact.id,
            inboxThreadId: thread.id,
          });
        }
        this.logger.log(`Default rule fired (static) for account ${account.id}`);
      }
      return;
    }

    // ── No default rule configured → bare AI fallback (no custom system prompt) ──
    // Only fire if per-account settings allow AI (or if no settings row exists = workspace fallback)
    if (dmSettings && !dmSettings.dmAiEnabled) {
      this.logger.debug(`AI disabled for WA account ${account.id} — skipping bare AI fallback`);
      return;
    }

    // Show typing before the AI call — the API latency itself acts as the natural delay.
    await this.maybeTyping(account.id, replyTo, 0, dmSettings);

    const reply = await this.ai.generateReply(
      {
        workspaceId,
        contactId: contact.id,
        threadId: thread.id,
        recentMessages: recent.reverse(),
        whatsappAccountId: account.id,
      },
      job.text,
    );

    if (reply?.trim()) {
      await this.messages.enqueueOutboundText({
        workspaceId,
        whatsappAccountId: account.id,
        to: replyTo,
        message: reply.trim(),
        contactId: contact.id,
        inboxThreadId: thread.id,
      });
      await this.maybeScheduleFollowUp(thread.id, reply.trim());
    }
  }

  /**
   * Intercepts STOP / UNSUBSCRIBE (opt-out) and START / SUBSCRIBE (opt-in)
   * keywords before any other logic. Returns true if the message was handled
   * so the caller can bail out early.
   */
  private async handleOptInOut(
    workspaceId: string,
    contactId: string,
    account: { id: string },
    thread: { id: string },
    replyTo: string,
    senderName: string,
    text: string,
  ): Promise<boolean> {
    const msg = text.trim().toLowerCase();

    const OPT_OUT = new Set(['stop', 'unsubscribe', 'cancel', 'end', 'quit']);
    const OPT_IN  = new Set(['start', 'subscribe', 'unstop', 'begin']);

    const isOptOut = OPT_OUT.has(msg);
    const isOptIn  = OPT_IN.has(msg);

    if (!isOptOut && !isOptIn) return false;

    const sub = await this.prisma.contactSubscription.findUnique({
      where: {
        contactId_whatsappAccountId: {
          contactId,
          whatsappAccountId: account.id,
        },
      },
    });
    if (!sub) return false;

    if (isOptOut) {
      await this.prisma.contactSubscription.update({
        where: { id: sub.id },
        data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
      });

      await this.optOut.markOptOut(contactId);

      const cancelled = await this.sequences.cancelSubscriptionEnrollments(
        workspaceId,
        sub.id,
      );

      await this.messages.enqueueOutboundText({
        workspaceId,
        whatsappAccountId: account.id,
        to: replyTo,
        message: "You've been unsubscribed. Reply START to resubscribe.",
        contactId,
        inboxThreadId: thread.id,
      });

      this.logger.log(
        `Contact ${contactId} opted out (${cancelled} sequence enrolment(s) cancelled)`,
      );
      return true;
    }

    // isOptIn
    await Promise.all([
      this.prisma.contactSubscription.update({
        where: { id: sub.id },
        data: { status: 'SUBSCRIBED', unsubscribedAt: null },
      }),
      this.optOut.markOptIn(contactId),
    ]);

    const greeting = this.substituteVars('Hi {{name}}!', senderName);
    await this.messages.enqueueOutboundText({
      workspaceId,
      whatsappAccountId: account.id,
      to: replyTo,
      message: `${greeting} You are now re-subscribed and will receive messages from us again. Reply STOP at any time to unsubscribe.`,
      contactId,
      inboxThreadId: thread.id,
    });

    this.logger.log(`Contact ${contactId} opted in`);
    return true;
  }

  /** Schedule a follow-up based on what the bot just replied with. */
  private async maybeScheduleFollowUp(threadId: string, replyText: string): Promise<void> {
    if (/R\s?\d{3,}/i.test(replyText)) {
      // Price mentioned → full 3-message negotiation sequence
      await this.followUp.scheduleForThread(threadId).catch((e) =>
        this.logger.warn(`[FollowUp] scheduleForThread failed: ${e?.message}`),
      );
    } else if (
      /beacon bay|walmer|main road|9am|5pm|2pm|mon.{0,5}fri|monday.{0,20}friday|our hours|we.re open|we are open|located at|our address/i.test(replyText)
    ) {
      // Location/hours mentioned, no price → single soft check-in at 24h
      await this.followUp.scheduleSoftForThread(threadId).catch((e) =>
        this.logger.warn(`[FollowUp] scheduleSoftForThread failed: ${e?.message}`),
      );
    }
  }

  private keywordMatches(
    keyword: string,
    matchType: KeywordMatchType | AutoresponderMatchType,
    text: string,
  ): boolean {
    const k = keyword.trim().toLowerCase();
    const t = text.trim().toLowerCase();
    if (!k) return false;
    const mode = matchType as string;
    if (mode === KeywordMatchType.EXACT || mode === AutoresponderMatchType.EXACT) {
      return t === k;
    }
    // CONTAINS: for short keywords (≤3 chars like "1","2","hi") use word-boundary
    // matching to prevent "1" from matching inside "12" or "21"
    if (k.length <= 3) {
      const wordBoundary = new RegExp(`(?:^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
      return wordBoundary.test(t);
    }
    return t.includes(k);
  }
}
