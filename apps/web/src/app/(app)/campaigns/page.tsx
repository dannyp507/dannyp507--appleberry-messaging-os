"use client";

import { PageHeader } from "@/components/layout/page-header";
import { TablePageSkeleton } from "@/components/shell/page-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { Campaign, CampaignStatus, Template } from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone, Pause, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface ContactGroup { id: string; name: string; _count?: { members: number }; }

function statusVariant(
  s: CampaignStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "RUNNING":  return "default";
    case "PAUSED":   return "secondary";
    case "COMPLETED": return "outline";
    default:         return "secondary";
  }
}

function campaignProgress(c: Campaign): number {
  if (c.total <= 0) return 0;
  return Math.min(100, Math.round(((c.sent + c.failed + c.skipped) / c.total) * 100));
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [editName, setEditName] = useState("");
  const [editTemplateId, setEditTemplateId] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editAccountId, setEditAccountId] = useState("");

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: qk.campaigns,
    queryFn: async () => {
      const { data } = await api.get<Campaign[]>("/campaigns");
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

  const { data: groups = [] } = useQuery({
    queryKey: qk.contactGroups,
    queryFn: async () => {
      const { data } = await api.get<ContactGroup[]>("/contact-groups");
      return data;
    },
    staleTime: 60_000,
  });

  // Merge fetched groups with the editing campaign's embedded group so the
  // current group always appears in the dropdown, even before the query loads.
  const groupOptions: ContactGroup[] = editing?.contactGroup
    ? groups.some((g) => g.id === editing.contactGroup!.id)
      ? groups
      : [{ id: editing.contactGroup.id, name: editing.contactGroup.name }, ...groups]
    : groups;

  const { data: accounts = [] } = useQuery({
    queryKey: ["whatsapp-accounts"],
    queryFn: async () => {
      const { data } = await api.get<{ id: string; name: string; phoneNumber?: string }[]>("/whatsapp/accounts");
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/campaigns/${id}`); },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.campaigns });
      toast.success("Campaign deleted");
    },
    onError: (e) => toast.error("Could not delete campaign", getApiErrorMessage(e)),
  });

  const startMutation = useMutation({
    mutationFn: async (id: string) => { await api.post(`/campaigns/${id}/start`, {}); },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: qk.campaigns });
      const previous = queryClient.getQueryData<Campaign[]>(qk.campaigns);
      queryClient.setQueryData<Campaign[]>(qk.campaigns, (old) =>
        (old ?? []).map((c) => c.id === id ? { ...c, status: "RUNNING" as const } : c),
      );
      return { previous };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(qk.campaigns, ctx.previous);
      toast.error("Could not start campaign", getApiErrorMessage(e));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.campaigns }),
    onSuccess: () => toast.success("Campaign started"),
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => { await api.post(`/campaigns/${id}/pause`, {}); },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: qk.campaigns });
      const previous = queryClient.getQueryData<Campaign[]>(qk.campaigns);
      queryClient.setQueryData<Campaign[]>(qk.campaigns, (old) =>
        (old ?? []).map((c) => c.id === id ? { ...c, status: "PAUSED" as const } : c),
      );
      return { previous };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(qk.campaigns, ctx.previous);
      toast.error("Could not pause campaign", getApiErrorMessage(e));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.campaigns }),
    onSuccess: () => toast.success("Campaign paused"),
  });

  const resetMutation = useMutation({
    mutationFn: async (id: string) => { await api.post(`/campaigns/${id}/reset`, {}); },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.campaigns });
      toast.success("Campaign reset to Draft — you can now edit and restart it");
    },
    onError: (e) => toast.error("Could not reset campaign", getApiErrorMessage(e)),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: object }) => {
      await api.patch(`/campaigns/${id}`, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.campaigns });
      setEditOpen(false);
      setEditing(null);
      toast.success("Campaign updated");
    },
    onError: (e) => toast.error("Could not update campaign", getApiErrorMessage(e)),
  });

  const openEdit = (c: Campaign) => {
    setEditing(c);
    setEditName(c.name);
    setEditTemplateId(c.templateId);
    setEditGroupId(c.contactGroupId);
    setEditAccountId(c.whatsappAccountId ?? "");
    setEditOpen(true);
  };

  const handleEditSave = () => {
    if (!editing) return;
    editMutation.mutate({
      id: editing.id,
      payload: {
        name: editName,
        templateId: editTemplateId,
        contactGroupId: editGroupId,
        whatsappAccountId: editAccountId || undefined,
      },
    });
  };

  if (isLoading) return <TablePageSkeleton rows={8} />;

  return (
    <div className="page-container space-y-8">
      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => !editMutation.isPending && setEditOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Campaign</DialogTitle>
            <DialogDescription>
              Change the name, template, or contact group. Running campaigns must be paused first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Template</label>
              <select
                value={editTemplateId}
                onChange={(e) => setEditTemplateId(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— select template —</option>
                {/* Always include current template so it shows before full list loads */}
                {editing?.template && !templates.some((t) => t.id === editing.template!.id) && (
                  <option value={editing.template.id}>{editing.template.name}</option>
                )}
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Contact Group</label>
              <select
                value={editGroupId}
                onChange={(e) => setEditGroupId(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— select group —</option>
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}{g._count ? ` (${g._count.members} contacts)` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">WhatsApp Account</label>
              <select
                value={editAccountId}
                onChange={(e) => setEditAccountId(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— any connected account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name ?? a.phoneNumber ?? a.id}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl" onClick={() => setEditOpen(false)} disabled={editMutation.isPending}>Cancel</Button>
            <Button className="rounded-xl" onClick={handleEditSave} disabled={editMutation.isPending || !editName || !editTemplateId || !editGroupId}>
              {editMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageHeader
        title="Campaigns"
        description="Templates, audiences, and live delivery progress."
        action={
          <Link href="/campaigns/new">
            <Button type="button" className="rounded-xl shadow-sm transition-shadow duration-200 hover:shadow-md">
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
                const isRunning  = c.status === "RUNNING";
                const isDraft    = c.status === "DRAFT";
                const isPaused   = c.status === "PAUSED";
                const isCompleted = c.status === "COMPLETED";
                return (
                  <TableRow key={c.id} className="border-border/60 transition-colors duration-150 hover:bg-muted/40">
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(c.status)} className="rounded-lg px-2.5">
                        {isRunning ? "Sending" : isPaused ? "Paused" : c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Progress value={pct} className="h-2 rounded-full" />
                        <p className="text-xs text-muted-foreground">
                          {c.sent} / {c.total} sent · {c.failed} failed · {c.skipped} skipped
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.template?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.contactGroup?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {/* Report */}
                        <Link href={`/campaigns/${c.id}`}>
                          <Button size="sm" variant="ghost" className="rounded-xl text-[#6366F1] text-xs px-3">
                            Report
                          </Button>
                        </Link>

                        {/* Edit — not while running */}
                        {!isRunning && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl px-2.5"
                            title="Edit campaign"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        )}

                        {/* Restart (reset to DRAFT) — for COMPLETED or PAUSED */}
                        {(isCompleted || isPaused) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl px-2.5 text-amber-500 border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-400"
                            title="Reset & restart campaign"
                            onClick={() => resetMutation.mutate(c.id)}
                            disabled={resetMutation.isPending && resetMutation.variables === c.id}
                          >
                            {resetMutation.isPending && resetMutation.variables === c.id
                              ? <Loader2 className="size-3.5 animate-spin" />
                              : <RefreshCw className="size-3.5" />}
                          </Button>
                        )}

                        {/* Start — for DRAFT or PAUSED */}
                        {(isDraft || isPaused) && (
                          <Button
                            size="sm"
                            className="rounded-xl px-3"
                            onClick={() => startMutation.mutate(c.id)}
                            disabled={startMutation.isPending && startMutation.variables === c.id}
                          >
                            {startMutation.isPending && startMutation.variables === c.id
                              ? <Loader2 className="size-4 animate-spin" />
                              : "Start"}
                          </Button>
                        )}

                        {/* Pause — only when running */}
                        {isRunning && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-xl px-2.5"
                            title="Pause campaign"
                            onClick={() => pauseMutation.mutate(c.id)}
                            disabled={pauseMutation.isPending && pauseMutation.variables === c.id}
                          >
                            {pauseMutation.isPending && pauseMutation.variables === c.id
                              ? <Loader2 className="size-4 animate-spin" />
                              : <Pause className="size-3.5" />}
                          </Button>
                        )}

                        {/* Delete — not while running */}
                        {!isRunning && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-xl px-2.5 text-destructive hover:text-destructive"
                            title="Delete campaign"
                            onClick={() => deleteMutation.mutate(c.id)}
                            disabled={deleteMutation.isPending && deleteMutation.variables === c.id}
                          >
                            {deleteMutation.isPending && deleteMutation.variables === c.id
                              ? <Loader2 className="size-4 animate-spin" />
                              : <Trash2 className="size-3.5" />}
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
