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
  WHATSAPP:  { label: "WA", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
  MESSENGER: { label: "FB", className: "bg-blue-500/15   text-blue-400   border-blue-500/25"     },
  TELEGRAM:  { label: "TG", className: "bg-sky-500/15    text-sky-400    border-sky-500/25"       },
  INSTAGRAM: { label: "IG", className: "bg-pink-500/15   text-pink-400   border-pink-500/25"      },
};

const CHANNEL_META: Record<string, { icon: LucideIcon; label: string; color: string; accent: string }> = {
  WHATSAPP:  { icon: Smartphone, label: "WhatsApp",  color: "text-emerald-400", accent: "bg-emerald-500" },
  MESSENGER: { icon: Share2,     label: "Messenger", color: "text-blue-400",    accent: "bg-blue-500"    },
  TELEGRAM:  { icon: Send,       label: "Telegram",  color: "text-sky-400",     accent: "bg-sky-500"     },
  INSTAGRAM: { icon: Camera,     label: "Instagram", color: "text-pink-400",    accent: "bg-pink-500"    },
};

const STATUS_META: Record<string, { label: string; dotClass: string; textClass: string }> = {
  OPEN:     { label: "Open",     dotClass: "bg-emerald-400", textClass: "text-emerald-400" },
  PENDING:  { label: "Pending",  dotClass: "bg-amber-400",   textClass: "text-amber-400"   },
  RESOLVED: { label: "Resolved", dotClass: "bg-blue-400",    textClass: "text-blue-400"    },
  CLOSED:   { label: "Closed",   dotClass: "bg-[#3e4148]",   textClass: "text-[#5a5d68]"   },
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
          ? "bg-gradient-to-r from-[#1e2330] to-[#1a1f2d] ring-1 ring-[#2d3248]/80"
          : unread
          ? "bg-[#6366F1]/[0.06] ring-1 ring-[#6366F1]/10 hover:bg-[#161a21]"
          : "hover:bg-[#161a21]",
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
                ? "bg-gradient-to-br from-[#6366F1]/30 to-[#EC4899]/20 text-[#818cf8] ring-1 ring-[#6366F1]/40"
                : unread
                ? "bg-[#6366F1]/15 text-[#818cf8] ring-1 ring-[#6366F1]/25"
                : "bg-[#1e2330] text-[#5a5d68] ring-1 ring-[#262B33]",
            )}
          >
            {initials}
          </div>
          {/* Channel indicator badge */}
          {meta && (
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full ring-1 ring-[#0b0e14]",
                thread.channel === "WHATSAPP"  ? "bg-emerald-500/20" :
                thread.channel === "MESSENGER" ? "bg-blue-500/20" :
                thread.channel === "TELEGRAM"  ? "bg-sky-500/20" : "bg-pink-500/20",
              )}
            >
              <meta.icon
                className={cn("size-2", meta.color)}
                strokeWidth={2.5}
              />
            </span>
          )}
          {unread && !active && (
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#6366F1] ring-1.5 ring-[#0b0e14]" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-1">
            <span
              className={cn(
                "truncate text-[13px] font-semibold leading-tight",
                active || unread ? "text-white" : "text-[#9b9da6]",
              )}
            >
              {thread.contact.firstName} {thread.contact.lastName}
            </span>
            {preview?.createdAt && (
              <span className="shrink-0 text-[10px] text-[#3a3d47]">
                {formatTime(preview.createdAt)}
              </span>
            )}
          </div>

          <p
            className={cn(
              "mt-0.5 truncate text-xs leading-relaxed",
              active    ? "text-[#5a5d68]"  :
              unread    ? "text-[#7a7d87]"  : "text-[#44474f]",
            )}
          >
            {preview?.direction === "OUTBOUND" && (
              <span className="text-[#3e4148]">You: </span>
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
                <span className="text-[10px] text-[#2a2d37]">·</span>
                <span className="truncate text-[10px] text-[#3e4148]">
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
      <div className="h-px flex-1 bg-[#1a1f2a]" />
      <span className="shrink-0 rounded-full border border-[#1e2330] bg-[#0f1219] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#3e4148]">
        {label}
      </span>
      <div className="h-px flex-1 bg-[#1a1f2a]" />
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
  // Each entry is either { type: "separator", label } or { type: "group", group, prevDate }
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
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

      {/* ════════════════════════════════════════════════════════════════════
          LEFT PANEL — conversation list
      ════════════════════════════════════════════════════════════════════ */}
      <div className="flex w-[17rem] shrink-0 flex-col border-r border-[#1a1f2a] bg-[#0b0e14]">

        {/* Header */}
        <div className="border-b border-[#1a1f2a] px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-bold tracking-tight text-white">Inbox</h2>
              {unreadCount > 0 && (
                <span className="flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-[#6366F1] px-1.5 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#3a3d47]" />
            <Input
              className="h-8 rounded-lg border-[#1e2330] bg-[#12151c] pl-8 text-xs text-white placeholder:text-[#3a3d47] focus-visible:ring-[#6366F1]/30"
              placeholder="Search by name or message…"
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
                    ? "bg-[#6366F1]/20 text-[#818cf8]"
                    : "text-[#44474f] hover:text-[#7a7d87]",
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
                    <Skeleton className="size-9 shrink-0 rounded-full bg-[#161a21]" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-2/3 rounded bg-[#161a21]" />
                      <Skeleton className="h-2.5 w-full rounded bg-[#161a21]" />
                      <Skeleton className="h-2 w-1/3 rounded bg-[#161a21]" />
                    </div>
                  </div>
                ))
              : filteredThreads.length === 0
              ? (
                  <div className="flex flex-col items-center gap-4 px-2 py-10 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-[#0f1219]">
                      <AppleberryIcon size={32} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#5a5d68]">{emptyLabel[activeFilter]}</p>
                      <p className="mt-1 text-xs text-[#3a3d47]">
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
      <div className="flex min-w-0 flex-1 flex-col bg-[#0d1018]">
        {!threadId ? (

          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            <div className="flex size-20 items-center justify-center rounded-3xl bg-[#0f1219] shadow-[0_0_40px_rgba(99,102,241,0.08)]">
              <AppleberryIcon size={44} />
            </div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-[#5a5d68]">Select a conversation</h3>
              <p className="mt-1 text-sm text-[#3a3d47]">
                Pick a thread on the left to read and reply.
              </p>
            </div>
          </div>

        ) : (
          <>
            {/* ── Thread header ────────────────────────────────────────────── */}
            <div className="border-b border-[#1a1f2a] bg-[#0b0e14] px-5 py-3">
              {active && (
                <div className="flex flex-wrap items-center justify-between gap-3">

                  {/* Contact info */}
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#6366F1]/25 to-[#EC4899]/15 text-sm font-bold text-[#818cf8] ring-1 ring-[#6366F1]/30">
                        {contactInitials}
                      </div>
                      {channelMeta && (
                        <span
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full ring-1 ring-[#0b0e14]",
                            active.channel === "WHATSAPP"  ? "bg-emerald-500/25" :
                            active.channel === "MESSENGER" ? "bg-blue-500/25" :
                            active.channel === "TELEGRAM"  ? "bg-sky-500/25" : "bg-pink-500/25",
                          )}
                        >
                          <channelMeta.icon className={cn("size-2", channelMeta.color)} strokeWidth={2.5} />
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-white">
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
                          <span className="text-[11px] text-[#3e4148]">
                            · <span className="text-[#818cf8]">{active.assignedTo.name ?? active.assignedTo.email}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#2a2d37]">· Unassigned</span>
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
                      <SelectTrigger className="h-7.5 w-[108px] rounded-lg border-[#1e2330] bg-[#12151c] text-[11px] text-[#9b9da6] focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-[#262B33]/40 bg-[#161a21]">
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
                      className="h-7.5 rounded-lg border-[#1e2330] bg-[#12151c] px-3 text-[11px] text-[#9b9da6] hover:bg-[#1e2330] hover:text-white"
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
                      className="h-7.5 w-7.5 rounded-lg p-0 text-[#3e4148] hover:bg-[#161a21] hover:text-[#7a7d87]"
                      onClick={() => patchMutation.mutate({ assignedToId: null })}
                      disabled={patchMutation.isPending}
                      title="Unassign"
                    >
                      <UserMinus className="size-3.5" />
                    </Button>

                    <div className="h-4 w-px bg-[#1a1f2a]" />

                    <button
                      type="button"
                      onClick={() => setShowAssign((v) => !v)}
                      className="text-[10px] text-[#3e4148] transition-colors hover:text-[#5a5d68]"
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
                        "h-7.5 w-7.5 rounded-lg p-0 transition-colors",
                        showInfoPanel
                          ? "bg-[#6366F1]/15 text-[#818cf8]"
                          : "text-[#3e4148] hover:bg-[#161a21] hover:text-[#7a7d87]",
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
                <div className="mt-3 flex items-center gap-2 border-t border-[#1a1f2a] pt-3">
                  <Input
                    className="h-8 flex-1 rounded-lg border-[#1e2330] bg-[#12151c] text-xs text-white placeholder:text-[#3e4148] focus-visible:ring-[#6366F1]/30"
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
                        <Skeleton className="ml-auto h-14 w-[58%] rounded-2xl bg-[#161a21]" />
                        <Skeleton className="h-10 w-[45%] rounded-2xl bg-[#161a21]" />
                        <Skeleton className="ml-auto h-12 w-[50%] rounded-2xl bg-[#161a21]" />
                        <Skeleton className="h-8 w-[35%] rounded-2xl bg-[#161a21]" />
                      </div>
                    ) : timeline.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center py-16">
                        <p className="text-xs text-[#3e4148]">No messages yet — say hello!</p>
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
                            className={cn("mb-3 flex items-end gap-2.5", isOut ? "flex-row-reverse" : "flex-row")}
                          >
                            {/* Inbound avatar */}
                            {!isOut && (
                              <div className="mb-5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1e2330] text-[10px] font-bold text-[#6366F1] ring-1 ring-[#2d3141]">
                                {contactInitials}
                              </div>
                            )}

                            <div className={cn("flex max-w-[70%] flex-col gap-0.5", isOut ? "items-end" : "items-start")}>
                              {/* Sender label */}
                              <span className="mb-0.5 px-1 text-[10px] font-medium text-[#3e4148]">
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
                                        ? "stitch-gradient text-white shadow-[0_2px_14px_-3px_rgba(99,102,241,0.45)]"
                                        : "bg-[#141820] text-[#d1d3db] ring-1 ring-[#1e2330]",
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
                                <span className="text-[10px] text-[#3a3d47]">
                                  {new Date(lastMsg.createdAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                {isOut && (
                                  <CheckCheck className="size-3 text-[#3e4148]" />
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
                  <div className="flex items-center gap-2.5 border-t border-amber-500/10 bg-amber-500/[0.04] px-5 py-2.5">
                    <AlertCircle className="size-3.5 shrink-0 text-amber-500/70" />
                    <p className="text-xs text-amber-500/60">
                      <span className="font-semibold text-amber-400">24-hour window</span>
                      {" "}— You can only reply within 24 hours of the customer&apos;s last message on Messenger.
                    </p>
                  </div>
                )}

                {/* ── Composer ─────────────────────────────────────────── */}
                <div className="border-t border-[#1a1f2a] bg-[#0b0e14] px-5 py-4">
                  <div className="overflow-hidden rounded-xl border border-[#1e2330] bg-[#0f1219] transition-all focus-within:border-[#2d3248] focus-within:shadow-[0_0_0_1px_rgba(99,102,241,0.15)]">
                    <Textarea
                      rows={3}
                      className="min-h-[72px] resize-none rounded-none border-none bg-transparent px-4 pt-3 text-sm text-white placeholder:text-[#3a3d47] focus-visible:ring-0"
                      placeholder="Write a reply… (⌘↵ to send)"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim())
                          sendMutation.mutate();
                      }}
                    />
                    <div className="flex items-center justify-between border-t border-[#1a1f2a] px-3 py-2">
                      {/* Left: icon actions */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="text-[#3a3d47] transition-colors hover:text-[#6b6d74]"
                          title="Emoji (coming soon)"
                        >
                          <Smile className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="text-[#3a3d47] transition-colors hover:text-[#6b6d74]"
                          title="Attach file (coming soon)"
                        >
                          <Paperclip className="size-4" />
                        </button>
                        <div className="h-3 w-px bg-[#1e2330]" />
                        {draft.length > 0 ? (
                          <span className="text-[10px] text-[#3e4148]">
                            {draft.length} chars
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#252830]">⌘↵ to send</span>
                        )}
                      </div>

                      {/* Right: send button */}
                      <Button
                        size="sm"
                        className="h-7.5 rounded-lg px-4 text-xs font-semibold stitch-gradient shadow-[0_2px_12px_-2px_rgba(99,102,241,0.45)] transition-opacity hover:opacity-90 disabled:opacity-40"
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
                <div className="flex w-60 shrink-0 flex-col overflow-y-auto border-l border-[#1a1f2a] bg-[#0b0e14]">

                  {/* Contact card */}
                  <div className="border-b border-[#1a1f2a] px-4 pb-5 pt-4">
                    <div className="flex flex-col items-center text-center">
                      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6366F1]/20 to-[#EC4899]/15 text-lg font-bold text-[#818cf8] ring-1 ring-[#6366F1]/25">
                        {contactInitials}
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-white">
                        {active.contact.firstName} {active.contact.lastName}
                      </h3>
                      {active.contact.phone && !active.contact.phone.startsWith("fb:") && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-[#5a5d68]">
                          <Phone className="size-3" />
                          {active.contact.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Channel info */}
                  <div className="border-b border-[#1a1f2a] px-4 py-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#3e4148]">
                      Channel
                    </p>
                    <div className="flex items-center gap-2">
                      {channelMeta && (
                        <channelMeta.icon className={cn("size-3.5", channelMeta.color)} strokeWidth={1.75} />
                      )}
                      <span className="text-xs font-medium text-[#9b9da6]">
                        {channelMeta?.label ?? active.channel}
                      </span>
                      {active.channel === "MESSENGER" && active.fbPage && (
                        <span className="text-xs text-[#4a4d56]">· {active.fbPage.name}</span>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="border-b border-[#1a1f2a] px-4 py-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#3e4148]">
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
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#3e4148]">
                      Assigned to
                    </p>
                    {active.assignedTo ? (
                      <div className="flex items-center gap-2">
                        <div className="flex size-6 items-center justify-center rounded-full bg-[#6366F1]/15 text-[9px] font-bold text-[#818cf8]">
                          {(active.assignedTo.name ?? active.assignedTo.email ?? "?")[0].toUpperCase()}
                        </div>
                        <span className="text-xs text-[#9b9da6]">
                          {active.assignedTo.name ?? active.assignedTo.email}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-[#3e4148]">Unassigned</span>
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
