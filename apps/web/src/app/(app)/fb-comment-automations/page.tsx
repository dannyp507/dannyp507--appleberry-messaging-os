"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { toast } from "@/lib/toast";
import type { FbCommentAutomation, FbCommentEvent, FacebookPage, FbPost, FbCommentActionType } from "@/lib/api/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PlusCircle,
  Trash2,
  Pencil,
  Power,
  Eye,
  Loader2,
  MessageSquare,
  Bot,
  ChevronDown,
  X,
  ExternalLink,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<FbCommentActionType, string> = {
  PRIVATE_REPLY: "Private DM",
  PUBLIC_COMMENT: "Public Reply",
  BOTH: "DM + Public Reply",
};

const ACTION_COLORS: Record<FbCommentActionType, string> = {
  PRIVATE_REPLY: "bg-indigo-500/10 text-indigo-400",
  PUBLIC_COMMENT: "bg-emerald-500/10 text-emerald-400",
  BOTH: "bg-amber-500/10 text-amber-400",
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
  messageText: string;
  buttonLabel: string;
  buttonUrl: string;
  mediaUrl: string;
  aiEnabled: boolean;
  aiSystemPrompt: string;
  isActive: boolean;
  keywords: KeywordEntry[];
}

const EMPTY_FORM: AutomationForm = {
  facebookPageId: "",
  postId: "",
  postSnippet: "",
  name: "",
  actionType: "PRIVATE_REPLY",
  messageText: "",
  buttonLabel: "",
  buttonUrl: "",
  mediaUrl: "",
  aiEnabled: false,
  aiSystemPrompt: "",
  isActive: true,
  keywords: [{ keyword: "", matchType: "CONTAINS" }],
};

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
        `/fb-comment-automations/${automation.id}/events?take=100`
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
                  {["Commenter", "Comment", "Keyword", "Action", "Result", "Time"].map((h) => (
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
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold uppercase", ACTION_COLORS[e.actionType])}>
                          {ACTION_LABELS[e.actionType]}
                        </span>
                      ) : (
                        <span className="text-[#9CA3AF]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {e.error ? (
                        <span className="text-red-400 text-[10px]" title={e.error}>⚠ Error</span>
                      ) : (e.privateReplySent || e.publicReplySent) ? (
                        <span className="text-emerald-400">✓ Sent</span>
                      ) : (
                        <span className="text-[#9CA3AF]">No match</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#9CA3AF] whitespace-nowrap">
                      {new Date(e.processedAt).toLocaleString("en-GB", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
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

// ─── Create / Edit Dialog ─────────────────────────────────────────────────────

function AutomationDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial?: FbCommentAutomation;
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
        buttonLabel: initial.buttonLabel ?? "",
        buttonUrl: initial.buttonUrl ?? "",
        mediaUrl: initial.mediaUrl ?? "",
        aiEnabled: initial.aiEnabled,
        aiSystemPrompt: initial.aiSystemPrompt ?? "",
        isActive: initial.isActive,
        keywords: initial.keywords.length
          ? initial.keywords.map((k) => ({ keyword: k.keyword, matchType: k.matchType }))
          : [{ keyword: "", matchType: "CONTAINS" }],
      };
    }
    return { ...EMPTY_FORM };
  });

  // Facebook pages
  const { data: pages = [] } = useQuery({
    queryKey: qk.facebookPages,
    queryFn: async () => {
      const { data } = await api.get<FacebookPage[]>("/facebook/pages");
      return data;
    },
  });

  // Posts for selected page
  const {
    data: posts = [],
    isFetching: loadingPosts,
    refetch: refetchPosts,
  } = useQuery({
    queryKey: qk.fbPagePosts(form.facebookPageId ?? ""),
    queryFn: async () => {
      if (!form.facebookPageId) return [];
      const { data } = await api.get<FbPost[]>(
        `/fb-comment-automations/pages/${form.facebookPageId}/posts`
      );
      return data;
    },
    enabled: !!form.facebookPageId,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: AutomationForm) => {
      const body = {
        ...payload,
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

  const setField = <K extends keyof AutomationForm>(key: K, value: AutomationForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const addKeyword = () =>
    setForm((f) => ({
      ...f,
      keywords: [...f.keywords, { keyword: "", matchType: "CONTAINS" }],
    }));

  const removeKeyword = (i: number) =>
    setForm((f) => ({ ...f, keywords: f.keywords.filter((_, idx) => idx !== i) }));

  const updateKeyword = (i: number, field: keyof KeywordEntry, value: string) =>
    setForm((f) => ({
      ...f,
      keywords: f.keywords.map((k, idx) =>
        idx === i ? { ...k, [field]: value } : k
      ),
    }));

  const handleSelectPost = (post: FbPost) => {
    setForm((f) => ({
      ...f,
      postId: post.postId,
      postSnippet: post.snippet,
      name: f.name || post.snippet.slice(0, 50),
    }));
  };

  const canSubmit =
    form.facebookPageId &&
    form.postId &&
    form.name.trim() &&
    form.messageText.trim() &&
    form.keywords.some((k) => k.keyword.trim());

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {isEditing ? "Edit Automation" : "New Comment Automation"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Page + Post */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                Facebook Page *
              </Label>
              <Select
                value={form.facebookPageId}
                onValueChange={(v) => { setField("facebookPageId", v ?? ""); setField("postId", ""); setField("postSnippet", ""); }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select page…" />
                </SelectTrigger>
                <SelectContent>
                  {pages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!pages.length && (
                <p className="text-[10px] text-amber-500">No connected pages — connect a Facebook Page first</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                Automation Name *
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="e.g. Price enquiry reply"
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Post selector */}
          {form.facebookPageId && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                  Target Post *
                </Label>
                <button
                  type="button"
                  onClick={() => refetchPosts()}
                  className="text-[10px] text-[#6366F1] flex items-center gap-1 hover:underline"
                >
                  <RefreshCw className="size-3" />
                  Refresh
                </button>
              </div>

              {loadingPosts ? (
                <div className="flex items-center gap-2 py-3 text-[#9CA3AF] text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading posts…
                </div>
              ) : posts.length === 0 ? (
                <p className="text-xs text-[#9CA3AF] py-2">No posts found for this page.</p>
              ) : (
                <div className="border border-[#E5E7EB] dark:border-[#1e2433] rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {posts.map((post) => (
                    <button
                      key={post.postId}
                      type="button"
                      onClick={() => handleSelectPost(post)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-[#F9FAFB] dark:hover:bg-[#1a1f2e] transition-colors border-b border-[#F3F4F6] dark:border-[#1e2433] last:border-b-0",
                        form.postId === post.postId && "bg-indigo-500/5 border-l-2 border-l-[#6366F1]"
                      )}
                    >
                      {post.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.thumbnail} alt="" className="size-10 rounded object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#111827] dark:text-[#f3f4f6] line-clamp-2">
                          {post.snippet || "(no text)"}
                        </p>
                        <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                          {post.createdTime
                            ? new Date(post.createdTime).toLocaleDateString("en-GB", {
                                day: "numeric", month: "short", year: "numeric",
                              })
                            : ""}
                        </p>
                      </div>
                      {form.postId === post.postId && (
                        <span className="text-[#6366F1] text-[10px] font-bold shrink-0 mt-0.5">Selected</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {form.postId && (
                <p className="text-[10px] text-[#9CA3AF] font-mono">Post ID: {form.postId}</p>
              )}
            </div>
          )}

          {/* Keywords */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                Trigger Keywords *
              </Label>
              <button
                type="button"
                onClick={addKeyword}
                className="text-[10px] text-[#6366F1] flex items-center gap-1 hover:underline"
              >
                <PlusCircle className="size-3" />
                Add keyword
              </button>
            </div>
            <div className="space-y-2">
              {form.keywords.map((kw, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={kw.matchType}
                    onValueChange={(v) => updateKeyword(i, "matchType", v ?? "CONTAINS")}
                  >
                    <SelectTrigger className="h-8 w-28 text-xs shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CONTAINS">Contains</SelectItem>
                      <SelectItem value="EXACT">Exact</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={kw.keyword}
                    onChange={(e) => updateKeyword(i, "keyword", e.target.value)}
                    placeholder={`Keyword ${i + 1} (e.g. PRICE)`}
                    className="h-8 text-sm font-mono flex-1"
                  />
                  {form.keywords.length > 1 && (
                    <button type="button" onClick={() => removeKeyword(i)} className="text-[#9CA3AF] hover:text-red-400 transition-colors">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[#9CA3AF]">
              Case-insensitive. &ldquo;Contains&rdquo; matches anywhere in the comment; &ldquo;Exact&rdquo; requires the full comment to match.
            </p>
          </div>

          {/* Action */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                Action Type *
              </Label>
              <Select
                value={form.actionType}
                onValueChange={(v) => setField("actionType", (v ?? "PRIVATE_REPLY") as FbCommentActionType)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE_REPLY">Private DM (Messenger)</SelectItem>
                  <SelectItem value="PUBLIC_COMMENT">Public Reply to Comment</SelectItem>
                  <SelectItem value="BOTH">Both — DM + Public Reply</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-[#9CA3AF]">
                {form.actionType === "PRIVATE_REPLY" && "Sends a private Messenger DM to the commenter."}
                {form.actionType === "PUBLIC_COMMENT" && "Posts a public reply to the comment thread."}
                {form.actionType === "BOTH" && "Sends a private DM and posts a public reply."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                Status
              </Label>
              <button
                type="button"
                onClick={() => setField("isActive", !form.isActive)}
                className={cn(
                  "flex items-center gap-2 h-9 px-3 rounded-lg border text-sm font-medium transition-colors w-full",
                  form.isActive
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-[#E5E7EB] dark:border-[#1e2433] text-[#9CA3AF]"
                )}
              >
                {form.isActive ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}
                {form.isActive ? "Active" : "Inactive"}
              </button>
            </div>
          </div>

          {/* AI toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                  AI-Generated Replies
                </Label>
                <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                  Let AI craft dynamic replies using your brand settings
                </p>
              </div>
              <button
                type="button"
                onClick={() => setField("aiEnabled", !form.aiEnabled)}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-semibold transition-colors",
                  form.aiEnabled
                    ? "bg-violet-500/10 border-violet-500/30 text-violet-400"
                    : "border-[#E5E7EB] dark:border-[#1e2433] text-[#9CA3AF] hover:border-violet-500/30"
                )}
              >
                <Bot className="size-3.5" />
                {form.aiEnabled ? "AI On" : "Enable AI"}
              </button>
            </div>

            {form.aiEnabled && (
              <div className="space-y-1.5 pl-1 border-l-2 border-violet-500/30">
                <Label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
                  AI System Prompt (optional override)
                </Label>
                <Textarea
                  value={form.aiSystemPrompt}
                  onChange={(e) => setField("aiSystemPrompt", e.target.value)}
                  placeholder="You are a helpful sales assistant for [Business]. Answer questions about pricing and availability professionally..."
                  rows={3}
                  className="text-sm"
                />
                <p className="text-[10px] text-[#9CA3AF]">
                  Leave blank to use your Brand Settings as the AI context.
                </p>
              </div>
            )}
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">
              {form.aiEnabled ? "Fallback Message (if AI fails) *" : "Reply Message *"}
            </Label>
            <Textarea
              value={form.messageText}
              onChange={(e) => setField("messageText", e.target.value)}
              placeholder="Hi! Thanks for your interest. Please DM us or visit our website for pricing details."
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Optional extras */}
          <details className="group">
            <summary className="flex items-center gap-2 text-xs font-semibold text-[#6B7280] uppercase tracking-wide cursor-pointer select-none list-none">
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
              Optional: Button & Media
            </summary>
            <div className="pt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#9CA3AF]">Button Label</Label>
                  <Input
                    value={form.buttonLabel}
                    onChange={(e) => setField("buttonLabel", e.target.value)}
                    placeholder="View Our Menu"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#9CA3AF]">Button URL</Label>
                  <Input
                    value={form.buttonUrl}
                    onChange={(e) => setField("buttonUrl", e.target.value)}
                    placeholder="https://example.com/menu"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#9CA3AF]">Media URL</Label>
                <Input
                  value={form.mediaUrl}
                  onChange={(e) => setField("mediaUrl", e.target.value)}
                  placeholder="https://cdn.example.com/promo.jpg"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </details>
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
              <><Loader2 className="size-3.5 mr-2 animate-spin" />Saving…</>
            ) : (
              isEditing ? "Save Changes" : "Create Automation"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Automation Card ──────────────────────────────────────────────────────────

function AutomationCard({
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
        "bg-white dark:bg-[#111420] border rounded-2xl p-5 transition-all",
        automation.isActive
          ? "border-[#E5E7EB] dark:border-[#1e2433]"
          : "border-[#F3F4F6] dark:border-[#1a1f2e] opacity-60"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-[#111827] dark:text-[#f3f4f6] truncate">
              {automation.name}
            </h3>
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                automation.isActive
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-[#F3F4F6] dark:bg-[#1e2433] text-[#9CA3AF]"
              )}
            >
              {automation.isActive ? "Active" : "Inactive"}
            </span>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase", ACTION_COLORS[automation.actionType])}>
              {ACTION_LABELS[automation.actionType]}
            </span>
            {automation.aiEnabled && (
              <span className="bg-violet-500/10 text-violet-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                <Bot className="size-2.5" /> AI
              </span>
            )}
          </div>
          <p className="text-xs text-[#6B7280] mt-0.5">
            📄 {automation.fbPage.name}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onLogs}
            title="View logs"
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#6366F1] hover:bg-indigo-500/10 transition-colors"
          >
            <Eye className="size-4" />
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#f3f4f6] hover:bg-[#F3F4F6] dark:hover:bg-[#1e2433] transition-colors"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={onToggle}
            title={automation.isActive ? "Deactivate" : "Activate"}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              automation.isActive
                ? "text-emerald-400 hover:bg-emerald-500/10"
                : "text-[#9CA3AF] hover:text-emerald-400 hover:bg-emerald-500/10"
            )}
          >
            <Power className="size-4" />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Post snippet */}
      {automation.postSnippet && (
        <div className="bg-[#F9FAFB] dark:bg-[#1a1f2e] rounded-lg px-3 py-2 mb-3 text-xs text-[#6B7280] line-clamp-1">
          &ldquo;{automation.postSnippet}&rdquo;
        </div>
      )}

      {/* Keywords */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {automation.keywords.map((kw) => (
          <span
            key={kw.id}
            className="bg-indigo-500/10 text-indigo-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase"
          >
            {kw.keyword}
            {kw.matchType === "EXACT" && <span className="ml-1 opacity-60">(exact)</span>}
          </span>
        ))}
      </div>

      {/* Message preview */}
      <p className="text-xs text-[#9CA3AF] line-clamp-2 mb-3">
        💬 {automation.messageText}
      </p>

      {/* Stats */}
      <div className="flex items-center justify-between text-[10px] text-[#9CA3AF] border-t border-[#F3F4F6] dark:border-[#1e2433] pt-3 mt-1">
        <span>{automation.replyCount} replies sent</span>
        <span>{automation._count.events} events logged</span>
        <span>
          {new Date(automation.createdAt).toLocaleDateString("en-GB", {
            day: "numeric", month: "short", year: "numeric",
          })}
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function FbCommentAutomationsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<FbCommentAutomation | null>(null);
  const [logsTarget, setLogsTarget] = useState<FbCommentAutomation | null>(null);

  const { data: automations = [], isLoading } = useQuery({
    queryKey: qk.fbCommentAutomations,
    queryFn: async () => {
      const { data } = await api.get<FbCommentAutomation[]>("/fb-comment-automations");
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.post(`/fb-comment-automations/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.fbCommentAutomations }),
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

  const handleDelete = (automation: FbCommentAutomation) => {
    if (!confirm(`Delete "${automation.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(automation.id);
  };

  // Group automations by page
  const byPage = automations.reduce<Record<string, FbCommentAutomation[]>>((acc, a) => {
    const key = a.fbPage.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#111827] dark:text-[#f3f4f6]">
            Comment Automations
          </h2>
          <p className="text-sm text-[#6B7280] mt-0.5">
            Automatically reply when someone comments a keyword on your Facebook posts
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="stitch-gradient text-white border-0 text-sm"
        >
          <PlusCircle className="size-4 mr-2" />
          New Automation
        </Button>
      </div>

      {/* Info banner */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-600 dark:text-amber-400 flex items-start gap-3">
        <span className="text-base mt-0.5">⚠️</span>
        <div>
          <strong className="font-semibold">Meta setup required:</strong> Enable the{" "}
          <code className="bg-amber-500/10 px-1 rounded text-xs font-mono">feed</code> webhook field
          in your app&rsquo;s Meta Developer Console (Webhooks → Page → feed). This was automatically
          added to new page subscriptions — existing pages may need to be reconnected.
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-[#9CA3AF]" />
        </div>
      ) : automations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#F3F4F6] dark:bg-[#1e2433] flex items-center justify-center mb-4">
            <MessageSquare className="size-8 text-[#9CA3AF]" />
          </div>
          <h3 className="text-base font-semibold text-[#111827] dark:text-[#f3f4f6] mb-1">
            No automations yet
          </h3>
          <p className="text-sm text-[#9CA3AF] mb-5 max-w-sm">
            Create your first comment automation. When someone comments a keyword on your
            Facebook post, the app will automatically reply.
          </p>
          <Button
            onClick={() => setShowCreate(true)}
            className="stitch-gradient text-white border-0 text-sm"
          >
            <PlusCircle className="size-4 mr-2" />
            Create First Automation
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byPage).map(([pageName, items]) => (
            <div key={pageName}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF] dark:text-[#4b5563] mb-3">
                {pageName} — {items.length} automation{items.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {items.map((a) => (
                  <AutomationCard
                    key={a.id}
                    automation={a}
                    onEdit={() => setEditTarget(a)}
                    onLogs={() => setLogsTarget(a)}
                    onToggle={() => toggleMutation.mutate(a.id)}
                    onDelete={() => handleDelete(a)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      {showCreate && (
        <AutomationDialog
          onClose={() => setShowCreate(false)}
          onSaved={() => setShowCreate(false)}
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
