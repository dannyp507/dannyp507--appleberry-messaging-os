"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { InboxMessage, InboxThread } from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Inbox,
  Loader2,
  Send,
  UserCircle,
  UserMinus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function threadHasUnread(t: InboxThread): boolean {
  if (t.unreadCount > 0) return true;
  const latest = t.messages?.[0];
  return latest?.direction === "INBOUND";
}

function contactSubtitle(t: InboxThread): string {
  if (t.channel === "MESSENGER") {
    return t.fbPage?.name ? `Messenger · ${t.fbPage.name}` : "Messenger";
  }
  if (t.channel === "TELEGRAM") return "Telegram";
  const p = t.contact.phone;
  return p.startsWith("fb:") ? "Messenger" : p;
}

const CHANNEL_BADGE: Record<string, { label: string; className: string }> = {
  WHATSAPP:  { label: "WA", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  MESSENGER: { label: "FB", className: "bg-blue-500/15   text-blue-400   border-blue-500/25"     },
  TELEGRAM:  { label: "TG", className: "bg-sky-500/15    text-sky-400    border-sky-500/25"       },
  INSTAGRAM: { label: "IG", className: "bg-pink-500/15   text-pink-400   border-pink-500/25"      },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)  return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Thread list item ─────────────────────────────────────────────────────────

function ThreadItem({
  thread,
  active,
  onClick,
}: {
  thread: InboxThread;
  active: boolean;
  onClick: () => void;
}) {
  const unread  = threadHasUnread(thread);
  const badge   = CHANNEL_BADGE[thread.channel];
  const preview = thread.messages?.[0];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl px-3 py-3 text-left transition-all duration-150",
        active
          ? "bg-[#1e2330] ring-1 ring-[#2d3248]/80"
          : unread
          ? "bg-[#6366F1]/5 ring-1 ring-[#6366F1]/15 hover:bg-[#1a1f2a]"
          : "hover:bg-[#161a21]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1e2330] text-xs font-bold text-[#6366F1] ring-1 ring-[#2d3141]">
          {thread.contact.firstName?.[0]?.toUpperCase() ?? "?"}
          {unread && !active && (
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-[#6366F1] ring-2 ring-[#0f1219]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className={cn("truncate text-sm font-semibold leading-tight", active || unread ? "text-white" : "text-[#b0b3be]")}>
              {thread.contact.firstName} {thread.contact.lastName}
            </span>
            {preview?.createdAt && (
              <span className="shrink-0 text-[10px] text-[#3e4148]">
                {formatTime(preview.createdAt)}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            {badge && (
              <span className={cn("shrink-0 rounded px-1 py-0.5 text-[9px] font-bold border", badge.className)}>
                {badge.label}
              </span>
            )}
            <span className="truncate text-xs text-[#4a4d56]">
              {preview ? preview.message : contactSubtitle(thread)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const queryClient = useQueryClient();
  const me          = useAuthStore((s) => s.user);

  const [threadId, setThreadId]         = useState<string | null>(null);
  const [draft, setDraft]               = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [showAssign, setShowAssign]     = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: threads = [], isLoading } = useQuery({
    queryKey: qk.inboxThreads,
    queryFn: async () => {
      const { data } = await api.get<InboxThread[]>("/inbox/threads");
      return data;
    },
  });

  const { data: messages = [], isFetching: messagesFetching } = useQuery({
    queryKey: qk.inboxMessages(threadId ?? ""),
    enabled: !!threadId,
    queryFn: async () => {
      const { data } = await api.get<InboxMessage[]>(`/inbox/threads/${threadId}/messages`);
      return data;
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, threadId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!threadId) return;
      await api.post("/inbox/send", { threadId, message: draft });
    },
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: qk.inboxMessages(threadId ?? "") });
      void queryClient.invalidateQueries({ queryKey: qk.inboxThreads });
    },
    onError: (e) => toast.error("Could not send", getApiErrorMessage(e)),
  });

  const patchMutation = useMutation({
    mutationFn: async (body: {
      status?: "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
      assignedToId?: string | null;
    }) => {
      if (!threadId) return;
      await api.patch(`/inbox/threads/${threadId}`, body);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.inboxThreads }),
    onError: (e) => toast.error("Could not update thread", getApiErrorMessage(e)),
  });

  const active       = threads.find((t) => t.id === threadId);
  const channelBadge = active ? CHANNEL_BADGE[active.channel] : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

      {/* Thread list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-[#1a1f2a] bg-[#0b0e14]">
        <div className="border-b border-[#1a1f2a] px-4 py-4">
          <h2 className="text-sm font-semibold text-white">Conversations</h2>
          {!isLoading && (
            <p className="mt-0.5 text-xs text-[#3e4148]">
              {threads.length} thread{threads.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-0.5 p-2">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-[60px] w-full rounded-xl bg-[#161a21]" />
                ))
              : threads.length === 0
              ? (
                <EmptyState
                  className="mx-1 my-6 border-none bg-transparent"
                  icon={Inbox}
                  title="No conversations yet"
                  description="Messages from WhatsApp, Messenger, and Telegram will appear here."
                />
              )
              : threads.map((t) => (
                  <ThreadItem
                    key={t.id}
                    thread={t}
                    active={t.id === threadId}
                    onClick={() => setThreadId(t.id)}
                  />
                ))}
          </div>
        </ScrollArea>
      </div>

      {/* Message panel */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#0d1018]">
        {!threadId ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={Inbox}
              title="Select a conversation"
              description="Choose a thread on the left to read and reply."
            />
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="border-b border-[#1a1f2a] bg-[#0b0e14] px-5 py-3.5">
              {active && (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1e2330] text-sm font-bold text-[#6366F1] ring-1 ring-[#2d3141]">
                      {active.contact.firstName?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {active.contact.firstName} {active.contact.lastName}
                        </span>
                        {channelBadge && (
                          <Badge
                            variant="outline"
                            className={cn("border px-1.5 py-0.5 text-[9px] font-bold", channelBadge.className)}
                          >
                            {active.channel === "MESSENGER"
                              ? active.fbPage ? `Messenger · ${active.fbPage.name}` : "Messenger"
                              : active.channel === "TELEGRAM"
                              ? "Telegram"
                              : active.contact.phone.startsWith("fb:") ? "Messenger" : active.contact.phone}
                          </Badge>
                        )}
                      </div>
                      {active.assignedTo ? (
                        <p className="mt-0.5 text-xs text-[#4a4d56]">
                          Assigned to{" "}
                          <span className="text-[#818cf8]">
                            {active.assignedTo.name ?? active.assignedTo.email}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-[#3e4148]">Unassigned</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {active.channel === "MESSENGER" && (
                      <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-400/80">
                        <AlertCircle className="size-3 shrink-0" />
                        24h window
                      </div>
                    )}
                    <Select
                      value={active.status}
                      onValueChange={(v) => {
                        if (v === "OPEN" || v === "PENDING" || v === "RESOLVED" || v === "CLOSED")
                          patchMutation.mutate({ status: v });
                      }}
                    >
                      <SelectTrigger className="h-8 w-[116px] rounded-lg border-[#1e2330] bg-[#161a21] text-xs text-[#9b9da6] focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-[#262B33]/40 bg-[#161a21]">
                        <SelectItem value="OPEN">Open</SelectItem>
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="RESOLVED">Resolved</SelectItem>
                        <SelectItem value="CLOSED">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button" variant="outline" size="sm"
                      className="h-8 rounded-lg border-[#1e2330] bg-[#161a21] px-3 text-xs text-[#9b9da6] hover:bg-[#1e2330] hover:text-white"
                      onClick={() => me && patchMutation.mutate({ assignedToId: me.id })}
                      disabled={!me || patchMutation.isPending}
                    >
                      {patchMutation.isPending
                        ? <Loader2 className="mr-1 size-3 animate-spin" />
                        : <UserCircle className="mr-1 size-3" />}
                      Assign me
                    </Button>
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="h-8 rounded-lg px-2.5 text-xs text-[#4a4d56] hover:bg-[#161a21] hover:text-[#9b9da6]"
                      onClick={() => patchMutation.mutate({ assignedToId: null })}
                      disabled={patchMutation.isPending}
                    >
                      <UserMinus className="size-3.5" />
                    </Button>
                    <button
                      type="button"
                      onClick={() => setShowAssign((v) => !v)}
                      className="text-[11px] text-[#3e4148] transition-colors hover:text-[#5a5d68]"
                    >
                      {showAssign ? "hide" : "···"}
                    </button>
                  </div>
                </div>
              )}

              {showAssign && (
                <div className="mt-3 flex items-center gap-2 border-t border-[#1a1f2a] pt-3">
                  <Input
                    className="h-8 flex-1 rounded-lg border-[#1e2330] bg-[#161a21] text-xs text-white placeholder:text-[#3e4148] focus-visible:ring-[#6366F1]/30"
                    placeholder="Assign to user UUID…"
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                  />
                  <Button
                    type="button" size="sm"
                    className="h-8 rounded-lg px-4 text-xs"
                    onClick={() => {
                      if (!assignUserId.trim()) { toast.info("Enter a user ID first."); return; }
                      patchMutation.mutate({ assignedToId: assignUserId.trim() });
                      setAssignUserId("");
                    }}
                    disabled={patchMutation.isPending}
                  >
                    Apply
                  </Button>
                </div>
              )}
            </div>

            {/* Messages */}
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2.5 px-5 py-5">
                {messagesFetching && messages.length === 0 ? (
                  <div className="space-y-3">
                    <Skeleton className="ml-auto h-14 w-[65%] rounded-2xl bg-[#161a21]" />
                    <Skeleton className="h-10 w-[55%] rounded-2xl bg-[#161a21]" />
                    <Skeleton className="ml-auto h-12 w-[48%] rounded-2xl bg-[#161a21]" />
                  </div>
                ) : messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm",
                      m.direction === "OUTBOUND"
                        ? "ml-auto bg-[#6366F1] text-white shadow-[0_2px_12px_-2px_rgba(99,102,241,0.4)]"
                        : "bg-[#161a21] text-[#d1d3db] ring-1 ring-[#1e2330]",
                    )}
                  >
                    <div className={cn("mb-1 text-[10px] font-medium",
                      m.direction === "OUTBOUND" ? "text-[#a5b4fc]" : "text-[#4a4d56]")}>
                      {m.direction === "OUTBOUND" ? "You" : (active?.contact.firstName ?? "Customer")}
                      {" · "}
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed">{m.message}</div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Compose */}
            <div className="border-t border-[#1a1f2a] bg-[#0b0e14] px-5 py-4">
              <div className="overflow-hidden rounded-xl border border-[#1e2330] bg-[#0f1219] transition-all focus-within:border-[#2d3248] focus-within:ring-1 focus-within:ring-[#6366F1]/20">
                <Textarea
                  rows={3}
                  className="min-h-[80px] resize-none rounded-none border-none bg-transparent px-4 pt-3 text-sm text-white placeholder:text-[#3e4148] focus-visible:ring-0"
                  placeholder="Write a reply…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim())
                      sendMutation.mutate();
                  }}
                />
                <div className="flex items-center justify-between border-t border-[#1a1f2a] px-3 py-2">
                  <span className="text-[10px] text-[#3e4148]">
                    {draft.length > 0 ? `${draft.length} chars · ` : ""}⌘↵ to send
                  </span>
                  <Button
                    size="sm"
                    className="h-8 rounded-lg px-4 text-xs font-semibold stitch-gradient shadow-[0_2px_10px_-2px_rgba(99,102,241,0.4)] transition-opacity hover:opacity-90 disabled:opacity-40"
                    onClick={() => sendMutation.mutate()}
                    disabled={sendMutation.isPending || !draft.trim()}
                  >
                    {sendMutation.isPending
                      ? <Loader2 className="mr-1.5 size-3 animate-spin" />
                      : <Send className="mr-1.5 size-3" />}
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
