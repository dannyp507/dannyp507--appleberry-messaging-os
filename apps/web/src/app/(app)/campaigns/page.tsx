"use client";

import { PageHeader } from "@/components/layout/page-header";
import { TablePageSkeleton } from "@/components/shell/page-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { Campaign, CampaignStatus } from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function statusVariant(
  s: CampaignStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "RUNNING":
      return "default";
    case "PAUSED":
      return "secondary";
    case "COMPLETED":
      return "outline";
    default:
      return "secondary";
  }
}

function campaignProgress(c: Campaign): number {
  if (c.total <= 0) return 0;
  return Math.min(100, Math.round(((c.sent + c.failed + c.skipped) / c.total) * 100));
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: qk.campaigns,
    queryFn: async () => {
      const { data } = await api.get<Campaign[]>("/campaigns");
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/campaigns/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.campaigns });
      toast.success("Campaign deleted");
    },
    onError: (e) => toast.error("Could not delete campaign", getApiErrorMessage(e)),
  });

  const startMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/campaigns/${id}/start`, {});
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: qk.campaigns });
      const previous = queryClient.getQueryData<Campaign[]>(qk.campaigns);
      queryClient.setQueryData<Campaign[]>(qk.campaigns, (old) =>
        (old ?? []).map((c) =>
          c.id === id ? { ...c, status: "RUNNING" as const } : c,
        ),
      );
      return { previous };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(qk.campaigns, ctx.previous);
      }
      toast.error("Could not start campaign", getApiErrorMessage(e));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.campaigns }),
    onSuccess: () => toast.success("Campaign started"),
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/campaigns/${id}/pause`, {});
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: qk.campaigns });
      const previous = queryClient.getQueryData<Campaign[]>(qk.campaigns);
      queryClient.setQueryData<Campaign[]>(qk.campaigns, (old) =>
        (old ?? []).map((c) =>
          c.id === id ? { ...c, status: "PAUSED" as const } : c,
        ),
      );
      return { previous };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(qk.campaigns, ctx.previous);
      }
      toast.error("Could not pause campaign", getApiErrorMessage(e));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.campaigns }),
    onSuccess: () => toast.success("Campaign paused"),
  });

  if (isLoading) {
    return <TablePageSkeleton rows={8} />;
  }

  return (
    <div className="page-container space-y-8">
      <PageHeader
        title="Campaigns"
        description="Templates, audiences, and live delivery progress."
        action={
          <Link href="/campaigns/new">
            <Button
              type="button"
              className="rounded-xl shadow-sm transition-shadow duration-200 hover:shadow-md"
            >
              <Plus className="mr-2 size-4" />
              New campaign
            </Button>
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Pair a template with a contact group and start reaching customers."
          action={
            <Link href="/campaigns/new">
              <Button className="rounded-xl" type="button">
                <Plus className="mr-2 size-4" />
                Create your first campaign
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-md">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="min-w-[200px] font-semibold">Progress</TableHead>
                <TableHead className="font-semibold">Template</TableHead>
                <TableHead className="font-semibold">Group</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => {
                const pct = campaignProgress(c);
                return (
                  <TableRow
                    key={c.id}
                    className="border-border/60 transition-colors duration-150 hover:bg-muted/40"
                  >
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={statusVariant(c.status)}
                        className="rounded-lg px-2.5"
                      >
                        {c.status === "RUNNING"
                          ? "Sending"
                          : c.status === "PAUSED"
                            ? "Paused"
                            : c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Progress value={pct} className="h-2 rounded-full" />
                        <p className="text-xs text-muted-foreground">
                          {c.sent} / {c.total} sent · {c.failed} failed · {c.skipped}{" "}
                          skipped
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.template?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.contactGroup?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/campaigns/${c.id}`}>
                          <Button size="sm" variant="ghost" className="rounded-xl text-[#6366F1]">Report</Button>
                        </Link>
                        {(c.status === "DRAFT" || c.status === "PAUSED") && (
                          <Button
                            size="sm"
                            className="rounded-xl"
                            onClick={() => startMutation.mutate(c.id)}
                            disabled={
                              startMutation.isPending &&
                              startMutation.variables === c.id
                            }
                          >
                            {startMutation.isPending &&
                            startMutation.variables === c.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              "Start"
                            )}
                          </Button>
                        )}
                        {c.status === "RUNNING" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-xl"
                            onClick={() => pauseMutation.mutate(c.id)}
                            disabled={
                              pauseMutation.isPending &&
                              pauseMutation.variables === c.id
                            }
                          >
                            {pauseMutation.isPending &&
                            pauseMutation.variables === c.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              "Pause"
                            )}
                          </Button>
                        )}
                        {(c.status === "DRAFT" || c.status === "COMPLETED") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-xl text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate(c.id)}
                            disabled={deleteMutation.isPending && deleteMutation.variables === c.id}
                          >
                            {deleteMutation.isPending && deleteMutation.variables === c.id
                              ? <Loader2 className="size-4 animate-spin" />
                              : <Trash2 className="size-4" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
