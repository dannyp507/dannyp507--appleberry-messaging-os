"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import type { Campaign } from "@/lib/api/types";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-[#262B33] text-[#a9abb3]",
  RUNNING: "bg-emerald-500/10 text-emerald-400",
  PAUSED: "bg-amber-500/10 text-amber-400",
  COMPLETED: "bg-[#6366F1]/10 text-[#6366F1]",
};

export default function CampaignReportPage() {
  const { id } = useParams<{ id: string }>();

  const { data: campaign, isLoading } = useQuery({
    queryKey: qk.campaignReport(id),
    queryFn: async () => {
      const { data } = await api.get<Campaign>(`/campaigns/${id}/report`);
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="page-container animate-pulse space-y-6">
        <div className="h-8 w-48 bg-[#161a21] rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-[#161a21] rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="page-container flex flex-col items-center justify-center py-20">
        <p className="text-[#a9abb3]">Campaign not found.</p>
        <Link href="/campaigns" className="mt-4 text-[#6366F1] hover:underline text-sm">← Back to campaigns</Link>
      </div>
    );
  }

  const total = campaign.total > 0 ? campaign.total : (campaign.sent + campaign.failed + campaign.skipped);
  const deliveryRate = total > 0 ? Math.round((campaign.sent / total) * 100) : 0;
  const failRate = total > 0 ? Math.round((campaign.failed / total) * 100) : 0;
  const skipRate = total > 0 ? Math.round((campaign.skipped / total) * 100) : 0;

  const circumference = 2 * Math.PI * 60;
  const dashOffset = circumference - (circumference * deliveryRate) / 100;

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/campaigns" className="text-[#a9abb3] hover:text-white transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white">{campaign.name}</h2>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${STATUS_COLORS[campaign.status] ?? STATUS_COLORS.DRAFT}`}>
              {campaign.status}
            </span>
          </div>
          <p className="text-sm text-[#a9abb3] mt-0.5">
            Created {new Date(campaign.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total", value: total.toLocaleString(), color: "text-[#6366F1]", icon: "group" },
          { label: "Sent", value: campaign.sent.toLocaleString(), color: "text-emerald-400", icon: "send" },
          { label: "Failed", value: campaign.failed.toLocaleString(), color: "text-[#ff6e84]", icon: "error" },
          { label: "Skipped", value: campaign.skipped.toLocaleString(), color: "text-amber-400", icon: "skip_next" },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="bg-[#161a21] border border-[#262B33]/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className={`material-symbols-outlined text-xl ${color}`}>{icon}</span>
              <p className="text-[10px] font-bold text-[#73757d] uppercase tracking-widest">{label}</p>
            </div>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Visual breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Delivery ring */}
        <div className="bg-[#161a21] border border-[#262B33]/20 rounded-2xl p-6 flex flex-col items-center gap-4">
          <h3 className="text-[10px] font-bold text-white uppercase tracking-widest self-start">Delivery Rate</h3>
          <div className="relative w-36 h-36">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="60" fill="transparent" stroke="#262B33" strokeWidth="8" />
              <circle cx="70" cy="70" r="60" fill="transparent" stroke="url(#rGrad)" strokeWidth="8"
                strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} />
              <defs>
                <linearGradient id="rGrad" x1="0" x2="140" y1="0" y2="140" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366F1" /><stop offset="1" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-white leading-none">{deliveryRate}%</span>
              <span className="text-[10px] text-[#73757d] font-bold mt-1 uppercase">Delivered</span>
            </div>
          </div>
          <div className="w-full grid grid-cols-3 gap-3">
            {[
              { label: "Sent", pct: deliveryRate, color: "bg-emerald-500" },
              { label: "Failed", pct: failRate, color: "bg-[#ff6e84]" },
              { label: "Skipped", pct: skipRate, color: "bg-amber-500" },
            ].map(({ label, pct, color }) => (
              <div key={label} className="text-center">
                <div className="h-1 rounded-full bg-[#262B33] mb-1.5 overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-[#73757d] font-bold uppercase">{label}</p>
                <p className="text-sm font-bold text-white">{pct}%</p>
              </div>
            ))}
          </div>
        </div>

        {/* Template & group info */}
        <div className="bg-[#161a21] border border-[#262B33]/20 rounded-2xl p-6 space-y-4">
          <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Campaign Details</h3>
          {[
            { label: "Template", value: campaign.template?.name ?? "—", icon: "layers" },
            { label: "Contact Group", value: campaign.contactGroup?.name ?? "—", icon: "group" },
            { label: "Status", value: campaign.status, icon: "info" },
            { label: "Last Updated", value: new Date(campaign.updatedAt).toLocaleString(), icon: "schedule" },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1c2028] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-sm text-[#6366F1]">{icon}</span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#73757d] uppercase tracking-wider">{label}</p>
                <p className="text-sm text-white font-medium">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
