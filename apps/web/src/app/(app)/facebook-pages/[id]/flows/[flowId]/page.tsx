"use client";

import { FbFlowBuilder } from "@/components/fb-flow/fb-flow-builder";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { ChatbotFlowDetail, FacebookPage } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, GitBranch } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

export default function FbFlowBuilderPage() {
  const { id, flowId } = useParams<{ id: string; flowId: string }>();

  const { data: pages = [] } = useQuery({
    queryKey: qk.facebookPages,
    queryFn: async () => {
      const { data } = await api.get<FacebookPage[]>("/facebook/pages");
      return data;
    },
  });
  const page = pages.find((p) => p.id === id);

  const {
    data: flow,
    isLoading,
    error,
  } = useQuery({
    queryKey: qk.chatbotFlow(flowId),
    queryFn: async () => {
      const { data } = await api.get<ChatbotFlowDetail>(`/chatbot/flows/${flowId}`);
      return data;
    },
    enabled: !!flowId,
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !flow) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
        <p className="text-destructive font-semibold">Failed to load flow</p>
        <p className="text-sm text-muted-foreground">{getApiErrorMessage(error)}</p>
        <Link
          href={`/facebook-pages/${id}/flows`}
          className="text-sm text-indigo-400 hover:underline"
        >
          ← Back to flows
        </Link>
      </div>
    );
  }

  return (
    // 56px = h-14 TopBar; fills remaining viewport height
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 h-12 flex items-center gap-3 px-4 bg-white border-b border-zinc-200 z-10">
        {/* Back */}
        <Link
          href={`/facebook-pages/${id}/flows`}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 transition-colors shrink-0"
        >
          <ArrowLeft className="size-3.5" />
          <span className="hidden sm:inline">{page?.name ?? "Flows"}</span>
        </Link>

        <span className="text-zinc-300 text-xs">/</span>

        <div className="flex items-center gap-2 min-w-0">
          <GitBranch className="size-3.5 text-purple-500 shrink-0" />
          <span className="text-sm font-semibold text-zinc-800 truncate">{flow.name}</span>
        </div>

        {/* Status badge */}
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0",
            flow.status === "ACTIVE"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-500",
          )}
        >
          {flow.status}
        </span>

        <div className="ml-auto flex items-center gap-2 text-[10px] text-zinc-400">
          <span>Delete key removes selected node</span>
          <span className="hidden sm:inline">· Click edge to delete connection</span>
        </div>
      </header>

      {/* ── Builder fills remaining height ───────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <FbFlowBuilder flow={flow} facebookPageId={id} />
      </div>
    </div>
  );
}
