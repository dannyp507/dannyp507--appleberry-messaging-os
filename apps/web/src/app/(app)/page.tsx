"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import type {
  Campaign,
  DashboardAnalytics,
  FacebookPage,
  InboxThread,
  TelegramAccount,
  WhatsAppAccount,
} from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Inbox as InboxIcon,
  Megaphone,
  MessageCircle,
  Radio,
  Send,
  Share2,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getInitials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || "?";
}

const CHANNEL_BADGE: Record<string, { label: string; cls: string }> = {
  WHATSAPP:  { label: "WA", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  MESSENGER: { label: "FB", cls: "bg-blue-50 text-blue-700 border-blue-200"         },
  TELEGRAM:  { label: "TG", cls: "bg-sky-50 text-sky-700 border-sky-200"            },
  INSTAGRAM: { label: "IG", cls: "bg-pink-50 text-pink-700 border-pink-200"         },
};

// ─── ActionCard ───────────────────────────────────────────────────────────────

function ActionCard({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  cta,
  href,
}: {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="group flex flex-col gap-5 rounded-2xl border border-[#E5E7EB] bg-white p-6 transition-all duration-200 hover:border-[#D1D5DB] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
      <div className={cn("flex size-11 items-center justify-center rounded-xl", iconBg)}>
        <Icon className={cn("size-5", iconColor)} strokeWidth={1.75} />
      </div>
      <div className="flex-1 space-y-1">
        <h3 className="text-sm font-semibold text-[#111827]">{title}</h3>
        <p className="text-sm leading-relaxed text-[#6B7280]">{description}</p>
      </div>
      <Link href={href}>
        <Button
          variant="outline"
          className="w-full justify-between rounded-xl border-[#E5E7EB] bg-[#F9FAFB] px-4 text-sm font-medium text-[#6B7280] hover:border-[#D1D5DB] hover:bg-[#F3F4F6] hover:text-[#111827]"
        >
          {cta}
          <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Button>
      </Link>
    </div>
  );
}

// ─── ChannelStatusCard ────────────────────────────────────────────────────────

function ChannelStatusCard({
  icon: Icon,
  iconBg,
  iconColor,
  name,
  connected,
  meta,
  href,
}: {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  name: string;
  connected: boolean;
  meta: string;
  href: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-white p-5 transition-all duration-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)]",
        connected
          ? "border-emerald-200 hover:border-emerald-300"
          : "border-[#E5E7EB] hover:border-[#D1D5DB]",
      )}
    >
      <div className="flex items-center justify-between">
        <div className={cn("flex size-9 items-center justify-center rounded-lg", iconBg)}>
          <Icon className={cn("size-4", iconColor)} strokeWidth={1.75} />
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            connected
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF]",
          )}
        >
          {connected ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}
          {connected ? "Connected" : "Not connected"}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-[#111827]">{name}</p>
        <p className="mt-0.5 text-xs text-[#9CA3AF]">{meta}</p>
      </div>
      <Link href={href}>
        <Button
          variant="outline"
          size="sm"
          className="w-full rounded-xl border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#6B7280] hover:border-[#D1D5DB] hover:bg-[#F3F4F6] hover:text-[#111827]"
        >
          {connected ? "Manage" : "Connect"}
          <ArrowRight className="ml-1.5 size-3" />
        </Button>
      </Link>
    </div>
  );
}

// ─── ThreadRow ────────────────────────────────────────────────────────────────

