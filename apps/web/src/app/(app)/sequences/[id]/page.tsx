"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Clock,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { DripEnrollment, DripSequenceDetail, DripStep } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Delay display helper ─────────────────────────────────────────────────────

function delayLabel(days: number, hours: number): string {
  if (days === 0 && hours === 0) return "Immediately";
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  return `After ${parts.join(" ")}`;
}

// ─── Step card ───────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  onEdit,
  onDelete,
}: {
  step: DripStep;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative flex gap-4">
      {/* Connector line */}
      <div className="flex flex-col items-center">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-400 ring-2 ring-violet-500/30">
          {index + 1}
        </div>
        {/* vertical line — shown for all but last */}
        <div className="mt-1 w-0.5 flex-1 bg-zinc-800" />
      </div>

      {/* Card */}
      <div className="group mb-4 flex-1 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
              <Clock className="size-3" />
              <span>{delayLabel(step.delayDays, step.delayHours)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-zinc-200">
              {step.message || <span className="italic text-zinc-500">(no message)</span>}
            </p>
          </div>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={onEdit}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="rounded-lg p-1.5 text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit step modal ──────────────────────────────────────────────────────────

function StepModal({
  sequenceId,
  step,
  nextSortOrder,
  onClose,
}: {
  sequenceId: string;
  step?: DripStep;
  nextSortOrder: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [sortOrder] = useState(step?.sortOrder ?? nextSortOrder);
  const [delayDays, setDelayDays] = useState(step?.delayDays ?? 0);
  const [delayHours, setDelayHours] = useState(step?.delayHours ?? 0);
  const [message, setMessage] = useState(step?.message ?? "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/sequences/${sequenceId}/steps`, {
        stepId: step?.id,
        sortOrder,
        delayDays,
        delayHours,
        message: message.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequence", sequenceId] });
      toast.success(step ? "Step updated" : "Step added");
      onClose();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {step ? "Edit Step" : `Add Step ${sortOrder}`}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Delay */}
          <div>
            <label className="mb-2 block text-xs font-medium text-zinc-400">
              Send delay {sortOrder === 1 ? "(after enrollment)" : "(after previous step)"}
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-zinc-500">Days</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={delayDays}
                  onChange={(e) => setDelayDays(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-zinc-500">Hours</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={delayHours}
                  onChange={(e) => setDelayHours(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
                />
              </div>
            </div>
            <p className="mt-1 text-xs text-zinc-600">
              {delayDays === 0 && delayHours === 0
                ? "Sends immediately when enrolled / previous step completes"
                : `Sends ${delayLabel(delayDays, delayHours).toLowerCase()} the previous step`}
            </p>
          </div>

          {/* Message */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Message *</label>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={"Hi {{name}}, thanks for subscribing!\n\nHere's something helpful…"}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-600">
              Use <code className="rounded bg-zinc-800 px-1 text-violet-400">{"{{name}}"}</code> to personalise with the subscriber&apos;s first name
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
          <button
            disabled={!message.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            <Save className="size-3.5" />
            {saveMutation.isPending ? "Saving…" : "Save Step"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Enrollments panel ────────────────────────────────────────────────────────

function EnrollmentsPanel({ sequenceId }: { sequenceId: string }) {
  const { data: enrollments = [] } = useQuery<DripEnrollment[]>({
    queryKey: ["enrollments", sequenceId],
    queryFn: async () => {
      const { data } = await api.get<DripEnrollment[]>(`/sequences/${sequenceId}/enrollments`);
      return data;
    },
  });

  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      await api.delete(`/sequences/${sequenceId}/enrollments/${enrollmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments", sequenceId] });
      toast.success("Enrollment cancelled");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const statusColors: Record<string, string> = {
    ACTIVE: "text-emerald-400",
    COMPLETED: "text-zinc-400",
    CANCELLED: "text-red-400",
    PAUSED: "text-amber-400",
  };

  if (enrollments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 py-10 text-center text-sm text-zinc-600">
        No enrollments yet — enroll subscribers from the Subscribers page
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-800/50">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Contact</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Phone</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Next Step</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">Next Send</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {enrollments.map((e) => {
            const name = [e.contactSubscription.contact.firstName, e.contactSubscription.contact.lastName].filter(Boolean).join(" ");
            return (
              <tr key={e.id} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 font-medium text-zinc-200">{name}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-400">{e.contactSubscription.contact.phone}</td>
                <td className="px-4 py-3">
                  <span className={cn("text-xs font-medium", statusColors[e.status] ?? "text-zinc-400")}>
                    {e.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-400">Step {e.nextStepOrder}</td>
                <td className="px-4 py-3 text-xs text-zinc-400">
                  {e.nextSendAt
                    ? new Date(e.nextSendAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {e.status === "ACTIVE" && (
                    <button
                      onClick={() => cancelMutation.mutate(e.id)}
                      className="rounded p-1.5 text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
                      title="Cancel enrollment"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [editingStep, setEditingStep] = useState<DripStep | null | "new">(null);

  const { data: sequence, isLoading } = useQuery<DripSequenceDetail>({
    queryKey: ["sequence", id],
    queryFn: async () => {
      const { data } = await api.get<DripSequenceDetail>(`/sequences/${id}`);
      return data;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async () => {
      const newStatus = sequence?.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
      await api.patch(`/sequences/${id}`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequence", id] });
      queryClient.invalidateQueries({ queryKey: ["sequences"] });
      toast.success("Status updated");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const deleteStep = useMutation({
    mutationFn: async (stepId: string) => {
      await api.delete(`/sequences/${id}/steps/${stepId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sequence", id] });
      toast.success("Step removed");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16 text-zinc-500">
        Loading sequence…
      </div>
    );
  }

  if (!sequence) {
    return (
      <div className="flex flex-col items-center gap-4 p-16 text-center">
        <p className="text-zinc-400">Sequence not found</p>
        <Link href="/sequences" className="text-sm text-violet-400 hover:text-violet-300">← Back to sequences</Link>
      </div>
    );
  }

  const steps = [...sequence.steps].sort((a, b) => a.sortOrder - b.sortOrder);
  const nextSortOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.sortOrder)) + 1 : 1;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/sequences" className="flex size-8 items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">{sequence.name}</h1>
            {sequence.description && (
              <p className="text-sm text-zinc-400">{sequence.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleStatus.mutate()}
            disabled={toggleStatus.isPending}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50",
              sequence.status === "ACTIVE"
                ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
            )}
          >
            {sequence.status === "ACTIVE" ? <><Pause className="size-3.5" /> Pause</> : <><Play className="size-3.5" /> Activate</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Steps builder — left/main column */}
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Steps ({steps.length})
            </h2>
            <button
              onClick={() => setEditingStep("new")}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white"
            >
              <Plus className="size-3.5" />
              Add Step
            </button>
          </div>

          {steps.length === 0 ? (
            <div
              onClick={() => setEditingStep("new")}
              className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-700 py-12 text-center hover:border-violet-500/50"
            >
              <div className="rounded-full bg-zinc-800 p-3">
                <MessageSquare className="size-6 text-zinc-500" />
              </div>
              <div>
                <p className="font-medium text-zinc-300">Add your first message step</p>
                <p className="mt-0.5 text-sm text-zinc-500">Click to add a step and start building your sequence</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {steps.map((step, i) => (
                <StepCard
                  key={step.id}
                  step={step}
                  index={i}
                  onEdit={() => setEditingStep(step)}
                  onDelete={() => {
                    if (confirm("Remove this step?")) deleteStep.mutate(step.id);
                  }}
                />
              ))}
              {/* Add step button at the end */}
              <button
                onClick={() => setEditingStep("new")}
                className="flex items-center gap-2 self-start rounded-lg border border-dashed border-zinc-700 px-3.5 py-2 text-xs font-medium text-zinc-500 hover:border-violet-500/50 hover:text-violet-400"
              >
                <Plus className="size-3.5" />
                Add another step
              </button>
            </div>
          )}
        </div>

        {/* Enrollments — right column */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Enrollments ({sequence._count.enrollments})
            </h2>
            <Link
              href="/subscribers"
              className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300"
            >
              <Users className="size-3.5" />
              Enroll subscribers
            </Link>
          </div>
          <EnrollmentsPanel sequenceId={id} />
        </div>
      </div>

      {/* Step modal */}
      {editingStep !== null && (
        <StepModal
          sequenceId={id}
          step={editingStep === "new" ? undefined : editingStep}
          nextSortOrder={nextSortOrder}
          onClose={() => setEditingStep(null)}
        />
      )}
    </div>
  );
}
