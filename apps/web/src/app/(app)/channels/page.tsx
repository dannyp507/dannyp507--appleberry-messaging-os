"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { FacebookPage, TelegramAccount, WhatsAppAccount } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  MessageCircle,
  Send,
  Share2,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// ─── Channel card ──────────────────────────────────────────────────────────────

function ChannelCard({
  icon: Icon,
  name,
  description,
  count,
  countLabel,
  connected,
  href,
  cta,
  accentClass,
  iconBgClass,
  iconColorClass,
  borderClass,
}: {
  icon: LucideIcon;
  name: string;
  description: string;
  count: number;
  countLabel: string;
  connected: boolean;
  href: string;
  cta: string;
  accentClass: string;
  iconBgClass: string;
  iconColorClass: string;
  borderClass: string;
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-[#0f1219] transition-all duration-200 hover:shadow-lg",
        borderClass,
      )}
    >
      {/* Top accent strip */}
      <div className={cn("h-0.5 w-full", accentClass)} />

      <div className="flex flex-1 flex-col gap-5 p-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-xl",
              iconBgClass,
            )}
          >
            <Icon className={cn("size-5", iconColorClass)} strokeWidth={2} />
          </div>

          {/* Connection status pill */}
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              connected
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border-[#262B33]/60 bg-[#161a21] text-[#5a5d68]",
            )}
          >
            {connected ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <Circle className="size-3" />
            )}
            {connected ? "Connected" : "Not connected"}
          </div>
        </div>

        {/* Name + description */}
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold text-white">{name}</h3>
          <p className="text-sm leading-relaxed text-[#6b6d74]">{description}</p>
        </div>

        {/* Count stat */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold text-white">{count}</span>
          <span className="text-sm text-[#5a5d68]">
            {count === 1 ? countLabel : `${countLabel}s`} connected
          </span>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="border-t border-[#1a1f2a] px-6 py-4">
        <Link href={href} className="w-full">
          <Button
            variant="ghost"
            className="w-full justify-between rounded-xl border border-[#1e2330] bg-[#161a21] px-4 py-2.5 text-sm font-medium text-[#9b9da6] hover:border-[#2d3141] hover:bg-[#1e2330] hover:text-white"
          >
            {cta}
            <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ChannelsPage() {
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

  const channels = [
    {
      id: "whatsapp",
      name: "WhatsApp",
      description:
        "Connect WhatsApp Business accounts to send campaigns, receive messages, and automate conversations at scale.",
      icon: Smartphone,
      count: waAccounts.length,
      countLabel: "account",
      connected: waAccounts.some((a) => a.session?.status === "CONNECTED"),
      href: "/whatsapp-accounts",
      cta: "Manage WhatsApp",
      accentClass: "bg-gradient-to-r from-emerald-500/80 to-emerald-400/40",
      iconBgClass: "bg-emerald-500/10",
      iconColorClass: "text-emerald-400",
      borderClass: "border-[#1a2820] hover:border-emerald-900/60",
    },
    {
      id: "facebook",
      name: "Facebook Pages",
      description:
        "Connect Facebook Pages to manage Messenger conversations and respond to customers within the 24-hour window.",
      icon: Share2,
      count: fbPages.length,
      countLabel: "page",
      connected: fbPages.some((p) => p.isActive),
      href: "/facebook-pages",
      cta: "Manage Pages",
      accentClass: "bg-gradient-to-r from-blue-500/80 to-blue-400/40",
      iconBgClass: "bg-blue-500/10",
      iconColorClass: "text-blue-400",
      borderClass: "border-[#1a1f2e] hover:border-blue-900/60",
    },
    {
      id: "telegram",
      name: "Telegram",
      description:
        "Connect Telegram bots to send automated messages and handle inbound conversations from your community.",
      icon: Send,
      count: tgAccounts.length,
      countLabel: "bot",
      connected: tgAccounts.some((a) => a.isActive),
      href: "/telegram-accounts",
      cta: "Manage Bots",
      accentClass: "bg-gradient-to-r from-sky-500/80 to-sky-400/40",
      iconBgClass: "bg-sky-500/10",
      iconColorClass: "text-sky-400",
      borderClass: "border-[#191f26] hover:border-sky-900/60",
    },
  ];

  const totalConnected = channels.filter((c) => c.connected).length;

  return (
    <div className="page-container space-y-8">
      <PageHeader
        title="Channels"
        description="Connect your messaging channels. Every conversation flows into the unified Inbox automatically."
      />

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-6 rounded-xl border border-[#1a1f2a] bg-[#0f1219] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <MessageCircle className="size-4 text-[#6366F1]" strokeWidth={2} />
          <span className="text-sm font-medium text-white">
            {totalConnected} of {channels.length} channels active
          </span>
        </div>
        <div className="hidden h-4 w-px bg-[#1e2330] sm:block" />
        <p className="text-sm text-[#5a5d68]">
          All inbound messages appear in{" "}
          <Link
            href="/inbox"
            className="font-medium text-[#818cf8] underline-offset-2 hover:underline"
          >
            Inbox
          </Link>{" "}
          with channel badges. Automate responses under{" "}
          <Link
            href="/autoresponder"
            className="font-medium text-[#818cf8] underline-offset-2 hover:underline"
          >
            Automation
          </Link>
          .
        </p>
      </div>

      {/* Channel cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((ch) => (
          <ChannelCard key={ch.id} {...ch} />
        ))}
      </div>
    </div>
  );
}
