"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  FileInput,
  Plus,
  QrCode,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { DripSequenceSummary, SubscribeForm, WhatsAppAccount } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Form Modal ───────────────────────────────────────────────────────────────

function FormModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: SubscribeForm;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName]               = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [accountId, setAccountId]     = useState(existing?.whatsappAccountId ?? "");
  const [sequenceId, setSequenceId]   = useState(existing?.sequenceId ?? "");
  const [welcome, setWelcome]         = useState(existing?.welcomeMessage ?? "");

  const { data: accounts = [] } = useQuery<WhatsAppAccount[]>({
    queryKey: ["whatsapp-accounts"],
    queryFn: async () => { const { data } = await api.get("/whatsapp-accounts"); return data; },
  });
  const { data: sequences = [] } = useQuery<DripSequenceSummary[]>({
    queryKey: ["sequences"],
    queryFn: async () => { const { data } = await api.get("/sequences"); return data; },
  });
  const activeSequences = sequences.filter((s) => s.status === "ACTIVE");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        whatsappAccountId: accountId,
        sequenceId: sequenceId || undefined,
        welcomeMessage: welcome.trim() || undefined,
      };
      if (existing) {
        await api.patch(`/subscribe-forms/${existing.id}`, body);
      } else {
        await api.post("/subscribe-forms", body);
      }
    },
    onSuccess: () => {
      toast.success(existing ? "Form updated" : "Form created");
      onSaved();
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const canSave = name.trim().length >= 2 && accountId.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">
            {existing ? "Edit Subscribe Form" : "New Subscribe Form"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Page title *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Get exclusive deals on WhatsApp"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Shown below the title on the form page…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-violet-500 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">WhatsApp Account *</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.phone ? ` (${a.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Welcome message
              <span className="ml-1 text-zinc-600">(sent on subscribe)</span>
            </label>
            <textarea
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              rows={3}
              placeholder={"Hi {{name}}! Thanks for subscribing. We'll keep you updated with the latest deals."}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-violet-500 focus:outline-none resize-none"
            />
            <p className="mt-1 text-[10px] text-zinc-600">Use <code className="rounded bg-zinc-800 px-1">{"{{name}}"}</code> to personalise with first name</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Auto-enroll in sequence
              <span className="ml-1 text-zinc-600">(optional)</span>
            </label>
            <select
              value={sequenceId}
              onChange={(e) => setSequenceId(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
            >
              <option value="">No sequence</option>
              {activeSequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s._count.steps} step{s._count.steps !== 1 ? "s" : ""})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
          <button
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            {saveMutation.isPending ? "Saving…" : existing ? "Save Changes" : "Create Form"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function getPublicUrl(slug: string) {
  return `${typeof window !== "undefined" ? window.location.origin : "https://appleberry-app.duckdns.org"}/s/${slug}`;
}

export default function SubscribeFormsPage() {
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<SubscribeForm | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: forms = [], isLoading } = useQuery<SubscribeForm[]>({
    queryKey: ["subscribe-forms"],
    queryFn: async () => {
      const { data } = await api.get<SubscribeForm[]>("/subscribe-forms");
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await api.patch(`/subscribe-forms/${id}`, { active: !active });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subscribe-forms"] }),
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/subscribe-forms/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscribe-forms"] });
      toast.success("Form deleted");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const handleCopy = (slug: string) => {
    navigator.clipboard.writeText(getPublicUrl(slug));
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Subscribe Forms</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Shareable opt-in pages — collect phone numbers from your website, ads, or QR codes
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-violet-500"
        >
          <Plus className="size-4" />
          New Form
        </button>
      </div>

      {/* How it works blurb */}
      <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3.5">
        <Zap className="mt-0.5 size-4 shrink-0 text-violet-400" />
        <p className="text-xs text-zinc-400">
          Each form gets a shareable URL you can put on your website, Instagram bio, or QR code.
          When someone fills it in, they&apos;re subscribed to your WhatsApp account and optionally
          enrolled in a drip sequence automatically.
        </p>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
          ))}
        </div>
      ) : forms.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-800 py-16 text-center">
          <div className="rounded-full bg-violet-500/10 p-4">
            <FileInput className="size-8 text-violet-400" />
          </div>
          <div>
            <p className="font-medium text-zinc-300">No subscribe forms yet</p>
            <p className="mt-1 text-sm text-zinc-500">
              Create a form to start growing your subscriber list from outside WhatsApp
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500"
          >
            <Plus className="size-4" />
            New Form
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {forms.map((form) => (
            <div key={form.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-start justify-between gap-4">
                {/* Left: info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-zinc-100">{form.name}</span>
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                      form.active
                        ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                        : "bg-zinc-700/60 text-zinc-500 ring-zinc-600/40",
                    )}>
                      {form.active ? "Active" : "Paused"}
                    </span>
                  </div>
                  {form.description && (
                    <p className="mt-0.5 text-xs text-zinc-500 truncate">{form.description}</p>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      {form.submissionsCount.toLocaleString()} submission{form.submissionsCount !== 1 ? "s" : ""}
                    </span>
                    <span className="text-zinc-700">·</span>
                    <span>{form.whatsappAccount.name}</span>
                    {form.sequence && (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span className="text-violet-400">→ {form.sequence.name}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleMutation.mutate({ id: form.id, active: form.active })}
                    disabled={toggleMutation.isPending}
                    title={form.active ? "Pause form" : "Activate form"}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
                  >
                    {form.active ? <CheckCircle2 className="size-4 text-emerald-400" /> : <CheckCircle2 className="size-4" />}
                  </button>
                  {/* Edit */}
                  <button
                    onClick={() => setEditing(form)}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  >
                    <QrCode className="size-4" />
                  </button>
                  {/* Delete */}
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${form.name}"?`)) deleteMutation.mutate(form.id);
                    }}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              {/* URL row */}
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2">
                <span className="flex-1 truncate font-mono text-xs text-zinc-400">
                  {getPublicUrl(form.slug)}
                </span>
                <button
                  onClick={() => handleCopy(form.slug)}
                  title="Copy link"
                  className="shrink-0 rounded p-1 text-zinc-500 hover:text-zinc-300"
                >
                  {copied === form.slug
                    ? <CheckCircle2 className="size-3.5 text-emerald-400" />
                    : <ClipboardCopy className="size-3.5" />}
                </button>
                <a
                  href={getPublicUrl(form.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded p-1 text-zinc-500 hover:text-zinc-300"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <FormModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            queryClient.invalidateQueries({ queryKey: ["subscribe-forms"] });
          }}
        />
      )}
      {editing && (
        <FormModal
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["subscribe-forms"] });
          }}
        />
      )}
    </div>
  );
}
