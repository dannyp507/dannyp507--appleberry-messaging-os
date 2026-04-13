"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import type { AutoresponderRule, Template } from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export default function AutoresponderPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<"ALWAYS" | "KEYWORD" | "OUTSIDE_HOURS">("ALWAYS");
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState("");
  const [templateId, setTemplateId] = useState("");

  const { data: rules = [], isLoading } = useQuery({
    queryKey: qk.autoresponderRules,
    queryFn: async () => {
      const { data } = await api.get<AutoresponderRule[]>("/autoresponder/rules");
      return data;
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: qk.templates,
    queryFn: async () => {
      const { data } = await api.get<Template[]>("/templates");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/autoresponder/rules", {
        name,
        triggerType,
        keyword: triggerType === "KEYWORD" ? keyword : undefined,
        message: message || undefined,
        templateId: templateId || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.autoresponderRules });
      setOpen(false);
      setName(""); setTriggerType("ALWAYS"); setKeyword(""); setMessage(""); setTemplateId("");
      toast.success("Autoresponder rule created");
    },
    onError: (e) => toast.error("Could not create rule", getApiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/autoresponder/rules/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.autoresponderRules }),
    onError: (e) => toast.error("Could not delete rule", getApiErrorMessage(e)),
  });

  const TRIGGER_LABELS: Record<string, string> = {
    ALWAYS: "Always reply",
    KEYWORD: "Keyword match",
    OUTSIDE_HOURS: "Outside business hours",
  };

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Autoresponder</h2>
          <p className="text-sm text-[#a9abb3] mt-1">Automatically reply to incoming messages</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="px-4 py-2 stitch-gradient rounded-lg text-sm font-semibold text-white shadow-[0_0_15px_rgba(99,102,241,0.25)] hover:opacity-90 transition-all flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">add</span>New Rule
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-[#161a21] rounded-xl" />)}
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="material-symbols-outlined text-5xl text-[#262B33] mb-4">reply_all</span>
          <p className="text-[#a9abb3]">No autoresponder rules yet.</p>
          <p className="text-xs text-[#73757d] mt-1">Create a rule to automatically reply to incoming messages.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-[#161a21] border border-[#262B33]/30 rounded-xl p-5 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${rule.isActive ? "bg-emerald-500/10" : "bg-[#262B33]"}`}>
                <span className={`material-symbols-outlined text-xl ${rule.isActive ? "text-emerald-500" : "text-[#73757d]"}`}>reply</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-white text-sm">{rule.name}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#6366F1]/10 text-[#6366F1] uppercase tracking-wider">
                    {TRIGGER_LABELS[rule.triggerType] ?? rule.triggerType}
                  </span>
                  {rule.keyword && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">&ldquo;{rule.keyword}&rdquo;</span>
                  )}
                </div>
                <p className="text-xs text-[#73757d] mt-0.5 truncate">
                  {rule.message ?? rule.template?.name ?? "No message set"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className={`w-2 h-2 rounded-full ${rule.isActive ? "bg-emerald-500" : "bg-[#73757d]"}`} />
                <span className="text-xs text-[#73757d]">{rule.isActive ? "Active" : "Inactive"}</span>
                <button onClick={() => { if (confirm("Delete this rule?")) deleteMutation.mutate(rule.id); }}
                  className="ml-2 text-[#ff6e84] hover:text-red-400 transition-colors">
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#161a21] border border-[#262B33]/40 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-[#262B33]/20">
              <h3 className="text-lg font-bold text-white">New Autoresponder Rule</h3>
              <button onClick={() => setOpen(false)} className="text-[#a9abb3] hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#73757d] uppercase tracking-widest">Rule Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welcome Reply"
                  className="w-full bg-[#1c2028] border border-[#262B33]/40 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[#73757d] focus:outline-none focus:border-[#6366F1]/60" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#73757d] uppercase tracking-widest">Trigger</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["ALWAYS", "KEYWORD", "OUTSIDE_HOURS"] as const).map((t) => (
                    <button key={t} onClick={() => setTriggerType(t)}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all text-center ${triggerType === t ? "stitch-gradient text-white" : "bg-[#1c2028] text-[#a9abb3] hover:text-white"}`}>
                      {t === "ALWAYS" ? "Always" : t === "KEYWORD" ? "Keyword" : "Off-Hours"}
                    </button>
                  ))}
                </div>
              </div>
              {triggerType === "KEYWORD" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#73757d] uppercase tracking-widest">Keyword</label>
                  <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. hello, hi, start"
                    className="w-full bg-[#1c2028] border border-[#262B33]/40 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[#73757d] focus:outline-none focus:border-[#6366F1]/60" />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#73757d] uppercase tracking-widest">Reply Message</label>
                <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Type your auto-reply message..."
                  className="w-full bg-[#1c2028] border border-[#262B33]/40 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[#73757d] focus:outline-none focus:border-[#6366F1]/60 resize-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#73757d] uppercase tracking-widest">Or use Template <span className="normal-case font-normal">(optional)</span></label>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full bg-[#1c2028] border border-[#262B33]/40 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#6366F1]/60">
                  <option value="">— Select template —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm text-[#a9abb3] bg-[#1c2028] hover:text-white transition-colors">Cancel</button>
              <button disabled={createMutation.isPending || !name || (!message && !templateId)} onClick={() => createMutation.mutate()}
                className="px-6 py-2 rounded-lg stitch-gradient text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {createMutation.isPending ? "Saving…" : "Save Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
