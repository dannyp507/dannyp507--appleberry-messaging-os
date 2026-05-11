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
    const automations = await this.prisma.fbCommentAutomation.findMany({
      where: {
        facebookPageId: page.id,
        isActive: true,
        postId,
      },
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
    let matched = false;
    for (const automation of automations) {
      for (const kw of automation.keywords) {
        if (!this.matches(commentText, kw.keyword, kw.matchType)) continue;

        this.logger.log(
          `Comment matched automation "${automation.name}" keyword "${kw.keyword}" ` +
            `commentId=${commentId}`,
        );

        let privateReplySent = false;
        let publicReplySent = false;
        let error: string | null = null;

        // Resolve reply text — AI or static
        let replyText = automation.messageText;
        if (automation.aiEnabled) {
          const aiReply = await this.ai.generateReply(
            { workspaceId: page.workspaceId, contactId: commenterId },
            commentText,
            this.buildAiSystemPrompt(automation.aiSystemPrompt, page.workspaceId),
          );
          if (aiReply) replyText = aiReply;
        }

        // Execute action(s)
        try {
          if (
            automation.actionType === 'PRIVATE_REPLY' ||
            automation.actionType === 'BOTH'
          ) {
            await this.sendPrivateReply(commentId, replyText, page.pageAccessToken);
            privateReplySent = true;
          }
          if (
            automation.actionType === 'PUBLIC_COMMENT' ||
            automation.actionType === 'BOTH'
          ) {
            await this.sendPublicReply(commentId, replyText, page.pageAccessToken);
            publicReplySent = true;
          }
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Failed to send reply for commentId=${commentId}: ${error}`,
          );
        }

        // Increment automation reply counter
        await this.prisma.fbCommentAutomation.update({
          where: { id: automation.id },
          data: { replyCount: { increment: 1 } },
        });

        // Log the event
        await this.logEvent({
          workspaceId: page.workspaceId,
          facebookPageId: page.id,
          automationId: automation.id,
          commentId,
          postId,
          commenterId,
          commenterName,
          commentText,
          matchedKeyword: kw.keyword,
          actionType: automation.actionType,
          privateReplySent,
          publicReplySent,
          error,
        });

        matched = true;
        break; // Fire only the first matching automation per comment
      }
      if (matched) break;
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

  // ── Graph API Calls ───────────────────────────────────────────────────────────

  /** Sends a private Messenger DM to the commenter using the Messenger Send API.
   *  Uses recipient.comment_id which works across all post types (regular, check-in, video, etc.)
   *  Unlike the legacy /private_replies endpoint, this is not restricted by post type.
   *  Requires pages_messaging permission. */
  private async sendPrivateReply(
    commentId: string,
    message: string,
    pageAccessToken: string,
  ): Promise<void> {
    const res = await fetch(`${GRAPH_BASE}/me/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text: message },
        access_token: pageAccessToken,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message: string; code?: number; error_subcode?: number; type?: string };
      };
      const e = body.error;
      this.logger.error(
        `private_reply error — code=${e?.code} subcode=${e?.error_subcode} type=${e?.type} msg=${e?.message}`,
      );
      throw new Error(e?.message ?? `HTTP ${res.status}`);
    }
    this.logger.log(`Private Messenger reply sent to comment ${commentId}`);
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
