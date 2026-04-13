"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import type { Campaign, DashboardAnalytics } from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth-store";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo } from "react";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const { data: dash, isLoading: dashLoading, isError: dashError, error: dashErr } = useQuery({
    queryKey: qk.analyticsDashboard,
    queryFn: async () => {
      const { data } = await api.get<DashboardAnalytics>("/analytics/dashboard");
      return data;
    },
  });

  const { data: campaigns = [], isLoading: cLoading, isError: campError, error: campErr } = useQuery({
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

  useEffect(() => {
    if (dashError) toast.error("Could not load analytics", getApiErrorMessage(dashErr));
  }, [dashError, dashErr]);

  useEffect(() => {
    if (campError) toast.error("Could not load campaigns", getApiErrorMessage(campErr));
  }, [campError, campErr]);

  const loading = dashLoading || cLoading;
  const firstName = user?.name?.split(" ")[0] ?? "there";

  const deliveryRate = useMemo(() => {
    if (!dash?.totalMessages) return 0;
    return Math.round(((dash.totalMessages - dash.failed) / dash.totalMessages) * 100);
  }, [dash]);

  const readRate = useMemo(() => {
    if (!dash?.totalMessages) return 0;
    return Math.round(((dash.totalMessages - dash.failed - dash.pending) / dash.totalMessages) * 100);
  }, [dash]);

  const quotaPercent = useMemo(() => {
    if (!dash) return 0;
    const { outboundMessagesThisMonth, outboundLimit } = dash.billing;
    if (outboundLimit <= 0) return 0;
    return Math.min(100, Math.round((outboundMessagesThisMonth / outboundLimit) * 100));
  }, [dash]);

  const limitLabel = dash
    ? dash.billing.outboundLimit < 0 ? "∞" : String(dash.billing.outboundLimit)
    : "—";

  const circumference = 2 * Math.PI * 70;
  const dashOffset = circumference - (circumference * quotaPercent) / 100;

  const activeCampaigns = campaigns
    .filter((c) => c.status === "RUNNING")
    .slice(0, 3);

  if (loading) {
    return (
      <div className="page-container space-y-8 animate-pulse">
        <div className="h-16 bg-[#161a21] rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-[#161a21] rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container space-y-8">
      {/* Hero */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Good day, {firstName}.
          </h2>
          <p className="text-sm text-[#a9abb3] mt-1">
            {dash
              ? `${dash.sent.toLocaleString()} messages sent · ${deliveryRate}% delivery rate`
              : "Loading your workspace…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/campaigns"
            className="px-4 py-2 glass-pane rounded-lg text-sm font-medium text-[#a9abb3] hover:text-white transition-all"
          >
            All Campaigns
          </Link>
          <Link
            href="/contacts"
            className="px-4 py-2 stitch-gradient rounded-lg text-sm font-semibold text-white shadow-[0_0_15px_rgba(99,102,241,0.25)] hover:opacity-90 transition-all"
          >
            + Add Contacts
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Sent" value={String(dash?.sent ?? "—")} bars={["60%","45%","75%","100%","60%","50%"]} barClass="bg-[#6366F1]" dimClass="bg-[#6366F1]/20" />
        <StatCard label="Delivered" value={`${deliveryRate}%`} bars={["50%","65%","75%","100%","50%","70%"]} barClass="bg-emerald-500" dimClass="bg-emerald-500/20" />
        <StatCard label="Read Rate" value={`${readRate}%`} bars={["75%","50%","100%","65%","80%","50%"]} barClass="bg-[#EC4899]" dimClass="bg-[#EC4899]/20" />
        <StatCard label="Failed" value={String(dash?.failed ?? "—")} bars={["33%","25%","50%","33%","100%","25%"]} barClass="bg-[#ff6e84]" dimClass="bg-[#ff6e84]/20" />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: table + mini stats */}
        <div className="lg:col-span-2 space-y-6">
          {/* Campaign Table */}
          <div className="bg-[#161a21] border border-[#262B33]/20 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 flex justify-between items-center border-b border-[#262B33]/20">
              <h3 className="text-base font-semibold text-white">Active Campaigns</h3>
              <Link href="/campaigns" className="text-sm font-medium text-[#6366F1] hover:underline">
                View All
              </Link>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold text-[#73757d] uppercase tracking-widest bg-[#1c2028]/50">
                  <th className="px-6 py-3">Campaign</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262B33]/10">
                {activeCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-sm text-[#a9abb3]">
                      No active campaigns.{" "}
                      <Link href="/campaigns" className="text-[#6366F1] hover:underline">Create one →</Link>
                    </td>
                  </tr>
                ) : activeCampaigns.map((c) => {
                  const total = c.total > 0 ? c.total : (c.sent + c.failed + c.skipped);
                  const pct = total > 0 ? Math.round((c.sent / total) * 100) : 0;
                  return (
                    <tr key={c.id} className="hover:bg-[#262B33]/10 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-white text-sm">{c.name}</p>
                        <p className="text-[10px] text-[#73757d] uppercase tracking-wider mt-0.5">
                          {total.toLocaleString()} recipients
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-medium text-emerald-400">Running</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-28 ml-auto">
                          <div className="flex justify-between text-[10px] text-[#73757d] mb-1 font-bold">
                            <span>{pct}%</span><span>{c.sent}/{total}</span>
                          </div>
                          <div className="w-full bg-[#262B33] h-1 rounded-full overflow-hidden">
                            <div className="h-full stitch-gradient" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mini stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Messages", value: dash?.totalMessages ?? "—" },
              { label: "Pending", value: dash?.pending ?? "—" },
              { label: "Inbox Threads", value: dash?.inboxThreads ?? "—" },
              { label: "Contacts", value: contactsMeta?.total ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[#161a21] border border-[#262B33]/20 rounded-xl p-4">
                <p className="text-[10px] font-bold text-[#73757d] uppercase tracking-widest mb-1">{label}</p>
                <p className="text-xl font-bold text-white">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* WhatsApp Status */}
          <div className="bg-[#161a21] border border-[#262B33]/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-emerald-500">cell_tower</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#73757d] uppercase tracking-widest">Connection</p>
                  <p className="text-sm font-semibold text-white">WA Business API</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-400 uppercase">Active</span>
              </div>
            </div>
            <Link
              href="/whatsapp-accounts"
              className="w-full py-3 rounded-xl stitch-gradient text-white text-sm font-bold flex items-center justify-center gap-2 shadow-[0_8px_20px_-5px_rgba(99,102,241,0.35)] hover:opacity-90 transition-all"
            >
              <span className="material-symbols-outlined text-sm">manage_accounts</span>
              Manage Accounts
            </Link>
          </div>

          {/* Quota */}
          <div className="bg-[#161a21] border border-[#262B33]/20 rounded-2xl p-6">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest mb-5">Monthly Quota</h3>
            <div className="relative w-36 h-36 mx-auto mb-4">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="70" fill="transparent" stroke="#262B33" strokeWidth="8" />
                <circle
                  cx="80" cy="80" r="70" fill="transparent"
                  stroke="url(#qGrad)" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={dashOffset}
                />
                <defs>
                  <linearGradient id="qGrad" x1="0" x2="160" y1="0" y2="160" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6366F1" /><stop offset="1" stopColor="#EC4899" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-white leading-none">{quotaPercent}%</span>
                <span className="text-[10px] text-[#73757d] font-bold mt-1 uppercase">Used</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#1c2028] p-3 rounded-xl border border-[#262B33]/40">
                <p className="text-[10px] text-[#73757d] font-bold uppercase mb-1">Sent</p>
                <p className="text-sm font-semibold text-white">
                  {dash?.billing.outboundMessagesThisMonth ?? 0} / {limitLabel}
                </p>
              </div>
              <div className="bg-[#1c2028] p-3 rounded-xl border border-[#262B33]/40">
                <p className="text-[10px] text-[#73757d] font-bold uppercase mb-1">Period</p>
                <p className="text-sm font-semibold text-white">{dash?.billing.periodKey ?? "—"}</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-[#161a21] border border-[#262B33]/20 rounded-2xl p-6">
            <h3 className="text-[10px] font-bold text-white uppercase tracking-widest mb-4">Quick Actions</h3>
            <div className="space-y-1">
              {[
                { href: "/chatbot", label: "Manage Chatbot Flows", icon: "account_tree" },
                { href: "/templates", label: "Browse Templates", icon: "layers" },
                { href: "/inbox", label: "Open Inbox", icon: "inbox" },
              ].map(({ href, label, icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#a9abb3] hover:text-white hover:bg-[#262B33]/30 transition-all group"
                >
                  <span className="material-symbols-outlined text-[18px] text-[#6366F1]">{icon}</span>
                  {label}
                  <span className="material-symbols-outlined text-[14px] ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    arrow_forward
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label, value, bars, barClass, dimClass,
}: {
  label: string;
  value: string;
  bars: string[];
  barClass: string;
  dimClass: string;
}) {
  return (
    <div className="bg-[#161a21] border border-[#262B33]/30 rounded-xl p-5">
      <p className="text-[10px] font-bold text-[#73757d] uppercase tracking-widest mb-1">{label}</p>
      <h3 className="text-2xl font-bold text-white mb-3">{value}</h3>
      <div className="h-10 flex items-end gap-0.5">
        {bars.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-sm ${i === 3 ? barClass : dimClass}`}
            style={{ height: h }}
          />
        ))}
      </div>
    </div>
  );
}
