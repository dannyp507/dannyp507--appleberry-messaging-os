"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { toast } from "@/lib/toast";
import type {
  FbCommentAutomation,
  FbCommentEvent,
  FacebookPage,
  FbPost,
  FbCommentActionType,
} from "@/lib/api/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PlusCircle,
  Trash2,
  Pencil,
  Power,
  Eye,
  Loader2,
  MessageSquare,
  Bot,
  X,
  RefreshCw,
  Settings2,
  ChevronRight,
  ExternalLink,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaPicker } from "@/components/media/media-picker";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<FbCommentActionType, string> = {
  PRIVATE_REPLY: "Private DM",
  PUBLIC_COMMENT: "Public Reply",
  BOTH: "DM + Reply",
};

const ACTION_COLORS: Record<FbCommentActionType, string> = {
  PRIVATE_REPLY: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  PUBLIC_COMMENT: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  BOTH: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface KeywordEntry {
  keyword: string;
  matchType: "EXACT" | "CONTAINS";
}

interface AutomationForm {
  facebookPageId: string;
  postId: string;
  postSnippet: string;
  name: string;
  actionType: FbCommentActionType;
  /** Visible public comment reply (shown on the post) */
  messageText: string;
  /** Separate private Messenger DM text (blank = falls back to messageText) */
  dmText: string;
  buttonLabel: string;
  buttonUrl: string;
  mediaUrl: string;
  aiEnabled: boolean;
  aiSystemPrompt: string;
  isActive: boolean;
  keywords: KeywordEntry[];
}

interface DialogPreset {
  facebookPageId?: string;
  postId?: string;
  postSnippet?: string;
}

const EMPTY_FORM: AutomationForm = {
  facebookPageId: "",
  postId: "",
  postSnippet: "",
  name: "",
  actionType: "PRIVATE_REPLY",
  messageText: "",
  dmText: "",
  buttonLabel: "",
  buttonUrl: "",
  mediaUrl: "",
  aiEnabled: false,
  aiSystemPrompt: "",
  isActive: true,
  keywords: [],
};

// ─── Keyword Tag Input ────────────────────────────────────────────────────────

function KeywordTagInput({
  keywords,
  onChange,
}: {
  keywords: KeywordEntry[];
  onChange: (kw: KeywordEntry[]) => void;
}) {
  const [input, setInput] = useState("");
  const [matchType, setMatchType] = useState<"EXACT" | "CONTAINS">("CONTAINS");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const trimmed = input.trim().toUpperCase();
    if (!trimmed) return;
    if (keywords.find((k) => k.keyword.toUpperCase() === trimmed)) {
      setInput("");
      return;
    }
    onChange([...keywords, { keyword: trimmed, matchType }]);
    setInput("");
    inputRef.current?.focus();
  };

  const remove = (i: number) => onChange(keywords.filter((_, idx) => idx !== i));

  const toggleMatch = (i: number) =>
    onChange(
      keywords.map((k, idx) =>
        idx === i
          ? { ...k, matchType: k.matchType === "CONTAINS" ? "EXACT" : "CONTAINS" }
          : k,
      ),
    );

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !input && keywords.length) {
      remove(keywords.length - 1);
    }
  };

  return (
    <div className="space-y-2">
      {/* Tags */}
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((kw, i) => (
            <span
              key={i}
              className="flex items-center gap-1 bg-[#F3F4F6] dark:bg-[#1e2433] rounded-lg px-2 py-1"
            >
              <button
                type="button"
                onClick={() => toggleMatch(i)}
                title="Click to toggle Contains / Exact"
                className={cn(
                  "text-[9px] font-bold px-1 py-0.5 rounded uppercase transition-colors shrink-0",
                  kw.matchType === "EXACT"
                    ? "bg-amber-500/20 text-amber-500"
                    : "bg-indigo-500/10 text-indigo-400",
                )}
              >
                {kw.matchType === "EXACT" ? "EX" : "~"}
              </button>
              <span className="text-xs font-mono font-semibold text-[#111827] dark:text-[#f3f4f6]">
                {kw.keyword}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-[#9CA3AF] hover:text-red-400 transition-colors"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setMatchType((m) => (m === "CONTAINS" ? "EXACT" : "CONTAINS"))
          }
          className={cn(
            "shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap",
            matchType === "EXACT"
              ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
              : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
          )}
        >
          {matchType === "EXACT" ? "Exact" : "Contains"}
        </button>
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type keyword, press Enter…"
          className="h-8 text-sm font-mono flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={!input.trim()}
          className="h-8 shrink-0 text-xs px-3"
        >
          Add
        </Button>
      </div>
      <p className="text-[10px] text-[#9CA3AF]">
        Press{" "}
        <kbd className="bg-[#F3F4F6] dark:bg-[#1e2433] px-1 rounded text-[9px]">
          Enter
        </kbd>{" "}
        to add. Click the badge on each keyword to toggle Contains ↔ Exact.
      </p>
    </div>
  );
}

// ─── Logs Dialog ──────────────────────────────────────────────────────────────

function LogsDialog({
  automation,
  onClose,
}: {
  automation: FbCommentAutomation;
  onClose: () => void;
}) {
  const { data: events, isLoading } = useQuery({
    queryKey: qk.fbCommentEvents(automation.id),
    queryFn: async () => {
      const { data } = await api.get<FbCommentEvent[]>(
        `/fb-comment-automations/${automation.id}/events?take=100`,
      );
      return data;
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            Logs — {automation.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-5 animate-spin text-[#9CA3AF]" />
            </div>
          ) : !events?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#9CA3AF]">
              <MessageSquare className="size-8 mb-3 opacity-40" />
              <p className="text-sm">No comment events yet</p>
              <p className="text-xs mt-1 opacity-70">
                Events appear here when comments are processed
              </p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white dark:bg-[#111420]">
                <tr className="border-b border-[#F3F4F6] dark:border-[#1e2433]">
                  {[
                    "Commenter",
                    "Comment",
                    "Keyword",
                    "Action",
                    "Result",
                    "Time",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-[#F3F4F6] dark:border-[#1e2433] hover:bg-[#F9FAFB] dark:hover:bg-[#1a1f2e]"
                  >
                    <td className="px-3 py-2 text-[#6B7280] font-mono">
                      {e.commenterName ?? e.commenterId.slice(-8)}
                    </td>
                    <td className="px-3 py-2 text-[#111827] dark:text-[#f3f4f6] max-w-[180px] truncate">
                      {e.commentText}
                    </td>
                    <td className="px-3 py-2">
                      {e.matchedKeyword ? (
                        <span className="bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-mono">
                          {e.matchedKeyword}
                        </span>
                      ) : (
                        <span className="text-[#9CA3AF]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {e.actionType ? (
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border",
                            ACTION_COLORS[e.actionType],
                          )}
                        >
                          {ACTION_LABELS[e.actionType]}
                        </span>
                      ) : (
                        <span className="text-[#9CA3AF]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {e.error ? (
                        <span
                          className="text-red-400 text-[10px]"
                          title={e.error}
                        >
                          ⚠ Error
                        </span>
                      ) : e.privateReplySent || e.publicReplySent ? (
                        <span className="text-emerald-400">✓ Sent</span>
                      ) : (
                        <span className="text-[#9CA3AF]">No match</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#9CA3AF] whitespace-nowrap">
                      {new Date(e.processedAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Automation Dialog ────────────────────────────────────────────────────────

function AutomationDialog({
  initial,
  preset,
  onClose,
  onSaved,
}: {
  initial?: FbCommentAutomation;
  preset?: DialogPreset;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!initial;

  const [form, setForm] = useState<AutomationForm>(() => {
    if (initial) {
      return {
        facebookPageId: initial.facebookPageId,
        postId: initial.postId,
        postSnippet: initial.postSnippet ?? "",
        name: initial.name,
        actionType: initial.actionType,
        messageText: initial.messageText,
        dmText: initial.dmText ?? "",
        buttonLabel: initial.buttonLabel ?? "",
        buttonUrl: initial.buttonUrl ?? "",
        mediaUrl: initial.mediaUrl ?? "",
        aiEnabled: initial.aiEnabled,
        aiSystemPrompt: initial.aiSystemPrompt ?? "",
        isActive: initial.isActive,
        keywords: initial.keywords.length
          ? initial.keywords.map((k) => ({
              keyword: k.keyword,
              matchType: k.matchType as "EXACT" | "CONTAINS",
            }))
          : [],
      };
    }
    return {
      ...EMPTY_FORM,
      facebookPageId: preset?.facebookPageId ?? "",
      postId: preset?.postId ?? "",
      postSnippet: preset?.postSnippet ?? "",
    };
  });

  // When page/post come from preset or editing, show them as info, not inputs
  const pageIsLocked = isEditing || !!preset?.facebookPageId;
  const postIsLocked = isEditing || !!preset?.postId;

  const { data: pages = [] } = useQuery({
    queryKey: qk.facebookPages,
    queryFn: async () => {
      const { data } = await api.get<FacebookPage[]>("/facebook/pages");
      return data;
    },
  });

  const lockedPageName =
    pages.find((p) => p.id === form.facebookPageId)?.name ??
    initial?.fbPage?.name ??
    form.facebookPageId;

  const {
    data: posts = [],
    isFetching: loadingPosts,
    refetch: refetchPosts,
  } = useQuery({
    queryKey: qk.fbPagePosts(form.facebookPageId ?? ""),
    queryFn: async () => {
      if (!form.facebookPageId) return [];
      const { data } = await api.get<FbPost[]>(
        `/fb-comment-automations/pages/${form.facebookPageId}/posts`,
      );
      return data;
    },
    enabled: !!form.facebookPageId && !postIsLocked,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: AutomationForm) => {
      // For PRIVATE_REPLY-only: messageText isn't shown to users but is required by
      // the DB (NOT NULL). Use dmText as the value so the constraint is satisfied.
      // The processor always uses dmText (or falls back to messageText) for the DM.
      const effectiveMessageText =
        payload.actionType === "PRIVATE_REPLY"
          ? payload.dmText || payload.messageText
          : payload.messageText;

      const body = {
        ...payload,
        messageText: effectiveMessageText,
        dmText: payload.dmText || undefined,
        buttonLabel: payload.buttonLabel || undefined,
        buttonUrl: payload.buttonUrl || undefined,
        mediaUrl: payload.mediaUrl || undefined,
        aiSystemPrompt: payload.aiSystemPrompt || undefined,
        postSnippet: payload.postSnippet || undefined,
        keywords: payload.keywords.filter((k) => k.keyword.trim()),
      };
      if (isEditing) {
        await api.patch(`/fb-comment-automations/${initial!.id}`, body);
      } else {
        await api.post("/fb-comment-automations", body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.fbCommentAutomations });
      toast.success(isEditing ? "Automation updated" : "Automation created");
      onSaved();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? "Failed to save automation");
    },
  });

  const setField = <K extends keyof AutomationForm>(
    key: K,
    value: AutomationForm[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  const handleSelectPost = (post: FbPost) => {
    setForm((f) => ({
      ...f,
      postId: post.postId,
      postSnippet: post.snippet,
      name: f.name || post.snippet.slice(0, 50),
    }));
  };

  const dmRequired = form.actionType === "PRIVATE_REPLY" || form.actionType === "BOTH";
  const publicRequired = form.actionType === "PUBLIC_COMMENT" || form.actionType === "BOTH";

  const canSubmit =
    form.facebookPageId &&
    form.postId &&
    form.name.trim() &&
    (!publicRequired || form.messageText.trim()) &&
    (!dmRequired || form.dmText.trim()) &&
    form.keywords.length > 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {isEditing ? "Edit Automation" : "New Comment Automation"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Page + Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                Facebook Page *
              </Label>
              {pageIsLocked ? (
                <div className="h-9 px-3 flex items-center rounded-lg bg-[#F3F4F6] dark:bg-[#1e2433] text-sm text-[#6B7280] truncate">
                  {lockedPageName}
                </div>
              ) : (
                <select
                  value={form.facebookPageId}
                  onChange={(e) => {
                    setField("facebookPageId", e.target.value);
                    setField("postId", "");
                    setField("postSnippet", "");
                  }}
                  className="h-9 w-full rounded-lg border border-[#E5E7EB] dark:border-[#1e2433] bg-white dark:bg-[#111420] text-sm px-3 text-[#111827] dark:text-[#f3f4f6] focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="">Select page…</option>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              {!pageIsLocked && !pages.length && (
                <p className="text-[10px] text-amber-500">
                  No connected pages — connect a Facebook Page first
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                Automation Name *
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="e.g. Price enquiry"
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Post — locked info or picker */}
          {postIsLocked ? (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                Post
              </Label>
              <div className="rounded-lg bg-[#F3F4F6] dark:bg-[#1e2433] px-3 py-2.5 text-xs text-[#6B7280] line-clamp-2">
                {form.postSnippet || form.postId}
              </div>
            </div>
          ) : form.facebookPageId ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                  Target Post *
                </Label>
                <button
                  type="button"
                  onClick={() => refetchPosts()}
                  className="text-[10px] text-[#6366F1] flex items-center gap-1 hover:underline"
                >
                  <RefreshCw className="size-3" /> Refresh
                </button>
              </div>
              {loadingPosts ? (
                <div className="flex items-center gap-2 py-3 text-[#9CA3AF] text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading posts…
                </div>
              ) : posts.length === 0 ? (
                <p className="text-xs text-[#9CA3AF] py-2">
                  No posts found for this page.
                </p>
              ) : (
                <div className="border border-[#E5E7EB] dark:border-[#1e2433] rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                  {posts.map((post) => (
                    <button
                      key={post.postId}
                      type="button"
                      onClick={() => handleSelectPost(post)}
                      className={cn(
                        "w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-[#F9FAFB] dark:hover:bg-[#1a1f2e] transition-colors border-b border-[#F3F4F6] dark:border-[#1e2433] last:border-b-0",
                        form.postId === post.postId &&
                          "bg-indigo-500/5 border-l-2 border-l-[#6366F1]",
                      )}
                    >
                      {post.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.thumbnail}
                          alt=""
                          className="size-9 rounded object-cover shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#111827] dark:text-[#f3f4f6] line-clamp-1">
                          {post.snippet || "(no text)"}
                        </p>
                        <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                          {post.createdTime
                            ? new Date(post.createdTime).toLocaleDateString(
                                "en-GB",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                },
                              )
                            : ""}
                        </p>
                      </div>
                      {form.postId === post.postId && (
                        <span className="text-[#6366F1] text-[10px] font-bold shrink-0 mt-0.5">
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Action type — visual buttons */}
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
              Action Type *
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  "PRIVATE_REPLY",
                  "PUBLIC_COMMENT",
                  "BOTH",
                ] as FbCommentActionType[]
              ).map((at) => (
                <button
                  key={at}
                  type="button"
                  onClick={() => setField("actionType", at)}
                  className={cn(
                    "flex flex-col items-center gap-1 px-2 py-3 rounded-xl border text-center transition-all",
                    form.actionType === at
                      ? cn(
                          "border shadow-sm",
                          ACTION_COLORS[at].replace("border-", "border-"),
                        )
                      : "border-[#E5E7EB] dark:border-[#1e2433] hover:border-[#D1D5DB] dark:hover:border-[#2a2f3d]",
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wide",
                      form.actionType === at
                        ? ACTION_COLORS[at]
                            .split(" ")
                            .filter((c) => c.startsWith("text-"))
                            .join(" ")
                        : "text-[#9CA3AF]",
                    )}
                  >
                    {ACTION_LABELS[at]}
                  </span>
                  <span className="text-[9px] text-[#9CA3AF] leading-tight">
                    {at === "PRIVATE_REPLY"
                      ? "Messenger DM"
                      : at === "PUBLIC_COMMENT"
                        ? "Visible reply"
                        : "DM + public"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Keywords */}
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
              Trigger Keywords *
            </Label>
            <KeywordTagInput
              keywords={form.keywords}
              onChange={(kw) => setField("keywords", kw)}
            />
          </div>

          {/* ── Public Reply section — shown when action posts a public comment ── */}
          {(form.actionType === "PUBLIC_COMMENT" || form.actionType === "BOTH") && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 space-y-2">
              <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                <Globe className="size-3.5" />
                Public Reply
              </p>
              <p className="text-[10px] text-[#9CA3AF]">
                Visible comment posted under the post — keep it short and friendly.
              </p>
              <Textarea
                value={form.messageText}
                onChange={(e) => setField("messageText", e.target.value)}
                placeholder="Thanks for your comment! Check your DMs for details 👋"
                rows={2}
                className="text-sm"
              />
            </div>
          )}

          {/* ── Private DM section — shown when action sends a Messenger DM ── */}
          {(form.actionType === "PRIVATE_REPLY" || form.actionType === "BOTH") && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3.5 space-y-3">
              <p className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 uppercase tracking-wide">
                <MessageSquare className="size-3.5" />
                Private Messenger DM
              </p>

              {/* DM text — separate from public reply */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                  {form.aiEnabled
                    ? "Fallback DM Text (if AI fails)"
                    : form.actionType === "BOTH"
                      ? "DM Message *"
                      : "DM Message *"}
                </Label>
                <Textarea
                  value={form.dmText}
                  onChange={(e) => setField("dmText", e.target.value)}
                  placeholder="Hi! Thanks for your interest. Here are our pricing details…"
                  rows={3}
                  className="text-sm"
                />
                {form.actionType === "PRIVATE_REPLY" && (
                  <p className="text-[10px] text-[#9CA3AF]">
                    Only the DM will be sent — no public comment.
                  </p>
                )}
              </div>

              {/* URL Button */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                    Button Label
                  </Label>
                  <Input
                    value={form.buttonLabel}
                    onChange={(e) => setField("buttonLabel", e.target.value)}
                    placeholder="View Pricing"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                    Button URL
                  </Label>
                  <Input
                    value={form.buttonUrl}
                    onChange={(e) => setField("buttonUrl", e.target.value)}
                    placeholder="https://…"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              {(form.buttonLabel || form.buttonUrl) && (
                <p className="text-[10px] text-indigo-300">
                  A tappable button will be appended to the DM — both label and URL required.
                </p>
              )}

              {/* Media Image — picker */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                  Media Image <span className="font-normal normal-case text-[#9CA3AF]">(optional)</span>
                </Label>
                <MediaPicker
                  value={form.mediaUrl}
                  onChange={(url) => setField("mediaUrl", url)}
                  label="Pick DM Image"
                  placeholder="No image — tap Pick to choose from library"
                />
                <p className="text-[10px] text-[#9CA3AF]">
                  Sent as a separate image after the DM text (only when no button is set).
                </p>
              </div>
            </div>
          )}

          {/* Public-only: still need a message text field */}
          {form.actionType === "PUBLIC_COMMENT" && (
            <p className="text-[10px] text-[#9CA3AF] -mt-2">
              No DM will be sent — only the public reply above.
            </p>
          )}

          {/* AI toggle */}
          <div
            className={cn(
              "rounded-xl border p-3.5 space-y-3 transition-colors",
              form.aiEnabled
                ? "border-violet-500/30 bg-violet-500/5"
                : "border-[#E5E7EB] dark:border-[#1e2433]",
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#111827] dark:text-[#f3f4f6] flex items-center gap-2">
                  <Bot
                    className={cn(
                      "size-4",
                      form.aiEnabled ? "text-violet-400" : "text-[#9CA3AF]",
                    )}
                  />
                  AI-Generated DM Replies
                </p>
                <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                  AI writes the DM dynamically — public reply stays as typed
                </p>
              </div>
              <button
                type="button"
                onClick={() => setField("aiEnabled", !form.aiEnabled)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none",
                  form.aiEnabled
                    ? "bg-violet-500"
                    : "bg-[#D1D5DB] dark:bg-[#374151]",
                )}
              >
                <span
                  className={cn(
                    "block size-4 rounded-full bg-white shadow-sm transition-transform",
                    form.aiEnabled ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
            </div>

            {form.aiEnabled && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
                  System Prompt (optional)
                </Label>
                <Textarea
                  value={form.aiSystemPrompt}
                  onChange={(e) => setField("aiSystemPrompt", e.target.value)}
                  placeholder="You are a helpful sales assistant for [Business]. Answer questions about pricing professionally…"
                  rows={2}
                  className="text-sm"
                />
                <p className="text-[10px] text-[#9CA3AF]">
                  Leave blank to use your Brand AI Settings.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} className="text-sm">
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || saveMutation.isPending}
            onClick={() => saveMutation.mutate(form)}
            className="text-sm stitch-gradient text-white border-0"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="size-3.5 mr-2 animate-spin" />
                Saving…
              </>
            ) : isEditing ? (
              "Save Changes"
            ) : (
              "Create Automation"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Automation Row ───────────────────────────────────────────────────────────

function AutomationRow({
  automation,
  onEdit,
  onLogs,
  onToggle,
  onDelete,
}: {
  automation: FbCommentAutomation;
  onEdit: () => void;
  onLogs: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-5 py-4 hover:bg-[#F9FAFB] dark:hover:bg-[#0d1017] transition-colors",
        !automation.isActive && "opacity-60",
      )}
    >
      {/* Status dot */}
      <div
        className={cn(
          "size-2 rounded-full mt-1.5 shrink-0",
          automation.isActive
            ? "bg-emerald-400"
            : "bg-[#D1D5DB] dark:bg-[#374151]",
        )}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className="text-sm font-semibold text-[#111827] dark:text-[#f3f4f6]">
            {automation.name}
          </span>
          <span
            className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase",
              ACTION_COLORS[automation.actionType],
            )}
          >
            {ACTION_LABELS[automation.actionType]}
          </span>
          {automation.aiEnabled && (
            <span className="bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex items-center gap-1">
              <Bot className="size-2.5" /> AI
            </span>
          )}
        </div>

        {/* Keywords */}
        <div className="flex flex-wrap gap-1 mb-2">
          {automation.keywords.map((kw) => (
            <span
              key={kw.id}
              className="bg-[#F3F4F6] dark:bg-[#1e2433] text-[#6B7280] text-[10px] font-mono px-1.5 py-0.5 rounded"
            >
              {kw.keyword}
              {kw.matchType === "EXACT" && (
                <span className="opacity-50 ml-1 not-italic text-[9px]">=exact</span>
              )}
            </span>
          ))}
        </div>

        {/* Post + stats */}
        <div className="flex items-center gap-3 text-[10px] text-[#9CA3AF]">
          {automation.postSnippet && (
            <span className="truncate max-w-[200px]" title={automation.postSnippet}>
              📄 {automation.postSnippet}
            </span>
          )}
          <span className="shrink-0 font-medium">
            {automation.replyCount} replies
          </span>
          <span className="shrink-0">{automation._count.events} events</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onLogs}
          title="View logs"
          className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#6366F1] hover:bg-indigo-500/10 transition-colors"
        >
          <Eye className="size-3.5" />
        </button>
        <button
          onClick={onEdit}
          title="Edit"
          className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#f3f4f6] hover:bg-[#F3F4F6] dark:hover:bg-[#1e2433] transition-colors"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          onClick={onToggle}
          title={automation.isActive ? "Deactivate" : "Activate"}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            automation.isActive
              ? "text-emerald-400 hover:bg-emerald-500/10"
              : "text-[#9CA3AF] hover:text-emerald-400 hover:bg-emerald-500/10",
          )}
        >
          <Power className="size-3.5" />
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Time Ago ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// ─── Post Feed Panel ──────────────────────────────────────────────────────────

function PostFeedPanel({
  pageDbId,
  onAddAutomation,
}: {
  pageDbId: string | null;
  onAddAutomation: (post: FbPost) => void;
}) {
  const {
    data: posts = [],
    isFetching,
    refetch,
  } = useQuery({
    queryKey: qk.fbPagePosts(pageDbId ?? ""),
    queryFn: async () => {
      if (!pageDbId) return [];
      const { data } = await api.get<FbPost[]>(
        `/fb-comment-automations/pages/${pageDbId}/posts`,
      );
      return data;
    },
    enabled: !!pageDbId,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB] dark:border-[#1e2433] shrink-0">
        <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
          Recent Posts
        </p>
        {pageDbId && (
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh posts"
            className="text-[#9CA3AF] hover:text-[#6366F1] transition-colors p-1 rounded"
          >
            <RefreshCw
              className={cn("size-3.5", isFetching && "animate-spin")}
            />
          </button>
        )}
      </div>

      {/* Posts list */}
      <div className="flex-1 overflow-y-auto">
        {!pageDbId ? (
          <div className="flex flex-col items-center justify-center h-48 px-4 text-center text-[#9CA3AF]">
            <Globe className="size-6 mb-2 opacity-30" />
            <p className="text-xs">Select a page to see posts</p>
          </div>
        ) : isFetching && !posts.length ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-[#9CA3AF]" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 px-4 text-center text-[#9CA3AF]">
            <p className="text-xs">No recent posts found</p>
          </div>
        ) : (
          <div className="divide-y divide-[#F3F4F6] dark:divide-[#1e2433]">
            {posts.map((post) => (
              <div
                key={post.postId}
                className="flex items-start gap-3 px-4 py-3 hover:bg-[#F9FAFB] dark:hover:bg-[#1a1f2e] group transition-colors"
              >
                {post.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.thumbnail}
                    alt=""
                    className="size-10 rounded-lg object-cover shrink-0 mt-0.5"
                  />
                ) : (
                  <div className="size-10 rounded-lg bg-[#F3F4F6] dark:bg-[#1e2433] shrink-0 mt-0.5 flex items-center justify-center">
                    <MessageSquare className="size-4 text-[#9CA3AF]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#111827] dark:text-[#f3f4f6] line-clamp-2 leading-relaxed">
                    {post.snippet || "(no text)"}
                  </p>
                  <p className="text-[10px] text-[#9CA3AF] mt-1">
                    {timeAgo(post.createdTime)}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="p-1 rounded text-[#9CA3AF] hover:text-[#6366F1] hover:bg-indigo-500/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0 mt-0.5"
                    render={<button />}
                  >
                    <Settings2 className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onClick={() => onAddAutomation(post)}
                      className="text-sm cursor-pointer"
                    >
                      <PlusCircle className="size-3.5 mr-2" />
                      Add Automation
                    </DropdownMenuItem>
                    {post.permalinkUrl && (
                      <DropdownMenuItem className="text-sm p-0">
                        <a
                          href={post.permalinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center w-full px-2 py-1.5"
                        >
                          <ExternalLink className="size-3.5 mr-2" />
                          View on Facebook
                        </a>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function FbCommentAutomationsPage() {
  const queryClient = useQueryClient();

  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPreset, setDialogPreset] = useState<DialogPreset | undefined>(
    undefined,
  );
  const [editTarget, setEditTarget] = useState<FbCommentAutomation | null>(
    null,
  );
  const [logsTarget, setLogsTarget] = useState<FbCommentAutomation | null>(
    null,
  );

  // Connected Facebook pages
  const { data: pages = [], isLoading: loadingPages } = useQuery({
    queryKey: qk.facebookPages,
    queryFn: async () => {
      const { data } = await api.get<FacebookPage[]>("/facebook/pages");
      return data;
    },
  });

  // All automations
  const { data: automations = [], isLoading: loadingAutomations } = useQuery({
    queryKey: qk.fbCommentAutomations,
    queryFn: async () => {
      const { data } =
        await api.get<FbCommentAutomation[]>("/fb-comment-automations");
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/fb-comment-automations/${id}/toggle`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: qk.fbCommentAutomations }),
    onError: () => toast.error("Failed to toggle automation"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/fb-comment-automations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.fbCommentAutomations });
      toast.success("Automation deleted");
    },
    onError: () => toast.error("Failed to delete automation"),
  });

  // Auto-select first page on load
  useEffect(() => {
    if (pages.length && !selectedPageId) {
      setSelectedPageId(pages[0].id);
    }
  }, [pages, selectedPageId]);

  const selectedPage = pages.find((p) => p.id === selectedPageId) ?? null;
  const pageAutomations = automations.filter(
    (a) => a.facebookPageId === selectedPageId,
  );
  const activeCount = pageAutomations.filter((a) => a.isActive).length;
  const totalReplies = pageAutomations.reduce(
    (sum, a) => sum + a.replyCount,
    0,
  );

  const handleDelete = (automation: FbCommentAutomation) => {
    if (!confirm(`Delete "${automation.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(automation.id);
  };

  const openCreate = (preset?: DialogPreset) => {
    setDialogPreset(preset);
    setDialogOpen(true);
  };

  const handleAddFromPost = (post: FbPost) => {
    if (!selectedPageId) return;
    openCreate({
      facebookPageId: selectedPageId,
      postId: post.postId,
      postSnippet: post.snippet,
    });
  };

  return (
    <div className="page-container pb-6 flex flex-col gap-5">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#111827] dark:text-[#f3f4f6]">
            Comment Automations
          </h2>
          <p className="text-sm text-[#6B7280] mt-0.5">
            Auto-reply when someone comments a keyword on your Facebook posts
          </p>
        </div>
        <Button
          onClick={() => openCreate()}
          className="stitch-gradient text-white border-0 text-sm"
        >
          <PlusCircle className="size-4 mr-2" />
          New Automation
        </Button>
      </div>

      {/* ── 3-Panel Body ────────────────────────────────────────── */}
      <div className="flex border border-[#E5E7EB] dark:border-[#1e2433] rounded-2xl overflow-hidden min-h-[580px]">

        {/* ── LEFT: Pages sidebar ─────────────────────────────── */}
        <div className="w-52 shrink-0 border-r border-[#E5E7EB] dark:border-[#1e2433] bg-[#F9FAFB] dark:bg-[#0d1017] flex flex-col">
          <div className="px-4 py-3 border-b border-[#E5E7EB] dark:border-[#1e2433]">
            <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">
              Connected Pages
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingPages ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-4 animate-spin text-[#9CA3AF]" />
              </div>
            ) : pages.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Globe className="size-6 text-[#9CA3AF] mx-auto mb-2 opacity-40" />
                <p className="text-[11px] text-[#9CA3AF]">
                  No Facebook pages connected.
                </p>
                <p className="text-[10px] text-[#9CA3AF] mt-1 opacity-70">
                  Go to Channels → Facebook.
                </p>
              </div>
            ) : (
              <div className="py-2">
                {pages.map((page) => {
                  const count = automations.filter(
                    (a) => a.facebookPageId === page.id,
                  ).length;
                  const isSelected = selectedPageId === page.id;
                  return (
                    <button
                      key={page.id}
                      onClick={() => setSelectedPageId(page.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-4 py-2.5 transition-colors text-left",
                        isSelected
                          ? "bg-indigo-500/10 border-r-2 border-r-[#6366F1]"
                          : "hover:bg-[#F3F4F6] dark:hover:bg-[#1a1f2e]",
                      )}
                    >
                      <div
                        className={cn(
                          "size-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold",
                          isSelected
                            ? "bg-indigo-500/20 text-indigo-400"
                            : "bg-[#E5E7EB] dark:bg-[#1e2433] text-[#6B7280]",
                        )}
                      >
                        {page.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-xs font-semibold truncate",
                            isSelected
                              ? "text-[#6366F1]"
                              : "text-[#111827] dark:text-[#f3f4f6]",
                          )}
                        >
                          {page.name}
                        </p>
                        <p className="text-[10px] text-[#9CA3AF]">
                          {count} automation{count !== 1 ? "s" : ""}
                        </p>
                      </div>
                      {isSelected && (
                        <ChevronRight className="size-3 text-[#6366F1] shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── CENTER: Automations ──────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {!selectedPage ? (
            <div className="flex flex-col items-center justify-center flex-1 py-20 text-center text-[#9CA3AF]">
              <MessageSquare className="size-8 mb-3 opacity-30" />
              <p className="text-sm">Select a page from the sidebar</p>
            </div>
          ) : (
            <>
              {/* Center sticky header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5E7EB] dark:border-[#1e2433] shrink-0 bg-white dark:bg-[#111420]">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#111827] dark:text-[#f3f4f6]">
                    {selectedPage.name}
                  </p>
                  <span className="text-[10px] bg-[#F3F4F6] dark:bg-[#1e2433] text-[#6B7280] px-2 py-0.5 rounded-full font-semibold">
                    {pageAutomations.length} total
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    openCreate({ facebookPageId: selectedPageId! })
                  }
                  className="stitch-gradient text-white border-0 text-xs h-7 px-3"
                >
                  <PlusCircle className="size-3 mr-1.5" />
                  Add
                </Button>
              </div>

              {/* Stats row */}
              {pageAutomations.length > 0 && (
                <div className="grid grid-cols-3 gap-px bg-[#E5E7EB] dark:bg-[#1e2433] border-b border-[#E5E7EB] dark:border-[#1e2433] shrink-0">
                  <div className="bg-white dark:bg-[#111420] px-5 py-3">
                    <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wide font-bold">
                      Active
                    </p>
                    <p className="text-2xl font-bold text-emerald-500 mt-0.5">
                      {activeCount}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-[#111420] px-5 py-3">
                    <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wide font-bold">
                      Total Replies
                    </p>
                    <p className="text-2xl font-bold text-[#111827] dark:text-[#f3f4f6] mt-0.5">
                      {totalReplies}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-[#111420] px-5 py-3">
                    <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wide font-bold">
                      Automations
                    </p>
                    <p className="text-2xl font-bold text-[#111827] dark:text-[#f3f4f6] mt-0.5">
                      {pageAutomations.length}
                    </p>
                  </div>
                </div>
              )}

              {/* Automation list */}
              <div className="flex-1 overflow-y-auto">
                {loadingAutomations ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="size-5 animate-spin text-[#9CA3AF]" />
                  </div>
                ) : pageAutomations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <div className="size-12 rounded-2xl bg-[#F3F4F6] dark:bg-[#1e2433] flex items-center justify-center mb-4">
                      <MessageSquare className="size-6 text-[#9CA3AF]" />
                    </div>
                    <h3 className="text-sm font-semibold text-[#111827] dark:text-[#f3f4f6] mb-1">
                      No automations yet
                    </h3>
                    <p className="text-xs text-[#9CA3AF] mb-4 max-w-xs">
                      Hover over a post in the right panel and click the{" "}
                      <Settings2 className="size-3 inline" /> icon to add an
                      automation, or use the Add button above.
                    </p>
                    <Button
                      size="sm"
                      onClick={() =>
                        openCreate({ facebookPageId: selectedPageId! })
                      }
                      className="stitch-gradient text-white border-0 text-xs"
                    >
                      <PlusCircle className="size-3 mr-1.5" />
                      Create First Automation
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-[#F3F4F6] dark:divide-[#1e2433]">
                    {pageAutomations.map((automation) => (
                      <AutomationRow
                        key={automation.id}
                        automation={automation}
                        onEdit={() => setEditTarget(automation)}
                        onLogs={() => setLogsTarget(automation)}
                        onToggle={() => toggleMutation.mutate(automation.id)}
                        onDelete={() => handleDelete(automation)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Posts feed ────────────────────────────────── */}
        <div className="w-72 shrink-0 border-l border-[#E5E7EB] dark:border-[#1e2433] flex flex-col overflow-hidden">
          <PostFeedPanel
            pageDbId={selectedPageId}
            onAddAutomation={handleAddFromPost}
          />
        </div>
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────── */}
      {dialogOpen && (
        <AutomationDialog
          preset={dialogPreset}
          onClose={() => {
            setDialogOpen(false);
            setDialogPreset(undefined);
          }}
          onSaved={() => {
            setDialogOpen(false);
            setDialogPreset(undefined);
          }}
        />
      )}
      {editTarget && (
        <AutomationDialog
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => setEditTarget(null)}
        />
      )}
      {logsTarget && (
        <LogsDialog
          automation={logsTarget}
          onClose={() => setLogsTarget(null)}
        />
      )}
    </div>
  );
}
