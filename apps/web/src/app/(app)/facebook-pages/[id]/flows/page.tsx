"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import type { ChatbotFlowSummary, FacebookPage } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  GitBranch,
  Plus,
  Play,
  Pause,
  Trash2,
  Loader2,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function FbPageFlowsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newFlowName, setNewFlowName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const { data: pages = [] } = useQuery({
    queryKey: qk.facebookPages,
    queryFn: async () => {
      const { data } = await api.get<FacebookPage[]>("/facebook/pages");
      return data;
    },
  });
  const page = pages.find((p) => p.id === id);

  const { data: flows = [], isLoading } = useQuery({
    queryKey: qk.fbPageFlows(id),
    queryFn: async () => {
      const { data } = await api.get<ChatbotFlowSummary[]>(
        `/chatbot/flows?facebookPageId=${id}`,
      );
      return data;
    },
    enabled: !!id,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await api.post<ChatbotFlowSummary>("/chatbot/flows", {
        name,
        facebookPageId: id,
      });
      return data;
    },
    onSuccess: (flow) => {
      queryClient.invalidateQueries({ queryKey: qk.fbPageFlows(id) });
      setShowCreate(false);
      setNewFlowName("");
      router.push(`/facebook-pages/${id}/flows/${flow.id}`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (flowId: string) => {
      await api.delete(`/chatbot/flows/${flowId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.fbPageFlows(id) });
      toast.success("Flow deleted");
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const toggleStatus = async (flow: ChatbotFlowSummary) => {
    const newStatus = flow.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    try {
      await api.patch(`/chatbot/flows/${flow.id}/status`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: qk.fbPageFlows(id) });
      toast.success(newStatus === "ACTIVE" ? "Flow activated" : "Flow deactivated");
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back nav */}
      <Link
        href={`/facebook-pages/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="size-4" />
        {page?.name ?? "Facebook Page"}
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <GitBranch className="size-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Messenger Flows</h1>
            <p className="text-sm text-muted-foreground">
              Visual chatbot flows for {page?.name ?? "this page"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20"
        >
          <Plus className="size-4" />
          New Flow
        </button>
      </div>

      {/* Create flow form */}
      {showCreate && (
        <div className="mb-6 p-4 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm">
          <p className="text-sm font-semibold mb-3">Create New Flow</p>
          <div className="flex gap-3">
            <input
              autoFocus
              value={newFlowName}
              onChange={(e) => setNewFlowName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFlowName.trim())
                  createMutation.mutate(newFlowName.trim());
                if (e.key === "Escape") {
                  setShowCreate(false);
                  setNewFlowName("");
                }
              }}
              placeholder="e.g. Welcome Sequence, Support Bot…"
              className="flex-1 rounded-xl border border-border/50 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <button
              onClick={() => {
                if (newFlowName.trim()) createMutation.mutate(newFlowName.trim());
              }}
              disabled={!newFlowName.trim() || createMutation.isPending}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Create"
              )}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewFlowName(""); }}
              className="px-4 py-2 border border-border/50 rounded-xl text-sm text-muted-foreground hover:bg-muted/50 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Flows list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 mb-4">
            <Workflow className="size-10 text-zinc-500" />
          </div>
          <p className="text-lg font-semibold text-zinc-300">No flows yet</p>
          <p className="text-sm text-zinc-500 mt-1 max-w-xs">
            Create your first Messenger chatbot flow. Drag and drop blocks to build
            automated conversations.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
          >
            <Plus className="size-4" />
            Create First Flow
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {flows.map((flow) => (
            <div
              key={flow.id}
              className="group flex items-center gap-4 p-4 rounded-2xl border border-border/50 bg-card/40 hover:bg-card/70 backdrop-blur-sm transition-all cursor-pointer"
              onClick={() => router.push(`/facebook-pages/${id}/flows/${flow.id}`)}
            >
              {/* Status dot */}
              <div
                className={cn(
                  "size-2.5 rounded-full shrink-0",
                  flow.status === "ACTIVE"
                    ? "bg-emerald-400 shadow-sm shadow-emerald-400/50"
                    : "bg-zinc-500",
                )}
              />

              {/* Flow info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{flow.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {flow._count?.nodes ?? 0} nodes · {flow._count?.edges ?? 0} edges ·{" "}
                  {timeAgo(flow.createdAt)}
                </p>
              </div>

              {/* Status badge */}
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full",
                  flow.status === "ACTIVE"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-zinc-700/50 text-zinc-400",
                )}
              >
                {flow.status}
              </span>

              {/* Actions */}
              <div
                className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => toggleStatus(flow)}
                  title={flow.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {flow.status === "ACTIVE" ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this flow?"))
                      deleteMutation.mutate(flow.id);
                  }}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
