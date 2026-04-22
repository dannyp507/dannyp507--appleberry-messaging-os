"use client";

import { Button } from "@/components/ui/button";
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
import type { LucideIcon } from "lucide-react";
import { AppleberryIcon } from "@/components/ui/appleberry-icon";
import {
  AlertCircle,
  Camera,
  CheckCheck,
  Loader2,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Phone,
  Search,
  Send,
  Share2,
  Smartphone,
  Smile,
  UserCircle,
  UserMinus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterKey = "all" | "unread" | "whatsapp" | "facebook" | "telegram";

interface MessageGroup {
  direction: "INBOUND" | "OUTBOUND";
  messages: InboxMessage[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterKey; label: string; dot?: string }[] = [
  { key: "all",      label: "All"      },
  { key: "unread",   label: "Unread"   },
  { key: "whatsapp", label: "WhatsApp", dot: "bg-emerald-400" },
  { key: "facebook", label: "Facebook", dot: "bg-blue-400"   },
  { key: "telegram", label: "Telegram", dot: "bg-sky-400"    },
];

const CHANNEL_BADGE: Record<string, { label: string; className: string }> = {
  WHATSAPP:  { label: "WA", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  MESSENGER: { label: "FB", className: "bg-blue-50 text-blue-700 border-blue-200"         },
  TELEGRAM:  { label: "TG", className: "bg-sky-50 text-sky-700 border-sky-200"            },
  INSTAGRAM: { label: "IG", className: "bg-pink-50 text-pink-700 border-pink-200"         },
};

const CHANNEL_META: Record<string, { icon: LucideIcon; label: string; color: string; accent: string }> = {
  WHATSAPP:  { icon: Smartphone, label: "WhatsApp",  color: "text-emerald-500", accent: "bg-emerald-500" },
  MESSENGER: { icon: Share2,     label: "Messenger", color: "text-blue-500",    accent: "bg-blue-500"    },
  TELEGRAM:  { icon: Send,       label: "Telegram",  color: "text-sky-500",     accent: "bg-sky-500"     },
  INSTAGRAM: { icon: Camera,     label: "Instagram", color: "text-pink-500",    accent: "bg-pink-500"    },
};

const STATUS_META: Record<string, { label: string; dotClass: string; textClass: string }> = {
  OPEN:     { label: "Open",     dotClass: "bg-emerald-400", textClass: "text-emerald-600" },
  PENDING:  { label: "Pending",  dotClass: "bg-amber-400",   textClass: "text-amber-600"   },
  RESOLVED: { label: "Resolved", dotClass: "bg-blue-400",    textClass: "text-blue-600"    },
  CLOSED:   { label: "Closed",   dotClass: "bg-[#D1D5DB]",   textClass: "text-[#9CA3AF]"   },
};

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

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)  return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)  return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
         da.getMonth() === db.getMonth() &&
         da.getDate() === db.getDate();
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || "?";
}

function groupMessages(messages: InboxMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.direction === msg.direction) {
      last.messages.push(msg);
    } else {
      groups.push({ direction: msg.direction, messages: [msg] });
    }
  }
  return groups;
}

// ─── ThreadItem ───────────────────────────────────────────────────────────────

