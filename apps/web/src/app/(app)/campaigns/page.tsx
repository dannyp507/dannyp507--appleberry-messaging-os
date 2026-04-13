"use client";

import { PageHeader } from "@/components/layout/page-header";
import { TablePageSkeleton } from "@/components/shell/page-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type {
  Campaign,
  CampaignStatus,
  ContactGroup,
  Template,
  WhatsAppAccount,
} from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Megaphone } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [waId, setWaId] = useState("__auto__");

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
  });

  const { data: accounts = [] } = useQuery({
    queryKey: qk.whatsappAccounts,
    queryFn: async () => {
      const { data } = await api.get<WhatsAppAccount[]>("/whatsapp/accounts");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/campaigns", {
        name,
        templateId,
        contactGroupId: groupId,
        whatsappAccountId:
          waId && waId !== "__auto__" ? waId : undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.campaigns });
      setOpen(false);
      setName("");
      setTemplateId("");
      setGroupId("");
      setWaId("__auto__");
      toast.success("Campaign created");
    },
    onError: (e) => toast.error("Could not create campaign", getApiErrorMessage(e)),
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
          <>
            <Button
              type="button"
              className="rounded-xl shadow-sm transition-shadow duration-200 hover:shadow-md"
              onClick={() => setOpen(true)}
            >
              New campaign
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="rounded-xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-xl">Create campaign</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <Label>Name</Label>
                    <Input
                      className="rounded-xl"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Template</Label>
                    <Select
                      value={templateId}
                      onValueChange={(v) => setTemplateId(v ?? "")}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select template" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Contact group</Label>
                    <Select
                      value={groupId}
                      onValueChange={(v) => setGroupId(v ?? "")}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select group" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>WhatsApp account (optional)</Label>
                    <Select
                      value={waId}
                      onValueChange={(v) => setWaId(v ?? "__auto__")}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Default / first available" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="__auto__">Let backend choose</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    className="rounded-xl"
                    disabled={
                      createMutation.isPending || !name || !templateId || !groupId
                    }
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Pair a template with a contact group and start reaching customers."
          action={
            <Button
              className="rounded-xl"
              type="button"
              onClick={() => setOpen(true)}
            >
              Create your first campaign
            </Button>
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
