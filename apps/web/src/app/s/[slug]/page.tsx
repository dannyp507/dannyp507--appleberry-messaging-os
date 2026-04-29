"use client";

import { use, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, PhoneCall } from "lucide-react";
import { AppleberryIcon } from "@/components/ui/appleberry-icon";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { SubscribeFormPublicConfig } from "@/lib/api/types";
import { useQuery, useMutation } from "@tanstack/react-query";
import { QueryProvider } from "@/providers/query-provider";

// ─── Inner page (needs QueryProvider) ────────────────────────────────────────

function SubscribePage({ slug }: { slug: string }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [done, setDone]           = useState(false);
  const [errorMsg, setErrorMsg]   = useState("");

  const { data: config, isLoading, error } = useQuery<SubscribeFormPublicConfig>({
    queryKey: ["public-form", slug],
    queryFn: async () => {
      const { data } = await api.get<SubscribeFormPublicConfig>(
        `/public/forms/${slug}`,
      );
      return data;
    },
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/public/forms/${slug}/submit`, {
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        phone: phone.trim(),
      });
    },
    onSuccess: () => setDone(true),
    onError: (err) => setErrorMsg(getApiErrorMessage(err)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!firstName.trim()) { setErrorMsg("First name is required"); return; }
    if (!phone.trim())     { setErrorMsg("Phone number is required"); return; }
    submitMutation.mutate();
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="size-8 animate-spin text-violet-400" />
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────────
  if (error || !config) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-4 text-center">
        <MessageCircle className="size-12 text-zinc-700" />
        <p className="text-lg font-medium text-zinc-300">Form not found</p>
        <p className="text-sm text-zinc-600">This subscribe form may have been removed or paused.</p>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-4 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="size-10 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-white">You&apos;re subscribed!</h2>
          <p className="mt-2 text-zinc-400">
            Keep an eye on your WhatsApp — you&apos;ll receive a message shortly.
          </p>
        </div>
        <p className="text-xs text-zinc-600">
          Powered by{" "}
          <a href="https://appleberry-app.duckdns.org" className="text-violet-400 hover:underline">
            Appleberry
          </a>
        </p>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-zinc-900 shadow-md">
            <AppleberryIcon size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white">{config.name}</h1>
          {config.description && (
            <p className="text-sm text-zinc-400">{config.description}</p>
          )}
          <p className="text-xs text-zinc-600">from {config.workspace.name}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">First name *</label>
              <input
                autoFocus
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              WhatsApp number *
            </label>
            <div className="relative">
              <PhoneCall className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+27 82 000 0000"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 pl-10 pr-4 text-sm text-zinc-200 placeholder-zinc-600 focus:border-violet-500 focus:outline-none"
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-600">
              Include your country code, e.g. +27 for South Africa
            </p>
          </div>

          {errorMsg && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={submitMutation.isPending}
            className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 py-3.5 text-sm font-semibold text-white shadow-lg hover:bg-violet-500 disabled:opacity-60"
          >
            {submitMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessageCircle className="size-4" />
            )}
            {submitMutation.isPending ? "Subscribing…" : "Subscribe on WhatsApp"}
          </button>

          <p className="text-center text-[11px] text-zinc-600">
            By subscribing you agree to receive WhatsApp messages. Reply STOP to unsubscribe at any time.
          </p>
        </form>

        <p className="mt-8 text-center text-xs text-zinc-700">
          Powered by{" "}
          <a href="https://appleberry-app.duckdns.org" className="text-zinc-500 hover:text-zinc-400">
            Appleberry
          </a>
        </p>
      </div>
    </div>
  );
}

// ─── Export (wrap with QueryProvider since it's outside the app layout) ───────

export default function PublicSubscribePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <QueryProvider>
      <SubscribePage slug={slug} />
    </QueryProvider>
  );
}