function ThreadItem({
  thread,
  active,
  onClick,
}: {
  thread: InboxThread;
  active: boolean;
  onClick: () => void;
}) {
  const unread   = threadHasUnread(thread);
  const preview  = thread.messages?.[0];
  const initials = getInitials(thread.contact.firstName, thread.contact.lastName);
  const subtitle = contactSubtitle(thread);
  const meta     = CHANNEL_META[thread.channel];
  const status   = STATUS_META[thread.status] ?? STATUS_META.OPEN;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full rounded-xl px-3 py-3 text-left transition-all duration-150",
        active
          ? "bg-[#EEF2FF] ring-1 ring-[#C7D2FE]"
          : unread
          ? "bg-indigo-50/40 ring-1 ring-indigo-100/80 hover:bg-[#F9FAFB]"
          : "hover:bg-[#F9FAFB]",
      )}
    >
      {/* Active left indicator */}
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[#6366F1] to-[#EC4899]" />
      )}

      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div className="relative mt-0.5 shrink-0">
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-full text-[11px] font-bold tracking-wide",
              active
                ? "bg-[#EEF2FF] text-[#4338CA] ring-1 ring-[#C7D2FE]"
                : unread
                ? "bg-indigo-100/80 text-[#4338CA] ring-1 ring-indigo-200/60"
                : "bg-[#F3F4F6] text-[#9CA3AF] ring-1 ring-[#E5E7EB]",
            )}
          >
            {initials}
          </div>
          {/* Channel icon badge */}
          {meta && (
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-white ring-1 ring-[#E5E7EB]",
              )}
            >
              <meta.icon className={cn("size-2", meta.color)} strokeWidth={2.5} />
            </span>
          )}
          {unread && !active && (
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#6366F1] ring-1 ring-white" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-1">
            <span
              className={cn(
                "truncate text-[13px] font-semibold leading-tight",
                active || unread ? "text-[#111827]" : "text-[#374151]",
              )}
            >
              {thread.contact.firstName} {thread.contact.lastName}
            </span>
            {preview?.createdAt && (
              <span className="shrink-0 text-[10px] text-[#9CA3AF]">
                {formatTime(preview.createdAt)}
              </span>
            )}
          </div>

          <p
            className={cn(
              "mt-0.5 truncate text-xs leading-relaxed",
              active  ? "text-[#6B7280]"  :
              unread  ? "text-[#6B7280]"  : "text-[#9CA3AF]",
            )}
          >
            {preview?.direction === "OUTBOUND" && (
              <span className="text-[#9CA3AF]">You: </span>
            )}
            {preview?.message ?? subtitle}
          </p>

          <div className="mt-1.5 flex items-center gap-1.5">
            <span className={cn("size-1.5 shrink-0 rounded-full", status.dotClass)} />
            <span className={cn("text-[10px] font-medium", status.textClass)}>
              {status.label}
            </span>
            {thread.assignedTo && (
              <>
                <span className="text-[10px] text-[#D1D5DB]">·</span>
                <span className="truncate text-[10px] text-[#9CA3AF]">
                  {thread.assignedTo.name ?? thread.assignedTo.email}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── DateSeparator ────────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-[#E5E7EB]" />
      <span className="shrink-0 rounded-full border border-[#E5E7EB] bg-white px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9CA3AF]">
        {label}
      </span>
      <div className="h-px flex-1 bg-[#E5E7EB]" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const queryClient = useQueryClient();
  const me          = useAuthStore((s) => s.user);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [threadId, setThreadId]         = useState<string | null>(null);
  const [draft, setDraft]               = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [showAssign, setShowAssign]     = useState(false);
  const [search, setSearch]             = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Data ────────────────────────────────────────────────────────────────────
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

  // Auto-select first conversation
  useEffect(() => {
    if (!threadId && threads.length > 0) {
      setThreadId(threads[0].id);
    }
  }, [threads, threadId]);

  // Scroll to bottom when messages load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, threadId]);

  // ── Mutations (unchanged) ───────────────────────────────────────────────────
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

  // ── Derived state ───────────────────────────────────────────────────────────
  const active       = threads.find((t) => t.id === threadId);
  const channelBadge = active ? CHANNEL_BADGE[active.channel] : null;
  const channelMeta  = active ? CHANNEL_META[active.channel]  : null;
  const statusMeta   = active ? (STATUS_META[active.status] ?? STATUS_META.OPEN) : null;

  const filteredThreads = useMemo(() => {
    let result = threads;
    if (activeFilter === "unread")   result = result.filter(threadHasUnread);
    if (activeFilter === "whatsapp") result = result.filter((t) => t.channel === "WHATSAPP");
    if (activeFilter === "facebook") result = result.filter((t) => t.channel === "MESSENGER");
    if (activeFilter === "telegram") result = result.filter((t) => t.channel === "TELEGRAM");
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (t) =>
          `${t.contact.firstName} ${t.contact.lastName}`.toLowerCase().includes(q) ||
          (t.messages?.[0]?.message ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [threads, activeFilter, search]);

  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  const unreadCount = useMemo(() => threads.filter(threadHasUnread).length, [threads]);

  const contactInitials = active
    ? getInitials(active.contact.firstName, active.contact.lastName)
    : "?";

  const isMessenger = active?.channel === "MESSENGER";

  // ── Build message groups with date separators ───────────────────────────────
  type TimelineEntry =
    | { type: "separator"; label: string; key: string }
    | { type: "group"; group: MessageGroup; index: number };

  const timeline = useMemo((): TimelineEntry[] => {
    const entries: TimelineEntry[] = [];
    let lastDate: string | null = null;
    messageGroups.forEach((group, i) => {
      const firstMsg = group.messages[0];
      const msgDate  = firstMsg.createdAt;
      if (!lastDate || !sameDay(lastDate, msgDate)) {
        entries.push({ type: "separator", label: formatDateSeparator(msgDate), key: `sep-${msgDate}` });
        lastDate = msgDate;
      }
      entries.push({ type: "group", group, index: i });
    });
    return entries;
  }, [messageGroups]);

  // ── Empty filter label ──────────────────────────────────────────────────────
  const emptyLabel: Record<FilterKey, string> = {
    all:      "No conversations yet",
    unread:   "No unread conversations",
    whatsapp: "No WhatsApp conversations",
    facebook: "No Messenger conversations",
    telegram: "No Telegram conversations",
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* ════════════════════════════════════════════════════════════════════
          LEFT PANEL — conversation list
      ════════════════════════════════════════════════════════════════════ */}
      <div className="flex w-[17rem] shrink-0 flex-col border-r border-[#E5E7EB] bg-white">

        {/* Header */}
        <div className="border-b border-[#F3F4F6] px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-bold tracking-tight text-[#111827]">Inbox</h2>
              {unreadCount > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#6366F1] px-1.5 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#9CA3AF]" />
            <Input
              className="h-8 rounded-lg border-[#E5E7EB] bg-[#F9FAFB] pl-8 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus-visible:ring-[#6366F1]/20"
              placeholder="Search conversations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filter pills */}
          <div className="mt-2.5 flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {FILTER_TABS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setActiveFilter(f.key)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all",
                  activeFilter === f.key
                    ? "bg-[#EEF2FF] text-[#4338CA]"
                    : "text-[#9CA3AF] hover:text-[#6B7280]",
                )}
              >
                {f.dot && <span className={cn("size-1.5 rounded-full", f.dot)} />}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Thread list */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-0.5 p-2">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl px-3 py-3">
                    <Skeleton className="size-9 shrink-0 rounded-full bg-[#F3F4F6]" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-2/3 rounded bg-[#F3F4F6]" />
                      <Skeleton className="h-2.5 w-full rounded bg-[#F3F4F6]" />
                      <Skeleton className="h-2 w-1/3 rounded bg-[#F3F4F6]" />
                    </div>
                  </div>
                ))
              : filteredThreads.length === 0
              ? (
                  <div className="flex flex-col items-center gap-4 px-2 py-10 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-[#F9FAFB] border border-[#E5E7EB]">
                      <AppleberryIcon size={30} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#9CA3AF]">{emptyLabel[activeFilter]}</p>
                      <p className="mt-1 text-xs text-[#D1D5DB]">
                        {activeFilter === "all"
                          ? "Messages from all channels will appear here."
                          : "Try a different filter."}
                      </p>
                    </div>
                  </div>
                )
              : filteredThreads.map((t) => (
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

      {/* ════════════════════════════════════════════════════════════════════
          CENTER PANEL — conversation view
      ════════════════════════════════════════════════════════════════════ */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#F7F8FA]">
        {!threadId ? (

          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <div className="flex size-20 items-center justify-center rounded-3xl bg-white border border-[#E5E7EB] shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
              <AppleberryIcon size={44} />
            </div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-[#9CA3AF]">Select a conversation</h3>
              <p className="mt-1 text-sm text-[#D1D5DB]">
                Pick a thread on the left to read and reply.
              </p>
            </div>
          </div>

        ) : (
          <>
            {/* ── Thread header ────────────────────────────────────────────── */}
            <div className="border-b border-[#E5E7EB] bg-white px-5 py-3">
              {active && (
                <div className="flex flex-wrap items-center justify-between gap-3">

                  {/* Contact info */}
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="flex size-9 items-center justify-center rounded-full bg-[#EEF2FF] text-sm font-bold text-[#4338CA] ring-1 ring-[#C7D2FE]">
                        {contactInitials}
                      </div>
                      {channelMeta && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-white ring-1 ring-[#E5E7EB]">
                          <channelMeta.icon className={cn("size-2", channelMeta.color)} strokeWidth={2.5} />
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-[#111827]">
                        {active.contact.firstName} {active.contact.lastName}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {channelBadge && (
                          <span className={cn(
                            "rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide",
                            channelBadge.className,
                          )}>
                            {channelMeta?.label ?? channelBadge.label}
                            {active.channel === "MESSENGER" && active.fbPage
                              ? ` · ${active.fbPage.name}` : ""}
                            {active.channel === "WHATSAPP" && active.contact.phone
                              ? ` · ${active.contact.phone}` : ""}
                          </span>
                        )}
                        {statusMeta && (
                          <span className="flex items-center gap-1 text-[10px]">
                            <span className={cn("size-1.5 rounded-full", statusMeta.dotClass)} />
                            <span className={statusMeta.textClass}>{statusMeta.label}</span>
                          </span>
                        )}
                        {active.assignedTo ? (
                          <span className="text-[11px] text-[#9CA3AF]">
                            · <span className="text-[#6366F1]">{active.assignedTo.name ?? active.assignedTo.email}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#D1D5DB]">· Unassigned</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Select
                      value={active.status}
                      onValueChange={(v) => {
                        if (v === "OPEN" || v === "PENDING" || v === "RESOLVED" || v === "CLOSED")
                          patchMutation.mutate({ status: v });
                      }}
                    >
                      <SelectTrigger className="h-8 w-[108px] rounded-lg border-[#E5E7EB] bg-[#F9FAFB] text-[11px] text-[#6B7280] focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-[#E5E7EB] bg-white shadow-lg">
                        {Object.entries(STATUS_META).map(([key, s]) => (
                          <SelectItem key={key} value={key}>
                            <span className="flex items-center gap-2">
                              <span className={cn("size-1.5 rounded-full", s.dotClass)} />
                              {s.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg border-[#E5E7EB] bg-[#F9FAFB] px-3 text-[11px] text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]"
                      onClick={() => me && patchMutation.mutate({ assignedToId: me.id })}
                      disabled={!me || patchMutation.isPending}
                    >
                      {patchMutation.isPending
                        ? <Loader2 className="mr-1 size-3 animate-spin" />
                        : <UserCircle className="mr-1 size-3" />}
                      Assign me
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 rounded-lg p-0 text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6B7280]"
                      onClick={() => patchMutation.mutate({ assignedToId: null })}
                      disabled={patchMutation.isPending}
                      title="Unassign"
                    >
                      <UserMinus className="size-3.5" />
                    </Button>

                    <div className="h-4 w-px bg-[#E5E7EB]" />

                    <button
                      type="button"
                      onClick={() => setShowAssign((v) => !v)}
                      className="text-[10px] text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
                      title="Assign to user by ID"
                    >
                      {showAssign ? "hide" : "···"}
                    </button>

                    {/* Toggle info panel */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-8 w-8 rounded-lg p-0 transition-colors",
                        showInfoPanel
                          ? "bg-[#EEF2FF] text-[#4338CA]"
                          : "text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6B7280]",
                      )}
                      onClick={() => setShowInfoPanel((v) => !v)}
                      title="Contact details"
                    >
                      {showInfoPanel
                        ? <PanelRightClose className="size-3.5" />
                        : <PanelRightOpen className="size-3.5" />}
                    </Button>
                  </div>
                </div>
              )}

              {/* UUID assign (advanced) */}
              {showAssign && (
                <div className="mt-3 flex items-center gap-2 border-t border-[#F3F4F6] pt-3">
                  <Input
                    className="h-8 flex-1 rounded-lg border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827] placeholder:text-[#9CA3AF] focus-visible:ring-[#6366F1]/20"
                    placeholder="Assign to user UUID…"
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
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

            {/* ── Main area: messages + optional info panel ─────────────── */}
            <div className="flex min-h-0 flex-1 overflow-hidden">

              {/* Messages column */}
              <div className="flex min-w-0 flex-1 flex-col">

                {/* ── Messages ─────────────────────────────────────────── */}
                <ScrollArea className="min-h-0 flex-1">
                  <div className="flex flex-col px-6 py-5">
                    {messagesFetching && messages.length === 0 ? (
                      <div className="space-y-4 pt-2">
                        <Skeleton className="ml-auto h-14 w-[58%] rounded-2xl bg-[#F3F4F6]" />
                        <Skeleton className="h-10 w-[45%] rounded-2xl bg-[#F3F4F6]" />
                        <Skeleton className="ml-auto h-12 w-[50%] rounded-2xl bg-[#F3F4F6]" />
                        <Skeleton className="h-8 w-[35%] rounded-2xl bg-[#F3F4F6]" />
                      </div>
                    ) : timeline.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center py-16">
                        <p className="text-xs text-[#D1D5DB]">No messages yet — say hello!</p>
                      </div>
                    ) : (
                      timeline.map((entry) => {
                        if (entry.type === "separator") {
                          return <DateSeparator key={entry.key} label={entry.label} />;
                        }

                        const { group, index: gi } = entry;
                        const isOut    = group.direction === "OUTBOUND";
                        const count    = group.messages.length;
                        const lastMsg  = group.messages[count - 1];

                        return (
                          <div
                            key={gi}
                            className={cn("mb-4 flex items-end gap-2.5", isOut ? "flex-row-reverse" : "flex-row")}
                          >
                            {/* Inbound avatar */}
                            {!isOut && (
                              <div className="mb-5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[10px] font-bold text-[#4338CA] ring-1 ring-[#C7D2FE]">
                                {contactInitials}
                              </div>
                            )}

                            <div className={cn("flex max-w-[68%] flex-col gap-0.5", isOut ? "items-end" : "items-start")}>
                              {/* Sender label */}
                              <span className="mb-0.5 px-1 text-[10px] font-medium text-[#9CA3AF]">
                                {isOut ? "You" : `${active?.contact.firstName ?? "Customer"}`}
                              </span>

                              {/* Bubble stack */}
                              {group.messages.map((m, mi) => {
                                const isFirst = mi === 0;
                                const isLast  = mi === count - 1;
                                return (
                                  <div
                                    key={m.id}
                                    className={cn(
                                      "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                                      isOut
                                        ? "bg-[#EEF2FF] text-[#3730A3]"
                                        : "bg-white text-[#111827] border border-[#E5E7EB] shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                                      count > 1 && isFirst && !isLast && (isOut ? "rounded-br-[6px]" : "rounded-bl-[6px]"),
                                      count > 1 && !isFirst && !isLast && (isOut ? "rounded-r-[6px]"  : "rounded-l-[6px]"),
                                      count > 1 && !isFirst && isLast  && (isOut ? "rounded-tr-[6px]" : "rounded-tl-[6px]"),
                                    )}
                                  >
                                    <div className="whitespace-pre-wrap">{m.message}</div>
                                  </div>
                                );
                              })}

                              {/* Timestamp + delivery status */}
                              <div className={cn("flex items-center gap-1 px-1", isOut ? "flex-row-reverse" : "flex-row")}>
                                <span className="text-[10px] text-[#9CA3AF]">
                                  {new Date(lastMsg.createdAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                {isOut && (
                                  <CheckCheck className="size-3 text-[#9CA3AF]" />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* ── Messenger 24h warning ────────────────────────────── */}
                {isMessenger && (
                  <div className="flex items-center gap-2.5 border-t border-amber-100 bg-amber-50 px-5 py-2.5">
                    <AlertCircle className="size-3.5 shrink-0 text-amber-500" />
                    <p className="text-xs text-amber-700">
                      <span className="font-semibold">24-hour window</span>
                      {" "}— You can only reply within 24 hours of the customer&apos;s last message on Messenger.
                    </p>
                  </div>
                )}

                {/* ── Composer ─────────────────────────────────────────── */}
                <div className="border-t border-[#E5E7EB] bg-white px-5 py-4">
                  <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white transition-all focus-within:border-[#C7D2FE] focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]">
                    <Textarea
                      rows={3}
                      className="min-h-[72px] resize-none rounded-none border-none bg-transparent px-4 pt-3 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus-visible:ring-0"
                      placeholder="Write a reply… (⌘↵ to send)"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim())
                          sendMutation.mutate();
                      }}
                    />
                    <div className="flex items-center justify-between border-t border-[#F3F4F6] px-3 py-2">
                      {/* Left: icon actions */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
                          title="Emoji (coming soon)"
                        >
                          <Smile className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
                          title="Attach file (coming soon)"
                        >
                          <Paperclip className="size-4" />
                        </button>
                        <div className="h-3 w-px bg-[#E5E7EB]" />
                        {draft.length > 0 ? (
                          <span className="text-[10px] text-[#9CA3AF]">
                            {draft.length} chars
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#D1D5DB]">⌘↵ to send</span>
                        )}
                      </div>

                      {/* Right: send button */}
                      <Button
                        size="sm"
                        className="h-8 rounded-lg px-4 text-xs font-semibold stitch-gradient text-white shadow-[0_1px_4px_rgba(99,102,241,0.3)] transition-opacity hover:opacity-90 disabled:opacity-40"
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
              </div>

              {/* ── Right info panel ──────────────────────────────────────── */}
              {showInfoPanel && active && (
                <div className="flex w-60 shrink-0 flex-col overflow-y-auto border-l border-[#E5E7EB] bg-white/90 backdrop-blur-sm">

                  {/* Contact card */}
                  <div className="border-b border-[#F3F4F6] px-4 pb-5 pt-4">
                    <div className="flex flex-col items-center text-center">
                      <div className="flex size-14 items-center justify-center rounded-2xl bg-[#EEF2FF] text-lg font-bold text-[#4338CA] ring-1 ring-[#C7D2FE]">
                        {contactInitials}
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-[#111827]">
                        {active.contact.firstName} {active.contact.lastName}
                      </h3>
                      {active.contact.phone && !active.contact.phone.startsWith("fb:") && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-[#9CA3AF]">
                          <Phone className="size-3" />
                          {active.contact.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Channel info */}
                  <div className="border-b border-[#F3F4F6] px-4 py-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9CA3AF]">
                      Channel
                    </p>
                    <div className="flex items-center gap-2">
                      {channelMeta && (
                        <channelMeta.icon className={cn("size-3.5", channelMeta.color)} strokeWidth={1.75} />
                      )}
                      <span className="text-xs font-medium text-[#374151]">
                        {channelMeta?.label ?? active.channel}
                      </span>
                      {active.channel === "MESSENGER" && active.fbPage && (
                        <span className="text-xs text-[#9CA3AF]">· {active.fbPage.name}</span>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="border-b border-[#F3F4F6] px-4 py-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9CA3AF]">
                      Status
                    </p>
                    {statusMeta && (
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", statusMeta.dotClass)} />
                        <span className={cn("text-xs font-semibold", statusMeta.textClass)}>
                          {statusMeta.label}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Assignee */}
                  <div className="px-4 py-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9CA3AF]">
                      Assigned to
                    </p>
                    {active.assignedTo ? (
                      <div className="flex items-center gap-2">
                        <div className="flex size-6 items-center justify-center rounded-full bg-[#EEF2FF] text-[9px] font-bold text-[#4338CA]">
                          {(active.assignedTo.name ?? active.assignedTo.email ?? "?")[0].toUpperCase()}
                        </div>
                        <span className="text-xs text-[#374151]">
                          {active.assignedTo.name ?? active.assignedTo.email}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-[#9CA3AF]">Unassigned</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
