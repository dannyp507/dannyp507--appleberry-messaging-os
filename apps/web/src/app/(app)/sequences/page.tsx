"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Activity,
  Archive,
  ChevronRight,
  Clock,
  ListOrdered,
  PauseCircle,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { DripSequenceSummary } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Status badge ─────────────────────────────────────────────────────────────

function SequenceStatusBadge({ status }: { status: DripSequenceSummary["status"] }) {
  const map = {
    ACTIVE: { label: "Active", className: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" },
    PAUSED: { label: "Paused", className: "bg-amber-500/10 text-amber-400 ring-amber-500/20" },
    ARCHIVED: { label: "Archived", className: "bg-zinc-700/60 text-zinc-500 ring-zinc-600/40" },
  };
  const { label, className } = map[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", className)}>
      {label}
    </span>
  );
}

// ─── New sequence modal ───────────────────────────────────────────────────────

function NewSequenceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<DripSequenceSummary>("/sequences", { name, description });
      return data;
    },
    onSuccess: (data) => {
      toast.success("Sequence created");
      onCreated(data.id);
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-white">New Drip Sequence</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Welcome Sequence"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
          <button
            disabled={!name.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating…" : "Create & Edit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SequencesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);

  const { data: sequences = [], isLoading } = useQuery<DripSequenceSummary[]>({
    queryKey: ["sequences"],
    queryFn: async () => {
      const { data } = await api.get<DripSequenceSummary[]>("/sequences");
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/sequences/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequences"] });
      toast.success("Sequence deleted");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const activeCount = sequences.filter((s) => s.status === "ACTIVE").length;
  const totalEnrollments = sequences.reduce((sum, s) => sum + s._count.enrollments, 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Drip Sequences</h1>
          <p className="text-sm text-zinc-400">Schedule a series of messages sent automatically after someone subscribes</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-violet-500"
        >
          <Plus className="size-4" />
          New Sequence
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { icon: <ListOrdered className="size-4" />, label: "Total Sequences", value: sequences.length, color: "indigo" },
          { icon: <Activity className="size-4" />, label: "Active", value: activeCount, color: "emerald" },
          { icon: <Users className="size-4" />, label: "Total Enrollments", value: totalEnrollments, color: "violet" },
        ].map(({ icon, label, value, color }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3.5">
            <div className={cn("rounded-lg p-2", {
              "bg-indigo-500/10 text-indigo-400": color === "indigo",
              "bg-emerald-500/10 text-emerald-400": color === "emerald",
              "bg-violet-500/10 text-violet-400": color === "violet",
            })}>{icon}</div>
            <div>
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-xl font-semibold text-white">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
          ))}
        </div>
      ) : sequences.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-800 py-16 text-center">
          <div className="rounded-full bg-violet-500/10 p-4">
            <ListOrdered className="size-8 text-violet-400" />
          </div>
          <div>
            <p className="font-medium text-zinc-300">No sequences yet</p>
            <p className="mt-1 text-sm text-zinc-500">Create your first drip sequence to start sending automated follow-up messages</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500"
          >
            <Plus className="size-4" />
            New Sequence
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sequences.map((seq) => (
            <div
              key={seq.id}
              className="group flex cursor-pointer items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
              onClick={() => router.push(`/sequences/${seq.id}`)}
            >
              {/* Icon */}
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
                <ListOrdered className="size-5" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-100">{seq.name}</span>
                  <SequenceStatusBadge status={seq.status} />
                </div>
                {seq.description && (
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{seq.description}</p>
                )}
                <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {seq._count.steps} step{seq._count.steps !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {seq._count.enrollments} enrolled
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${seq.name}"? This will cancel all active enrollments.`)) {
                      deleteMutation.mutate(seq.id);
                    }
                  }}
                  className="rounded-lg p-2 text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              <ChevronRight className="size-4 shrink-0 text-zinc-600 group-hover:text-zinc-400" />
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <NewSequenceModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            router.push(`/sequences/${id}`);
          }}
        />
      )}
    </div>
  );
}
