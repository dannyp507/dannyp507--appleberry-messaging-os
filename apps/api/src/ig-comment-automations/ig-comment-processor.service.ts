import { Injectable, Logger } from '@nestjs/common';
import { IgCommentActionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

const IG_GRAPH_BASE = 'https://graph.instagram.com/v21.0';

export interface IgCommentWebhookEvent {
  igUserId: string;      // The IG account that owns the post
  commentId: string;
  postId: string;        // media ID
  commenterId: string;   // sender IGSID
  commenterUsername?: string;
  commentText: string;
}

@Injectable()
export class IgCommentProcessorService {
  private readonly logger = new Logger(IgCommentProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async processComment(event: IgCommentWebhookEvent): Promise<void> {
    const { igUserId, commentId, postId, commenterId, commenterUsername, commentText } = event;

    // ── 0. Resolve the Instagram Account record ────────────────────────────────
    const account = await this.prisma.instagramAccount.findFirst({
      where: { igUserId, isActive: true },
    });
    if (!account) {
      this.logger.debug(`No active InstagramAccount for igUserId=${igUserId} — comment ignored`);
      return;
    }

    // ── 1. Deduplication — skip already-processed comments ────────────────────
    const alreadyProcessed = await this.prisma.igCommentEvent.findUnique({
      where: { commentId },
    });
    if (alreadyProcessed) {
      this.logger.debug(`Duplicate comment event commentId=${commentId} — skipped`);
      return;
    }

    // ── 2. Skip comments made by the account itself ───────────────────────────
    if (commenterId === igUserId) {
      this.logger.debug(`Account's own comment — skipped (commentId=${commentId})`);
      return;
    }

    // ── 3. Find active automations for this post ───────────────────────────────
    const automations = await this.prisma.igCommentAutomation.findMany({
      where: {
        instagramAccountId: account.id,
        isActive: true,
        OR: [{ postId }, { postId: null }],
      },
      include: {
        keywords: true,
      },
    });

    if (!automations.length) {
      this.logger.debug(
        `No active IG automations for postId=${postId} igUserId=${igUserId}`,
      );
      await this.logEvent({
        workspaceId: account.workspaceId,
        instagramAccountId: account.id,
        automationId: null,
        commentId,
        postId,
        commenterId,
        commenterUsername,
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
          `IG comment matched automation "${automation.name}" keyword "${kw.keyword}" ` +
            `commentId=${commentId}`,
        );

        let privateReplySent = false;
        let publicReplySent = false;
        let error: string | null = null;

        let publicText = automation.messageText;
        let dmText = automation.dmText || automation.messageText;

        if (automation.aiEnabled) {
          const aiReply = await this.ai.generateReply(
            { workspaceId: account.workspaceId, contactId: commenterId },
            commentText,
            this.buildAiSystemPrompt(automation.aiSystemPrompt, account.workspaceId),
          );
          if (aiReply) {
            publicText = aiReply;
            dmText = aiReply;
          }
        }

        // Execute action(s)
        try {
          if (
            automation.actionType === 'PRIVATE_REPLY' ||
            automation.actionType === 'BOTH'
          ) {
            await this.sendPrivateReply(commentId, dmText, account.pageAccessToken, automation.mediaUrl ?? undefined);
            privateReplySent = true;
          }
          if (
            automation.actionType === 'PUBLIC_COMMENT' ||
            automation.actionType === 'BOTH'
          ) {
            await this.sendPublicReply(commentId, publicText, account.pageAccessToken);
            publicReplySent = true;
          }
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Failed to send IG reply for commentId=${commentId}: ${error}`,
          );
        }

        // Increment automation reply counter
        await this.prisma.igCommentAutomation.update({
          where: { id: automation.id },
          data: { replyCount: { increment: 1 } },
        });

        // Log the event
        await this.logEvent({
          workspaceId: account.workspaceId,
          instagramAccountId: account.id,
          automationId: automation.id,
          commentId,
          postId,
          commenterId,
          commenterUsername,
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
        `No keyword matched for IG comment="${commentText.slice(0, 40)}" postId=${postId}`,
      );
      await this.logEvent({
        workspaceId: account.workspaceId,
        instagramAccountId: account.id,
        automationId: null,
        commentId,
        postId,
        commenterId,
        commenterUsername,
        commentText,
        error: null,
      });
    }
  }

  // ── Instagram API Calls ───────────────────────────────────────────────────────

  /**
   * Send a private reply (Instagram DM) to the commenter.
   * Uses recipient.comment_id which routes the DM to the person who commented.
   * Requires instagram_manage_messages permission.
   */
  private async sendPrivateReply(
    commentId: string,
    message: string,
    pageAccessToken: string,
    mediaUrl?: string,
  ): Promise<void> {
    // Send media attachment first if provided
    if (mediaUrl) {
      const mediaRes = await fetch(`${IG_GRAPH_BASE}/me/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pageAccessToken}`,
        },
        body: JSON.stringify({
          recipient: { comment_id: commentId },
          message: {
            attachment: {
              type: 'image',
              payload: { url: mediaUrl, is_reusable: true },
            },
          },
        }),
      });
      if (!mediaRes.ok) {
        const body = (await mediaRes.json().catch(() => ({}))) as {
          error?: { message: string; code?: number; error_subcode?: number; type?: string };
        };
        const e = body.error;
        this.logger.error(
          `IG private_reply media error — code=${e?.code} subcode=${e?.error_subcode} type=${e?.type} msg=${e?.message}`,
        );
        // Don't throw — fall through to send the text message anyway
      } else {
        this.logger.log(`IG private DM media attachment sent to comment ${commentId}`);
      }
    }

    const res = await fetch(`${IG_GRAPH_BASE}/me/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text: message },
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message: string; code?: number; error_subcode?: number; type?: string };
      };
      const e = body.error;
      this.logger.error(
        `IG private_reply error — code=${e?.code} subcode=${e?.error_subcode} type=${e?.type} msg=${e?.message}`,
      );
      throw new Error(e?.message ?? `HTTP ${res.status}`);
    }
    this.logger.log(`IG private DM reply sent to comment ${commentId}`);
  }

  /**
   * POST /{comment_id}/replies — posts a public reply to an Instagram comment.
   */
  private async sendPublicReply(
    commentId: string,
    message: string,
    pageAccessToken: string,
  ): Promise<void> {
    const res = await fetch(`${IG_GRAPH_BASE}/${commentId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: pageAccessToken }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message: string } };
      throw new Error(body.error?.message ?? `HTTP ${res.status}`);
    }
    this.logger.log(`IG public reply posted to comment ${commentId}`);
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
    instagramAccountId: string;
    automationId: string | null;
    commentId: string;
    postId: string;
    commenterId: string;
    commenterUsername?: string;
    commentText: string;
    matchedKeyword?: string;
    actionType?: IgCommentActionType;
    privateReplySent?: boolean;
    publicReplySent?: boolean;
    error: string | null;
  }) {
    try {
      await this.prisma.igCommentEvent.create({
        data: {
          workspaceId: params.workspaceId,
          instagramAccountId: params.instagramAccountId,
          automationId: params.automationId ?? null,
          commentId: params.commentId,
          postId: params.postId,
          commenterId: params.commenterId,
          commenterUsername: params.commenterUsername ?? null,
          commentText: params.commentText,
          matchedKeyword: params.matchedKeyword ?? null,
          actionType: params.actionType ?? null,
          privateReplySent: params.privateReplySent ?? false,
          publicReplySent: params.publicReplySent ?? false,
          error: params.error ?? null,
        },
      });
    } catch (e) {
      this.logger.error(`Failed to log IG comment event: ${String(e)}`);
    }
  }
}
