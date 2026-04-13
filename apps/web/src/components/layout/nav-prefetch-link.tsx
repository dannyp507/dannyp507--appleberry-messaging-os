"use client";

import { prefetchFetchers } from "@/lib/prefetch-queries";
import { qk } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

const prefetchByHref: Record<
  string,
  Array<{ queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }>
> = {
  "/": [
    { queryKey: qk.analyticsDashboard, queryFn: prefetchFetchers.analyticsDashboard },
    { queryKey: qk.campaigns, queryFn: prefetchFetchers.campaigns },
  ],
  "/contacts": [
    { queryKey: qk.contacts({ take: 25, skip: 0 }), queryFn: prefetchFetchers.contacts },
  ],
  "/campaigns": [
    { queryKey: qk.campaigns, queryFn: prefetchFetchers.campaigns },
  ],
  "/chatbot": [
    { queryKey: qk.chatbotFlows, queryFn: prefetchFetchers.chatbotFlows },
  ],
  "/inbox": [{ queryKey: qk.inboxThreads, queryFn: prefetchFetchers.inboxThreads }],
};

export function NavPrefetchLink({
  href,
  label,
  icon: Icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const qc = useQueryClient();

  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  const warm = () => {
    const jobs = prefetchByHref[href];
    if (!jobs) return;
    for (const job of jobs) {
      void qc.prefetchQuery({
        queryKey: job.queryKey,
        queryFn: job.queryFn,
      });
    }
  };

  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={warm}
      onFocus={warm}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
          : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0 opacity-90" />
      {label}
    </Link>
  );
}
