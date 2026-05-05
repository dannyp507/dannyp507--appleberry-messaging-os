"use client";

import { StepList } from "@/components/chatbot/step-list";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, getApiErrorMessage } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { ChatbotFlowDetail, ChatbotFlowSummary } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot } from "lucide-react";
import { useState } from "react";

export default function ChatbotPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [flowName, setFlowName] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: flows = [], isLoading } = useQuery({
    queryKey: qk.chatbotFlows,
    queryFn: async () => {
      const { data } = await api.get<ChatbotFlowSummary[]>("/chatbot/flows");
      return data;
    },
  });

  const { data: detail } = useQuery({
    queryKey: qk.chatbotFlow(selectedId ?? ""),
    enabled: !!selectedId,
    queryFn: async () => {
      const { data } = await api.get<ChatbotFlowDetail>(`/chatbot/flows/${selectedId}`);
      return data;
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ChatbotFlowSummary>("/chatbot/flows", { name: flowName.trim() });
      return data;
    },
    onSuccess: (newFlow) => {
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      setCreateOpen(false);
      setFlowName("");
      setSelectedId(newFlow.id);
    },
    onError: (e) => toast.error("Could not create flow", getApiErrorMessage(e)),
  });

  const statusMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "ACTIVE") => {
      await api.patch(`/chatbot/flows/${selectedId}/status`, { status });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      if (selectedId) void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(selectedId) });
    },
    onError: (e) => toast.error("Could not update status", getApiErrorMessage(e)),
  });


  // ─────────────────────────────────────────────────────────────────────────────

  // ── Flow editor view ──────────────────────────────────────────────────────────
  if (selectedId && detail) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">

        {/* Back + flow name header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSelectedId(null)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ArrowLeft className="size-4" />
              All flows
            </button>
            <span className="text-muted-foreground/40">/</span>
            <h1 className="text-lg font-bold truncate">{detail.name}</h1>
            <Badge variant={detail.status === "ACTIVE" ? "default" : "secondary"} className="shrink-0">
              {detail.status}
            </Badge>
          </div>

          {/* Activate / Draft buttons */}
          <div className="flex gap-2 shrink-0">
            {detail.status === "ACTIVE" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => statusMutation.mutate("DRAFT")}
                disabled={statusMutation.isPending}
              >
                Set Draft
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => statusMutation.mutate("ACTIVE")}
                disabled={statusMutation.isPending}
              >
                Activate
              </Button>
            )}
          </div>
        </div>

        {/* Hint for empty / first use */}
        {detail.nodes.length === 0 && (
          <div className="rounded-2xl bg-muted/40 border border-border/50 px-4 py-3 flex items-start gap-3">
            <span className="text-xl shrink-0">💡</span>
            <div>
              <p className="text-sm font-semibold">How it works</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Add steps below — your bot will run them top to bottom when a customer messages.
                The first step is sent automatically. Use <strong>Ask question</strong> to collect
                info and <strong>Show buttons</strong> to give choices.
              </p>
            </div>
          </div>
        )}

        {/* The step list */}
        <StepList flowId={detail.id} detail={detail} />
      </div>
    );
  }

  // ── Flows list view ───────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <PageHeader
        title="Chatbot Flows"
        description="Build automated conversations step by step."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            + New flow
          </Button>
        }
      />

      {/* Flows list */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : flows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border py-16 text-center">
          <Bot className="size-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-semibold">No flows yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Create your first flow and build your bot step by step.
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            + Create my first flow
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {flows.map((flow) => (
            <div
              key={flow.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3.5 hover:border-border hover:shadow-sm transition-all cursor-pointer"
              onClick={() => setSelectedId(flow.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="size-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{flow.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {flow._count?.nodes ?? 0} steps
                  </p>
                </div>
              </div>
              <Badge variant={flow.status === "ACTIVE" ? "default" : "secondary"} className="shrink-0">
                {flow.status}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name your flow</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>Flow name</Label>
            <Input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              placeholder="e.g. Welcome Bot, Service Menu"
              onKeyDown={(e) => {
                if (e.key === "Enter" && flowName.trim().length >= 2) createMutation.mutate();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              disabled={createMutation.isPending || flowName.trim().length < 2}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Creating…" : "Create & open"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
