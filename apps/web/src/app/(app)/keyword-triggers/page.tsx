"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import type { KeywordTrigger } from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export default function KeywordTriggersPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [replyMessage, setReplyMessage] = useState("");

  const { data: triggers = [], isLoading } = useQuery({
    queryKey: qk.keywordTriggers,
    queryFn: async () => {
      const { data } = await api.get<KeywordTrigger[]>("/keyword-triggers");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/keyword-triggers", { keyword, replyMessage });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.keywordTriggers });
      setOpen(false); setKeyword(""); setReplyMessage("");
      toast.success("Keyword trigger created");
    },
    onError: (e) => toast.error("Could not create trigger", getApiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/keyword-triggers/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.keywordTriggers }),
    onError: (e) => toast.error("Could not delete trigger", getApiErrorMessage(e)),
  });

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#111827]">Keyword Triggers</h2>
          <p className="text-sm text-[#6B7280] mt-1">Send automatic replies when a keyword is received</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="px-4 py-2 stitch-gradient rounded-lg text-sm font-semibold text-white shadow-[0_0_15px_rgba(99,102,241,0.25)] hover:opacity-90 transition-all flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">add</span>New Trigger
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-[#F9FAFB] rounded-xl" />)}
        </div>
      ) : triggers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="material-symbols-outlined text-5xl text-[#262B33] mb-4">tag</span>
          <p className="text-[#6B7280]">No keyword triggers yet.</p>
          <p className="text-xs text-[#9CA3AF] mt-1">When a contact sends a keyword, they automatically receive your reply.</p>
        </div>
      ) : (
        <div className="bg-[#F9FAFB] border border-[#F3F4F6] rounded-2xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-widest bg-[#F3F4F6]/50">
                <th className="px-6 py-3">Keyword</th>
                <th className="px-6 py-3">Reply</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262B33]/10">
              {triggers.map((t) => (
                <tr key={t.id} className="hover:bg-[#F3F4F6]/10 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm font-semibold text-[#6366F1] bg-[#6366F1]/10 px-2 py-0.5 rounded">{t.keyword}</span>
                  </td>
                  <td className="px-6 py-4 max-w-xs">
                    <p className="text-sm text-[#6B7280] truncate">{t.replyMessage}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${t.isActive ? "bg-emerald-500" : "bg-[#73757d]"}`} />
                      <span className={`text-xs font-medium ${t.isActive ? "text-emerald-400" : "text-[#9CA3AF]"}`}>
                        {t.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => { if (confirm("Delete trigger?")) deleteMutation.mutate(t.id); }}
                      className="text-[#ff6e84] hover:text-red-400 transition-colors">
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-[#F3F4F6]">
              <h3 className="text-lg font-bold text-[#111827]">New Keyword Trigger</h3>
              <button onClick={() => setOpen(false)} className="text-[#6B7280] hover:text-[#111827]">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Keyword</label>
                <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. PRICE, INFO, HELLO"
                  className="w-full bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6366F1]/60" />
                <p className="text-[10px] text-[#9CA3AF]">Case-insensitive. Matches exact word in message.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest">Reply Message</label>
                <textarea rows={5} value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} placeholder="The message to send when this keyword is detected..."
                  className="w-full bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#6366F1]/60 resize-none" />
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[#6B7280] bg-[#F3F4F6] hover:text-[#111827] transition-colors">Cancel</button>
              <button disabled={createMutation.isPending || !keyword || !replyMessage} onClick={() => createMutation.mutate()}
                className="px-6 py-2 rounded-lg stitch-gradient text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {createMutation.isPending ? "Saving…" : "Save Trigger"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
