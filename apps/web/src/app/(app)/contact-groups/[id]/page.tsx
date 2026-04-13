"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import type { Contact, ContactGroup } from "@/lib/api/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";

export default function ContactGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const take = 25;

  const { data: group } = useQuery({
    queryKey: ["contact-group", id],
    queryFn: async () => {
      const { data } = await api.get<ContactGroup>(`/contact-groups/${id}`);
      return data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: qk.contactGroupMembers(id, { skip: page * take, take }),
    queryFn: async () => {
      const { data } = await api.get<{ items: Contact[]; total: number }>(`/contact-groups/${id}/members`, {
        params: { skip: page * take, take, search: search || undefined },
      });
      return data;
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.get<Blob>(`/contact-groups/${id}/export`, { responseType: "blob" });
      return data;
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `group-${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error("Export failed", getApiErrorMessage(e)),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / take);

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/contacts" className="text-[#a9abb3] hover:text-white transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white">{group?.name ?? "Contact Group"}</h2>
          <p className="text-sm text-[#a9abb3] mt-0.5">{total.toLocaleString()} contacts</p>
        </div>
        <button onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}
          className="px-4 py-2 glass-pane rounded-lg text-sm font-medium text-[#a9abb3] hover:text-white transition-all flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">download</span>
          {exportMutation.isPending ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: total, color: "text-[#6366F1]" },
          { label: "Valid", value: items.filter(c => c.isValid).length, color: "text-emerald-400" },
          { label: "Invalid", value: items.filter(c => !c.isValid).length, color: "text-[#ff6e84]" },
          { label: "Duplicate", value: items.filter(c => c.isDuplicate).length, color: "text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#161a21] border border-[#262B33]/20 rounded-xl p-4">
            <p className="text-[10px] font-bold text-[#73757d] uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#73757d] text-sm">search</span>
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search contacts…"
          className="w-full bg-[#161a21] border border-[#262B33]/30 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-[#73757d] focus:outline-none focus:border-[#6366F1]/60" />
      </div>

      {/* Table */}
      <div className="bg-[#161a21] border border-[#262B33]/20 rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-bold text-[#73757d] uppercase tracking-widest bg-[#1c2028]/50">
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Phone</th>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#262B33]/10">
            {isLoading ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-[#73757d]">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-[#73757d]">No contacts found.</td></tr>
            ) : items.map((c) => (
              <tr key={c.id} className="hover:bg-[#262B33]/10 transition-colors">
                <td className="px-6 py-3">
                  <p className="text-sm font-medium text-white">{c.firstName} {c.lastName}</p>
                </td>
                <td className="px-6 py-3 text-sm text-[#a9abb3] font-mono">{c.phone}</td>
                <td className="px-6 py-3 text-sm text-[#a9abb3]">{c.email ?? "—"}</td>
                <td className="px-6 py-3">
                  <div className="flex gap-1.5">
                    {c.isDuplicate && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">Duplicate</span>}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.isValid ? "bg-emerald-500/10 text-emerald-400" : "bg-[#ff6e84]/10 text-[#ff6e84]"}`}>
                      {c.isValid ? "Valid" : "Invalid"}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#73757d]">Page {page + 1} of {pages}</span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg bg-[#161a21] border border-[#262B33]/30 text-[#a9abb3] disabled:opacity-40 hover:text-white transition-colors">
              Previous
            </button>
            <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-[#161a21] border border-[#262B33]/30 text-[#a9abb3] disabled:opacity-40 hover:text-white transition-colors">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
