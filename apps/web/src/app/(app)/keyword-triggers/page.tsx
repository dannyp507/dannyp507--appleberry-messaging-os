"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import type { ChatbotFlowSummary, DripSequenceSummary, KeywordTrigger, Template } from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { GitBranch, ListOrdered, FileText, MessageSquare, Plus, X, Trash2, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionType = "SEND_MESSAGE" | "START_FLOW" | "SEND_TEMPLATE" | "ENROLL_SEQUENCE";
type MatchType = "EXACT" | "CONTAINS" | "REGEX";

const ACTION_OPTIONS: { value: ActionType; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    value: "SEND_MESSAGE",
    label: "Send Message",
    icon: <MessageSquare className="size-4" />,
    desc: "Reply with a static text message",
  },
  {
    value: "START_FLOW",
    label: "Start Chatbot Flow",
    icon: <GitBranch className="size-4" />,
    desc: "Launch a chatbot flow for this contact",
  },
  {
    value: "SEND_TEMPLATE",
    label: "Send Template",
    icon: <FileText className="size-4" />,
    desc: "Send a pre-built message template",
  },
  {
    value: "ENROLL_SEQUENCE",
    label: "Enroll in Sequence",
    icon: <ListOrdered className="size-4" />,
    desc: "Start a drip sequence for this contact",
  },
];

const MATCH_OPTIONS: { value: MatchType; label: string; desc: string }[] = [
  { value: "CONTAINS", label: "Contains", desc: "Message includes the keyword anywhere" },
  { value: "EXACT",    label: "Exact",    desc: "Message is exactly the keyword" },
  { value: "REGEX",    label: "Regex",    desc: "Keyword is a regular expression" },
];

// ─── Action badge ─────────────────────────────────────────────────────────────

function ActionBadge({ trigger }: { trigger: KeywordTrigger }) {
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    SEND_MESSAGE:    { label: "Message",  color: "bg-blue-500/10 text-blue-400",   icon: <MessageSquare className="size-3" /> },
    START_FLOW:      { label: "Flow",     color: "bg-violet-500/10 text-violet-400", icon: <GitBranch className="size-3" /> },
    SEND_TEMPLATE:   { label: "Template", color: "bg-indigo-500/10 text-indigo-400", icon: <FileText className="size-3" /> },
    ENROLL_SEQUENCE: { label: "Sequence", color: "bg-emerald-500/10 text-emerald-400", icon: <ListOrdered className="size-3" /> },
  };
  const def = map[trigger.actionType] ?? { label: trigger.actionType, color: "bg-zinc-700/60 text-zinc-400", icon: <Tag className="size-3" /> };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-white/5", def.color)}>
      {def.icon}{def.label}
    </span>
  );
}

// ─── New Trigger Modal ────────────────────────────────────────────────────────

function NewTriggerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [keyword, setKeyword]         = useState("");
  const [matchType, setMatchType]     = useState<MatchType>("CONTAINS");
  const [actionType, setActionType]   = useState<ActionType>("SEND_MESSAGE");
  const [response, setResponse]       = useState("");
  const [targetId, setTargetId]       = useState("");

  // Fetch targets for flow / template / sequence selectors
  const { data: flows = [] }     = useQuery<ChatbotFlowSummary[]>({
    queryKey: ["chatbot-flows"],
    queryFn: async () => { const { data } = await api.get("/chatbot/flows"); return data; },
    enabled: actionType === "START_FLOW",
  });
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: async () => { const { data } = await api.get("/templates"); return data; },
    enabled: actionType === "SEND_TEMPLATE",
  });
  const { data: sequences = [] } = useQuery<DripSequenceSummary[]>({
    queryKey: ["sequences"],
    queryFn: async () => { const { data } = await api.get("/sequences"); return data; },
    enabled: actionType === "ENROLL_SEQUENCE",
  });

  const activeSequences = sequences.filter((s) => s.status === "ACTIVE");

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/keyword-triggers", {
        keyword: keyword.trim(),
        matchType,
        actionType,
        response: actionType === "SEND_MESSAGE" ? response : undefined,
        targetId: ["START_FLOW", "SEND_TEMPLATE", "ENROLL_SEQUENCE"].includes(actionType) ? targetId : undefined,
      });
    },
    onSuccess: () => {
      onCreated();
      toast.success("Trigger created");
    },
    onError: (e) => toast.error("Could not create trigger", getApiErrorMessage(e)),
  });

  const canSave =
    keyword.trim().length > 0 &&
    (actionType === "SEND_MESSAGE" ? response.trim().length > 0 : targetId.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">New Keyword Trigger</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Keyword + match type */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Keyword *</label>
              <input
                autoFocus
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. START, PRICE, INFO"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
              />
            </div>
            <div className="w-36">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Match</label>
              <select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value as MatchType)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
              >
                {MATCH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Action type picker */}
          <div>
            <label className="mb-2 block text-xs font-medium text-zinc-400">Action *</label>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setActionType(opt.value); setTargetId(""); setResponse(""); }}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
                    actionType === opt.value
                      ? "border-violet-500/50 bg-violet-500/10 text-white"
                      : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800",
                  )}
                >
                  <span className={cn("mt-0.5 shrink-0", actionType === opt.value ? "text-violet-400" : "text-zinc-500")}>
                    {opt.icon}
                  </span>
                  <div>
                    <p className="text-xs font-medium">{opt.label}</p>
                    <p className="mt-0.5 text-[10px] leading-tight opacity-60">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Conditional target input */}
          {actionType === "SEND_MESSAGE" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Reply message *</label>
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={4}
                placeholder={"Hi {{name}}! Here's our price list…\n\nSeparate messages with a line containing just ---"}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-violet-500 focus:outline-none resize-none"
              />
              <p className="mt-1 text-[10px] text-zinc-600">Tip: use <code className="rounded bg-zinc-800 px-1">---</code> on its own line to send multiple bubbles</p>
            </div>
          )}

          {actionType === "START_FLOW" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Chatbot Flow *</label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
              >
                <option value="">Pick a flow…</option>
                {flows.map((f) => (
                  <option key={f.id} value={f.id}>{f.name} ({f.status})</option>
                ))}
              </select>
            </div>
          )}

          {actionType === "SEND_TEMPLATE" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Template *</label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
              >
                <option value="">Pick a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {actionType === "ENROLL_SEQUENCE" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Sequence *</label>
              {activeSequences.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-700 px-3 py-3 text-center text-xs text-zinc-500">
                  No active sequences found.{" "}
                  <Link href="/sequences" className="text-violet-400 hover:underline">Create and activate one first.</Link>
                </div>
              ) : (
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                >
                  <option value="">Pick a sequence…</option>
                  {activeSequences.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s._count.steps} step{s._count.steps !== 1 ? "s" : ""})
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-1.5 text-[10px] text-zinc-600">
                When a contact sends this keyword, they are automatically enrolled. If already enrolled, the existing enrollment is preserved.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
          <button
            disabled={!canSave || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            {createMutation.isPending ? "Saving…" : "Save Trigger"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KeywordTriggersPage() {
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data: triggers = [], isLoading } = useQuery({
    queryKey: qk.keywordTriggers,
    queryFn: async () => {
      const { data } = await api.get<KeywordTrigger[]>("/keyword-triggers");
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await api.patch(`/keyword-triggers/${id}`, { active: !active });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.keywordTriggers }),
    onError: (e) => toast.error("Could not toggle trigger", getApiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/keyword-triggers/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.keywordTriggers });
      toast.success("Trigger deleted");
    },
    onError: (e) => toast.error("Could not delete trigger", getApiErrorMessage(e)),
  });

  const getTargetLabel = (t: KeywordTrigger): string => {
    if (t.actionType === "SEND_MESSAGE") {
      const msg = t.response ?? t.replyMessage ?? "";
      return msg.length > 60 ? msg.slice(0, 60) + "…" : msg || "—";
    }
    return t.targetId ? `ID: ${t.targetId.slice(0, 8)}…` : "—";
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Keyword Triggers</h1>
          <p className="mt-1 text-sm text-zinc-400">
            When a contact sends a keyword, automatically reply, start a flow, or enroll them in a sequence
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-violet-500"
        >
          <Plus className="size-4" />
          New Trigger
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
          ))}
        </div>
      ) : triggers.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-800 py-16 text-center">
          <div className="rounded-full bg-violet-500/10 p-4">
            <Tag className="size-8 text-violet-400" />
          </div>
          <div>
            <p className="font-medium text-zinc-300">No keyword triggers yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              Create a trigger to automatically respond when a contact sends a keyword
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500"
          >
            <Plus className="size-4" />
            New Trigger
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-800/50">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Keyword</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Action</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 hidden md:table-cell">Target / Reply</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {triggers.map((t) => (
                <tr key={t.id} className="group hover:bg-zinc-800/30 transition-colors">
                  {/* Keyword */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">
                        {t.keyword}
                      </span>
                      <span className="text-[10px] text-zinc-600 uppercase">{t.matchType}</span>
                    </div>
                  </td>

                  {/* Action badge */}
                  <td className="px-5 py-3.5">
                    <ActionBadge trigger={t} />
                  </td>

                  {/* Target / reply preview */}
                  <td className="px-5 py-3.5 max-w-xs hidden md:table-cell">
                    <p className="truncate text-xs text-zinc-500">{getTargetLabel(t)}</p>
                  </td>

                  {/* Toggle */}
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => toggleMutation.mutate({ id: t.id, active: t.active })}
                      disabled={toggleMutation.isPending}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50",
                        t.active ? "bg-emerald-500" : "bg-zinc-600",
                      )}
                    >
                      <span className={cn(
                        "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                        t.active ? "translate-x-4" : "translate-x-0.5",
                      )} />
                    </button>
                    <span className={cn("ml-2 text-xs font-medium", t.active ? "text-emerald-400" : "text-zinc-500")}>
                      {t.active ? "Active" : "Off"}
                    </span>
                  </td>

                  {/* Delete */}
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => {
                        if (confirm(`Delete trigger for "${t.keyword}"?`)) {
                          deleteMutation.mutate(t.id);
                        }
                      }}
                      className="rounded-lg p-1.5 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewTriggerModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            void queryClient.invalidateQueries({ queryKey: qk.keywordTriggers });
          }}
        />
      )}
    </div>
  );
}
