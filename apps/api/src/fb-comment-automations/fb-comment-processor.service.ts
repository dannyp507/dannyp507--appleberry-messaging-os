import { Injectable, Logger } from '@nestjs/common';
import { FbCommentActionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface CommentWebhookEvent {
  pageId: string;        // Facebook page ID (numeric string)
  commentId: string;
  postId: string;
  commenterId: string;
  commenterName?: string;
  commentText: string;
  /** parentId equals postId for top-level comments; another commentId for replies */
  parentId?: string;
}

@Injectable()
export class FbCommentProcessorService {
  private readonly logger = new Logger(FbCommentProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async processComment(event: CommentWebhookEvent): Promise<void> {
    const { pageId, commentId, postId, commenterId, commenterName, commentText } = event;

    // ── 0. Resolve the Facebook Page record ────────────────────────────────────
    const page = await this.prisma.facebookPage.findFirst({
      where: { pageId, isActive: true },
    });
    if (!page) {
      this.logger.debug(`No active page for pageId=${pageId} — comment ignored`);
      return;
    }

    // ── 1. Deduplication — skip already-processed comments ────────────────────
    const alreadyProcessed = await this.prisma.fbCommentEvent.findUnique({
      where: { commentId },
    });
    if (alreadyProcessed) {
      this.logger.debug(`Duplicate comment event commentId=${commentId} — skipped`);
      return;
    }

    // ── 2. Skip comments made by the page itself ───────────────────────────────
    if (commenterId === pageId) {
      this.logger.debug(`Page's own comment — skipped (commentId=${commentId})`);
      return;
    }

    // ── 3. Find active automations for this post ───────────────────────────────
    // Matches automations scoped to this exact post OR "all posts" automations (postId = null).
    // Post-specific automations fire first (ordered by postId desc → non-null before null).
    const automations = await this.prisma.fbCommentAutomation.findMany({
      where: {
        facebookPageId: page.id,
        isActive: true,
        OR: [
          { postId },
          { postId: { equals: null } },
        ],
      },
      orderBy: { createdAt: 'asc' }, // consistent ordering
      include: {
        keywords: true,
      },
    });

    if (!automations.length) {
      this.logger.debug(
        `No active automations for postId=${postId} page=${pageId}`,
      );
      // Log the event without automation match for audit purposes
      await this.logEvent({
        workspaceId: page.workspaceId,
        facebookPageId: page.id,
        automationId: null,
        commentId,
        postId,
        commenterId,
        commenterName,
        commentText,
        error: null,
      });
      return;
    }

    // ── 4. Match keywords — fire first matching automation ────────────────────
    // Automations with no keywords act as a catch-all fallback (fired only if
    // no keyword automation matched first).
    let matched = false;
    let fallbackAutomation: typeof automations[number] | null = null;

    for (const automation of automations) {
      // Automations with no keywords → save as fallback, skip keyword loop
      if (automation.keywords.length === 0) {
        if (!fallbackAutomation) fallbackAutomation = automation;
        continue;
      }

      for (const kw of automation.keywords) {
        if (!this.matches(commentText, kw.keyword, kw.matchType)) continue;

        this.logger.log(
          `Comment matched automation "${automation.name}" keyword "${kw.keyword}" ` +
            `commentId=${commentId}`,
        );

        await this.fireAutomation(automation, kw.keyword, { page, commentId, postId, commenterId, commenterName, commentText });
        matched = true;
        break;
      }
      if (matched) break;
    }

    // ── 4b. Fallback — no keyword matched, fire catch-all automation if present ─
    if (!matched && fallbackAutomation) {
      this.logger.log(
        `No keyword matched — firing fallback automation "${fallbackAutomation.name}" commentId=${commentId}`,
      );
      await this.fireAutomation(fallbackAutomation, null, { page, commentId, postId, commenterId, commenterName, commentText });
      matched = true;
    }

    if (!matched) {
      this.logger.debug(
        `No keyword matched for comment="${commentText.slice(0, 40)}" postId=${postId}`,
      );
      await this.logEvent({
        workspaceId: page.workspaceId,
        facebookPageId: page.id,
        automationId: null,
        commentId,
        postId,
        commenterId,
        commenterName,
        commentText,
        error: null,
      });
    }
  }

  // ── Fire automation (shared by keyword match + fallback) ─────────────────────

  private async fireAutomation(
    automation: {
      id: string; name: string; actionType: string; aiEnabled: boolean;
      aiSystemPrompt: string | null; messageText: string | null;
      dmText: string | null; buttonLabel: string | null; buttonUrl: string | null;
      mediaUrl: string | null;
    },
    matchedKeyword: string | null,
    ctx: {
      page: { id: string; pageId: string; workspaceId: string; pageAccessToken: string };
      commentId: string; postId: string; commenterId: string;
      commenterName?: string; commentText: string;
    },
  ): Promise<void> {
    const { page, commentId, postId, commenterId, commenterName, commentText } = ctx;

    let privateReplySent = false;
    let publicReplySent = false;
    let error: string | null = null;

    let publicReplyText = automation.messageText;
    let dmBodyText = (automation.dmText ?? automation.messageText ?? '') as string;

    if (automation.aiEnabled) {
      const aiReply = await this.ai.generateReply(
        { workspaceId: page.workspaceId, contactId: commenterId, facebookPageId: page.id },
        commentText,
        this.buildAiSystemPrompt(automation.aiSystemPrompt, page.workspaceId),
      );
      if (aiReply) {
        dmBodyText = aiReply;
        // For fallback (no keyword), also use AI reply as the public comment
        if (!matchedKeyword) publicReplyText = aiReply;
      }
    }

    try {
      if (automation.actionType === 'PRIVATE_REPLY' || automation.actionType === 'BOTH') {
        await this.sendPrivateReply(
          commentId, commenterId, page.pageId, dmBodyText, page.pageAccessToken,
          automation.buttonLabel ?? undefined,
          automation.buttonUrl ?? undefined,
          automation.mediaUrl ?? undefined,
        );
        privateReplySent = true;
      }
      if (automation.actionType === 'PUBLIC_COMMENT' || automation.actionType === 'BOTH') {
        if (publicReplyText) {
          await this.sendPublicReply(commentId, publicReplyText, page.pageAccessToken);
          publicReplySent = true;
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send reply for commentId=${commentId}: ${error}`);
    }

    await this.prisma.fbCommentAutomation.update({
      where: { id: automation.id },
      data: { replyCount: { increment: 1 } },
    });

    await this.logEvent({
      workspaceId: page.workspaceId,
      facebookPageId: page.id,
      automationId: automation.id,
      commentId, postId, commenterId, commenterName, commentText,
      matchedKeyword: matchedKeyword ?? undefined,
      actionType: automation.actionType as import('@prisma/client').FbCommentActionType,
      privateReplySent,
      publicReplySent,
      error,
    });
  }

  // ── Graph API Calls ───────────────────────────────────────────────────────────

  /** Sends a private Messenger DM to the commenter.
   *
   *  Strategy (preserves comment visibility):
   *  1. Look up the commenter's Page-Scoped User ID (PSID) via the conversations API.
   *     Sending to a PSID does NOT mark the comment as "replied privately", so the
   *     original comment stays visible on the post.
   *  2. If no existing conversation found (first-time commenter), fall back to
   *     recipient.comment_id — the comment will be hidden by Facebook, but the DM
   *     still reaches the user.
   *
   *  When buttonLabel + buttonUrl are supplied the message is sent as a Messenger
   *  button template with a single web_url button appended to the text.
   *  When mediaUrl is supplied (and no button) the message includes a media attachment. */
  private async sendPrivateReply(
    commentId: string,
    commenterId: string,
    pageNumericId: string,
    message: string,
    pageAccessToken: string,
    buttonLabel?: string,
    buttonUrl?: string,
    mediaUrl?: string,
  ): Promise<void> {
    // Prefer PSID so the original comment is NOT hidden by Facebook
    const psid = await this.getPsidForCommenter(commenterId, pageNumericId, pageAccessToken);
    const recipient: Record<string, unknown> = psid
      ? { id: psid }
      : { comment_id: commentId };

    if (psid) {
      this.logger.debug(`Resolved PSID ${psid} for commenter ${commenterId} — comment will stay visible`);
    } else {
      this.logger.debug(`No PSID found for commenter ${commenterId} — using comment_id (comment will be hidden)`);
    }

    // Build the message payload
    let messagePayload: Record<string, unknown>;

    if (buttonLabel && buttonUrl) {
      // Messenger button template — text + URL button
      messagePayload = {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: message,
            buttons: [
              {
                type: 'web_url',
                url: buttonUrl,
                title: buttonLabel,
              },
            ],
          },
        },
      };
    } else if (mediaUrl) {
      // Media attachment — send text first, then the image
      await this.sendMessengerMessage(recipient, pageAccessToken, { text: message });
      messagePayload = {
        attachment: {
          type: 'image',
          payload: { url: mediaUrl, is_reusable: true },
        },
      };
    } else {
      // Plain text DM
      messagePayload = { text: message };
    }

    await this.sendMessengerMessage(recipient, pageAccessToken, messagePayload);
    this.logger.log(`Private Messenger reply sent to comment ${commentId} (via ${psid ? 'PSID' : 'comment_id'})`);
  }

  /** Look up the commenter's Page-Scoped User ID (PSID) from existing conversations.
   *  Returns null if the user has never messaged the page before. */
  private async getPsidForCommenter(
    commenterUserId: string,
    pageNumericId: string,
    pageAccessToken: string,
  ): Promise<string | null> {
    try {
      const url =
        `${GRAPH_BASE}/me/conversations` +
        `?user_id=${commenterUserId}&fields=participants&access_token=${pageAccessToken}`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        data?: Array<{ participants?: { data?: Array<{ id: string; name: string }> } }>;
        error?: { message: string };
      };
      if (!res.ok || !data.data?.length) return null;

      // The conversation has two participants: the page and the user.
      // The PSID is the participant whose id is NOT the page's numeric ID.
      const participants = data.data[0].participants?.data ?? [];
      const userParticipant = participants.find((p) => p.id !== pageNumericId);
      return userParticipant?.id ?? null;
    } catch {
      return null;
    }
  }

  /** Core Messenger Send API call — POST /me/messages.
   *  Accepts either { id: psid } or { comment_id: commentId } as the recipient.
   *  messaging_type RESPONSE is required by Meta for all message types including
   *  button templates; omitting it causes template messages to be silently dropped. */
  private async sendMessengerMessage(
    recipient: Record<string, unknown>,
    pageAccessToken: string,
    messagePayload: Record<string, unknown>,
  ): Promise<void> {
    const body = JSON.stringify({
      recipient,
      messaging_type: 'RESPONSE',
      message: messagePayload,
      access_token: pageAccessToken,
    });

    this.logger.debug(`Messenger send payload: ${JSON.stringify({ recipient, message: messagePayload })}`);

    const res = await fetch(`${GRAPH_BASE}/me/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: { message: string; code?: number; error_subcode?: number; type?: string };
      };
      const e = errBody.error;
      this.logger.error(
        `private_reply error — code=${e?.code} subcode=${e?.error_subcode} type=${e?.type} msg=${e?.message}`,
      );
      throw new Error(e?.message ?? `HTTP ${res.status}`);
    }
  }

  /** POST /{comment_id}/comments — posts a public reply to a comment thread. */
  private async sendPublicReply(
    commentId: string,
    message: string,
    pageAccessToken: string,
  ): Promise<void> {
    const res = await fetch(`${GRAPH_BASE}/${commentId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: pageAccessToken }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message: string } };
      throw new Error(body.error?.message ?? `HTTP ${res.status}`);
    }
    this.logger.log(`Public reply posted to comment ${commentId}`);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private matches(text: string, keyword: string, matchType: string): boolean {
    const t = text.trim().toLowerCase();
    const k = keyword.trim().toLowerCase();
    if (!k) return false;
    if (matchType === 'EXACT') return t === k;
    // CONTAINS with word-boundary guard for short keywords
    if (k.length <= 3) {
      return new RegExp(
        `(?:^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
      ).test(t);
    }
    return t.includes(k);
  }

  private buildAiSystemPrompt(
    automationPrompt: string | null,
    _workspaceId: string,
  ): string {
    return (
      automationPrompt ??
      'You are a helpful customer service assistant. Reply concisely and professionally to the customer comment. Keep your reply under 200 characters.'
    );
  }

  private async logEvent(params: {
    workspaceId: string;
    facebookPageId: string;
    automationId: string | null;
    commentId: string;
    postId: string;
    commenterId: string;
    commenterName?: string;
    commentText: string;
    matchedKeyword?: string;
    actionType?: FbCommentActionType;
    privateReplySent?: boolean;
    publicReplySent?: boolean;
    error: string | null;
  }) {
    try {
      await this.prisma.fbCommentEvent.create({
        data: {
          workspaceId: params.workspaceId,
          facebookPageId: params.facebookPageId,
          automationId: params.automationId ?? null,
          commentId: params.commentId,
          postId: params.postId,
          commenterId: params.commenterId,
          commenterName: params.commenterName ?? null,
          commentText: params.commentText,
          matchedKeyword: params.matchedKeyword ?? null,
          actionType: params.actionType ?? null,
          privateReplySent: params.privateReplySent ?? false,
          publicReplySent: params.publicReplySent ?? false,
          error: params.error ?? null,
        },
      });
    } catch (e) {
      // Don't let logging failures crash the main flow
      this.logger.error(`Failed to log comment event: ${String(e)}`);
    }
  }
}