function ThreadRow({ thread }: { thread: InboxThread }) {
  const initials = getInitials(thread.contact.firstName, thread.contact.lastName);
  const latest   = thread.messages?.[0];
  const badge    = CHANNEL_BADGE[thread.channel];
  const unread   = thread.unreadCount > 0 || latest?.direction === "INBOUND";
  const time     = formatRelativeTime(thread.updatedAt);

  return (
    <Link
      href="/inbox"
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[#F9FAFB]"
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className={cn(
          "flex size-8 items-center justify-center rounded-full text-xs font-bold",
          unread ? "bg-[#EEF2FF] text-[#4338CA]" : "bg-[#F3F4F6] text-[#9CA3AF]",
        )}>
          {initials}
        </div>
        {unread && (
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#6366F1] ring-1 ring-white" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            "truncate text-sm font-medium",
            unread ? "text-[#111827]" : "text-[#374151]",
          )}>
            {thread.contact.firstName} {thread.contact.lastName}
          </span>
          <span className="shrink-0 text-[11px] text-[#9CA3AF]">{time}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {badge && (
            <span className={cn("shrink-0 rounded-full border px-1.5 py-px text-[10px] font-semibold", badge.cls)}>
              {badge.label}
            </span>
          )}
          <span className="truncate text-xs text-[#9CA3AF]">
            {latest?.message ?? "No messages yet"}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const user      = useAuthStore((s) => s.user);
  const firstName = user?.name?.split(" ")[0] ?? "there";
  const greeting  = useMemo(() => getGreeting(), []);

  // ── Data fetches ────────────────────────────────────────────────────────────

  const {
    data: dash,
    isLoading: dashLoading,
    isError: dashError,
    error: dashErr,
  } = useQuery({
    queryKey: qk.analyticsDashboard,
    queryFn: async () => {
      const { data } = await api.get<DashboardAnalytics>("/analytics/dashboard");
      return data;
    },
  });

  const {
    data: campaigns = [],
    isLoading: cLoading,
    isError: campError,
    error: campErr,
  } = useQuery({
    queryKey: qk.campaigns,
    queryFn: async () => {
      const { data } = await api.get<Campaign[]>("/campaigns");
      return data;
    },
  });

  const { data: contactsMeta } = useQuery({
    queryKey: qk.contacts({ take: 1, skip: 0 }),
    queryFn: async () => {
      const { data } = await api.get<{ items: unknown[]; total: number }>("/contacts", {
        params: { take: 1, skip: 0 },
      });
      return data;
    },
  });

  const { data: waAccounts = [] } = useQuery({
    queryKey: qk.whatsappAccounts,
    queryFn: async () => {
      const { data } = await api.get<WhatsAppAccount[]>("/whatsapp/accounts");
      return data;
    },
  });

  const { data: tgAccounts = [] } = useQuery({
    queryKey: qk.telegramAccounts,
    queryFn: async () => {
      const { data } = await api.get<TelegramAccount[]>("/telegram/accounts");
      return data;
    },
  });

  const { data: fbPages = [] } = useQuery({
    queryKey: qk.facebookPages,
    queryFn: async () => {
      const { data } = await api.get<FacebookPage[]>("/facebook/pages");
      return data;
    },
  });

  const { data: threads = [] } = useQuery({
    queryKey: qk.inboxThreads,
    queryFn: async () => {
      const { data } = await api.get<InboxThread[]>("/inbox/threads");
      return data;
    },
  });

  useEffect(() => {
    if (dashError) toast.error("Could not load analytics", getApiErrorMessage(dashErr));
  }, [dashError, dashErr]);

  useEffect(() => {
    if (campError) toast.error("Could not load campaigns", getApiErrorMessage(campErr));
  }, [campError, campErr]);

  // ── Derived state ───────────────────────────────────────────────────────────

  const loading = dashLoading || cLoading;

  const deliveryRate = useMemo(() => {
    if (!dash?.totalMessages) return 0;
    return Math.round(((dash.totalMessages - dash.failed) / dash.totalMessages) * 100);
  }, [dash]);

  const quotaPercent = useMemo(() => {
    if (!dash) return 0;
    const { outboundMessagesThisMonth, outboundLimit } = dash.billing;
    if (outboundLimit <= 0) return 0;
    return Math.min(100, Math.round((outboundMessagesThisMonth / outboundLimit) * 100));
  }, [dash]);

  const limitLabel = dash
    ? dash.billing.outboundLimit < 0 ? "∞" : dash.billing.outboundLimit.toLocaleString()
    : "—";

  const waConnected     = waAccounts.some((a) => a.session?.status === "CONNECTED");
  const fbConnected     = fbPages.some((p) => p.isActive);
  const tgConnected     = tgAccounts.some((a) => a.isActive);
  const connectedCount  = [waConnected, fbConnected, tgConnected].filter(Boolean).length;

  const openThreads   = threads.filter((t) => t.status === "OPEN").length;
  const recentThreads = threads.slice(0, 4);

  const lastCampaign = useMemo(
    () => [...campaigns].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0] ?? null,
    [campaigns],
  );

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="page-container space-y-6 animate-pulse">
        <div className="h-16 rounded-2xl bg-[#F3F4F6]" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-44 rounded-2xl bg-[#F3F4F6]" />)}
        </div>
        <div className="h-20 rounded-2xl bg-[#F3F4F6]" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-2xl bg-[#F3F4F6]" />)}
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-container space-y-6">

      {/* ── 1. Hero ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111827]">
            {greeting}, {firstName}.
          </h2>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            {dash ? (
              <>
                <span className="text-[#6B7280]">
                  {dash.billing.outboundMessagesThisMonth.toLocaleString()}
                </span>
                {" messages sent this month"}
                {openThreads > 0 && (
                  <>
                    {" · "}
                    <span className="text-[#6B7280]">{openThreads}</span>
                    {" open conversation"}{openThreads !== 1 ? "s" : ""}
                  </>
                )}
              </>
            ) : (
              "Loading your workspace…"
            )}
          </p>
        </div>

        {connectedCount === 0 && (
          <Link href="/channels">
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 transition-colors hover:bg-amber-100">
              <Circle className="size-3" />
              No channels connected yet
              <ArrowRight className="size-3" />
            </div>
          </Link>
        )}
      </div>

      {/* ── 2. Action cards ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <ActionCard
          icon={InboxIcon}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-500"
          title="Open Inbox"
          description={
            openThreads > 0
              ? `${openThreads} conversation${openThreads !== 1 ? "s" : ""} waiting for a reply`
              : "All caught up — no open conversations"
          }
          cta="Go to Inbox"
          href="/inbox"
        />
        <ActionCard
          icon={Radio}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-500"
          title="Manage Channels"
          description={
            connectedCount > 0
              ? `${connectedCount} of 3 channel${connectedCount !== 1 ? "s" : ""} active and receiving messages`
              : "Connect WhatsApp, Facebook, or Telegram to start receiving messages"
          }
          cta="View Channels"
          href="/channels"
        />
        <ActionCard
          icon={Megaphone}
          iconBg="bg-pink-50"
          iconColor="text-pink-500"
          title="New Campaign"
          description={`Broadcast to your ${(contactsMeta?.total ?? 0).toLocaleString()} contact${contactsMeta?.total !== 1 ? "s" : ""} with a message or sequence`}
          cta="Create Campaign"
          href="/campaigns"
        />
      </div>

      {/* ── 3. Stats strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#E5E7EB] shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:grid-cols-4">
        {[
          {
            value: (dash?.billing.outboundMessagesThisMonth ?? 0).toLocaleString(),
            label: "Sent this month",
            sub:   `of ${limitLabel} limit`,
          },
          {
            value: openThreads.toLocaleString(),
            label: "Open conversations",
            sub:   `${(dash?.inboxThreads ?? 0).toLocaleString()} total threads`,
          },
          {
            value: `${connectedCount} / 3`,
            label: "Active channels",
            sub:   "WhatsApp · Facebook · Telegram",
          },
          {
            value: `${deliveryRate}%`,
            label: "Delivery rate",
            sub:   `${(dash?.failed ?? 0).toLocaleString()} failed messages`,
          },
        ].map(({ value, label, sub }) => (
          <div key={label} className="flex flex-col gap-0.5 bg-white px-6 py-5">
            <span className="text-2xl font-bold text-[#111827]">{value}</span>
            <span className="text-xs font-medium text-[#6B7280]">{label}</span>
            <span className="text-[11px] text-[#9CA3AF]">{sub}</span>
          </div>
        ))}
      </div>

      {/* ── 4. Channel status ────────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#111827]">Channel Status</h3>
          <Link
            href="/channels"
            className="text-xs text-[#9CA3AF] transition-colors hover:text-[#6366F1]"
          >
            Manage all →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ChannelStatusCard
            icon={Smartphone}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-500"
            name="WhatsApp"
            connected={waConnected}
            meta={
              waAccounts.length > 0
                ? `${waAccounts.length} account${waAccounts.length !== 1 ? "s" : ""} · ${
                    waAccounts.filter((a) => a.session?.status === "CONNECTED").length
                  } connected`
                : "No accounts added yet"
            }
            href="/whatsapp-accounts"
          />
          <ChannelStatusCard
            icon={Share2}
            iconBg="bg-blue-50"
            iconColor="text-blue-500"
            name="Facebook Pages"
            connected={fbConnected}
            meta={
              fbPages.length > 0
                ? `${fbPages.length} page${fbPages.length !== 1 ? "s" : ""} · ${
                    fbPages.filter((p) => p.isActive).length
                  } active`
                : "No pages connected yet"
            }
            href="/facebook-pages"
          />
          <ChannelStatusCard
            icon={Send}
            iconBg="bg-sky-50"
            iconColor="text-sky-500"
            name="Telegram"
            connected={tgConnected}
            meta={
              tgAccounts.length > 0
                ? `${tgAccounts.length} bot${tgAccounts.length !== 1 ? "s" : ""} · ${
                    tgAccounts.filter((a) => a.isActive).length
                  } active`
                : "No bots connected yet"
            }
            href="/telegram-accounts"
          />
        </div>
      </div>

      {/* ── 5. Recent activity ───────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Recent conversations — takes 2/3 */}
        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[#F3F4F6] px-5 py-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="size-4 text-[#6366F1]" strokeWidth={1.75} />
              <span className="text-sm font-semibold text-[#111827]">Recent Conversations</span>
            </div>
            <Link
              href="/inbox"
              className="text-xs text-[#9CA3AF] transition-colors hover:text-[#6366F1]"
            >
              View all →
            </Link>
          </div>

          {recentThreads.length > 0 ? (
            <div className="divide-y divide-[#F9FAFB] px-2 py-2">
              {recentThreads.map((t) => (
                <ThreadRow key={t.id} thread={t} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
              <MessageCircle className="size-8 text-[#E5E7EB]" strokeWidth={1.5} />
              <p className="text-sm font-medium text-[#9CA3AF]">No conversations yet</p>
              <p className="text-xs text-[#D1D5DB]">
                Messages from all channels appear here automatically
              </p>
            </div>
          )}
        </div>

        {/* Right column: last campaign + quota */}
        <div className="flex flex-col gap-4">

          {/* Last campaign */}
          <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
            <div className="flex items-center justify-between border-b border-[#F3F4F6] px-5 py-4">
              <div className="flex items-center gap-2">
                <Megaphone className="size-4 text-pink-500" strokeWidth={1.75} />
                <span className="text-sm font-semibold text-[#111827]">Last Campaign</span>
              </div>
              <Link
                href="/campaigns"
                className="text-xs text-[#9CA3AF] transition-colors hover:text-[#6366F1]"
              >
                All →
              </Link>
            </div>

            {lastCampaign ? (
              <div className="space-y-3 px-5 py-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-tight text-[#111827]">
                    {lastCampaign.name}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      lastCampaign.status === "RUNNING"   && "bg-emerald-50 text-emerald-700",
                      lastCampaign.status === "COMPLETED" && "bg-[#F3F4F6] text-[#9CA3AF]",
                      lastCampaign.status === "DRAFT"     && "bg-amber-50 text-amber-700",
                      lastCampaign.status === "PAUSED"    && "bg-orange-50 text-orange-700",
                    )}
                  >
                    {lastCampaign.status.toLowerCase()}
                  </span>
                </div>

                {(() => {
                  const total = lastCampaign.total > 0
                    ? lastCampaign.total
                    : lastCampaign.sent + lastCampaign.failed + lastCampaign.skipped;
                  const pct = total > 0
                    ? Math.round((lastCampaign.sent / total) * 100)
                    : 0;
                  return (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-[#9CA3AF]">
                        <span>{lastCampaign.sent.toLocaleString()} sent</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F3F4F6]">
                        <div className="h-full stitch-gradient" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[11px] text-[#D1D5DB]">
                        {total.toLocaleString()} total recipients
                      </p>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <Megaphone className="size-7 text-[#E5E7EB]" strokeWidth={1.5} />
                <p className="text-xs text-[#9CA3AF]">No campaigns yet</p>
                <Link
                  href="/campaigns"
                  className="text-xs text-[#6366F1] transition-colors hover:text-indigo-500"
                >
                  Create your first →
                </Link>
              </div>
            )}
          </div>

          {/* Monthly quota */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF]">
                Monthly Quota
              </span>
              <span className="text-xs font-bold text-[#111827]">{quotaPercent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F3F4F6]">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  quotaPercent >= 90 ? "bg-red-400"
                  : quotaPercent >= 70 ? "bg-amber-400"
                  : "stitch-gradient",
                )}
                style={{ width: `${Math.max(quotaPercent, 2)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[#9CA3AF]">
              {(dash?.billing.outboundMessagesThisMonth ?? 0).toLocaleString()} /{" "}
              {limitLabel} messages · {dash?.billing.periodKey ?? "—"}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
