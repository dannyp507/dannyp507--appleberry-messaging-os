"use client";

import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     "bg-[#F3F4F6] text-[#6B7280]",
  RUNNING:   "bg-emerald-500/10 text-emerald-400",
  PAUSED:    "bg-amber-500/10 text-amber-400",
  COMPLETED: "bg-[#6366F1]/10 text-[#6366F1]",
};

interface ReportData {
  campaign: {
    id: string; name: string; status: string;
    total: number; sent: number; failed: number; skipped: number;
    createdAt: string;
  };
  template: { id: string; name: string };
  contactGroup: { id: string; name: string };
  recipientsByStatus: Record<string, number>;
  recipients: {
    id: string; status: string; error?: string | null;
    contact: { id: string; phone: string; firstName?: string; lastName?: string } | null;
  }[];
}

export default function CampaignReportPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: qk.campaignReport(id),
    queryFn: async () => {
      const { data } = await api.get<ReportData>(`/campaigns/${id}/report`);
      return data;
    },
    // Poll every 3 s while the campaign is running so stats update live;
    // stop polling once it reaches a terminal state.
    refetchInterval: (query) => {
      const status = query.state.data?.campaign?.status;
      return status === "RUNNING" ? 3000 : false;
    },
  });

  if (isLoading) {
    return (
      <div className="page-container animate-pulse space-y-6">
        <div className="h-8 w-48 bg-[#F9FAFB] rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-[#F9FAFB] rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-container flex flex-col items-center justify-center py-20">
        <p className="text-[#6B7280]">Campaign not found.</p>
        <Link href="/campaigns" className="mt-4 text-[#6366F1] hover:underline text-sm">← Back to campaigns</Link>
      </div>
    );
  }

  const { campaign, template, contactGroup, recipients, recipientsByStatus } = data;

  // Use live recipient-status counts (accurate) rather than the campaign's
  // cumulative sent/failed counters which inflate on retries.
  const sentCount    = recipientsByStatus["SENT"]    ?? 0;
  const failedCount  = recipientsByStatus["FAILED"]  ?? 0;
  const skippedCount = recipientsByStatus["SKIPPED"] ?? 0;
  const pendingCount = (recipientsByStatus["PENDING"] ?? 0) + (recipientsByStatus["QUEUED"] ?? 0);
  const total        = campaign.total > 0
    ? campaign.total
    : sentCount + failedCount + skippedCount + pendingCount;

  const deliveryRate = total > 0 ? Math.round((sentCount  / total) * 100) : 0;
  const failRate     = total > 0 ? Math.round((failedCount / total) * 100) : 0;
  const skipRate     = total > 0 ? Math.round((skippedCount / total) * 100) : 0;

  const circumference = 2 * Math.PI * 60;
  const dashOffset = circumference - (circumference * deliveryRate) / 100;

  const isRunning = campaign.status === "RUNNING";

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/campaigns" className="text-[#6B7280] hover:text-[#111827] transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-[#111827]">{campaign.name}</h2>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${STATUS_COLORS[campaign.status] ?? STATUS_COLORS.DRAFT}`}>
              {campaign.status}
            </span>
            {isRunning && (
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <p className="text-sm text-[#6B7280] mt-0.5">
            Created {new Date(campaign.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total",   value: total.toLocaleString(),           color: "text-[#6366F1]",   icon: "group" },
          { label: "Sent",    value: sentCount.toLocaleString(),       color: "text-emerald-400", icon: "send" },
          { label: "Failed",  value: failedCount.toLocaleString(),     color: "text-[#ff6e84]",   icon: "error" },
          { label: "Pending", value: pendingCount.toLocaleString(),    color: "text-amber-400",   icon: "hourglass_top" },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="bg-[#F9FAFB] border border-[#F3F4F6] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className={`material-symbols-outlined text-xl ${color}`}>{icon}</span>
              <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest">{label}</p>
            </div>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Visual breakdown + details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Delivery ring + progress bars */}
        <div className="bg-[#F9FAFB] border border-[#F3F4F6] rounded-2xl p-6 flex flex-col items-center gap-4">
          <h3 className="text-[10px] font-bold text-[#111827] uppercase tracking-widest self-start">Delivery Rate</h3>
          <div className="relative w-36 h-36">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="60" fill="transparent" stroke="#262B33" strokeWidth="8" />
              <circle cx="70" cy="70" r="60" fill="transparent" stroke="url(#rGrad)" strokeWidth="8"
                strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 0.6s ease" }} />
              <defs>
                <linearGradient id="rGrad" x1="0" x2="140" y1="0" y2="140" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366F1" /><stop offset="1" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-[#111827] leading-none">{deliveryRate}%</span>
              <span className="text-[10px] text-[#9CA3AF] font-bold mt-1 uppercase">Delivered</span>
            </div>
          </div>

          {/* Progress bars — animate width transitions */}
          <div className="w-full space-y-3">
            {[
              { label: "Sent",    count: sentCount,    pct: deliveryRate, color: "bg-emerald-500" },
              { label: "Failed",  count: failedCount,  pct: failRate,     color: "bg-[#ff6e84]" },
              { label: "Pending", count: pendingCount, pct: total > 0 ? Math.round((pendingCount / total) * 100) : 0, color: "bg-amber-400" },
              { label: "Skipped", count: skippedCount, pct: skipRate,     color: "bg-[#9CA3AF]" },
            ].map(({ label, count, pct, color }) => (
              <div key={label}>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[10px] text-[#9CA3AF] font-bold uppercase">{label}</p>
                  <p className="text-[10px] font-bold text-[#111827]">{count.toLocaleString()} <span className="text-[#9CA3AF] font-normal">({pct}%)</span></p>
                </div>
                <div className="h-1.5 rounded-full bg-[#F3F4F6] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${pct}%`, transition: "width 0.6s ease" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Campaign details */}
        <div className="bg-[#F9FAFB] border border-[#F3F4F6] rounded-2xl p-6 space-y-4">
          <h3 className="text-[10px] font-bold text-[#111827] uppercase tracking-widest">Campaign Details</h3>
          {[
            { label: "Template",      value: template.name,      icon: "layers" },
            { label: "Contact Group", value: contactGroup.name,  icon: "group" },
            { label: "Status",        value: campaign.status,    icon: "info" },
            { label: "Created",       value: new Date(campaign.createdAt).toLocaleString(), icon: "schedule" },
          ].map(({ label, value, icon }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#F3F4F6] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-sm text-[#6366F1]">{icon}</span>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">{label}</p>
                <p className="text-sm text-[#111827] font-medium">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recipients table */}
      {recipients.length > 0 && (
        <div className="bg-[#F9FAFB] border border-[#F3F4F6] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-[#111827] uppercase tracking-widest">
              Recipients ({recipients.length.toLocaleString()})
            </h3>
            {isRunning && (
              <span className="text-[10px] text-emerald-400 font-bold">Updating every 3s…</span>
            )}
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#F9FAFB]">
                <tr className="border-b border-[#F3F4F6]">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Phone</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider">Error</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.id} className="border-b border-[#F3F4F6] hover:bg-[#F3F4F6]/50">
                    <td className="px-4 py-2.5 text-[#111827]">
                      {r.contact ? `${r.contact.firstName ?? ""} ${r.contact.lastName ?? ""}`.trim() || "—" : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[#6B7280]">{r.contact?.phone ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        r.status === "SENT"    ? "bg-emerald-500/10 text-emerald-400" :
                        r.status === "FAILED"  ? "bg-red-500/10 text-red-400" :
                        r.status === "SKIPPED" ? "bg-amber-500/10 text-amber-400" :
                        r.status === "QUEUED"  ? "bg-[#6366F1]/10 text-[#6366F1]" :
                        "bg-[#F3F4F6] text-[#6B7280]"
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#ff6e84] max-w-xs truncate">{r.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
