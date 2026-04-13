"use client";

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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { TelegramAccount } from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, Trash2 } from "lucide-react";
import { useState } from "react";

export default function TelegramAccountsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [botToken, setBotToken] = useState("");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: qk.telegramAccounts,
    queryFn: async () => {
      const { data } = await api.get<TelegramAccount[]>("/telegram/accounts");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/telegram/accounts", { name, botToken });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.telegramAccounts });
      setOpen(false);
      setName("");
      setBotToken("");
      toast.success("Telegram bot connected");
    },
    onError: (e) =>
      toast.error("Could not connect bot", getApiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/telegram/accounts/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.telegramAccounts });
      toast.success("Account removed");
    },
    onError: (e) => toast.error("Could not remove account", getApiErrorMessage(e)),
  });

  const webhookMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/telegram/accounts/${id}/set-webhook`, {});
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.telegramAccounts });
      toast.success("Webhook configured");
    },
    onError: (e) => toast.error("Webhook failed", getApiErrorMessage(e)),
  });

  return (
    <div className="page-container space-y-8">
      <PageHeader
        title="Telegram Accounts"
        description="Connect Telegram bots to receive and send messages."
        action={
          <>
            <Button
              type="button"
              className="rounded-xl shadow-sm transition-shadow duration-200 hover:shadow-md"
              onClick={() => setOpen(true)}
            >
              Connect bot
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="rounded-xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-xl">Connect Telegram bot</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <Label>Display name</Label>
                    <Input
                      className="rounded-xl"
                      placeholder="e.g. Support Bot"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Bot token</Label>
                    <Input
                      className="rounded-xl font-mono text-sm"
                      placeholder="123456:ABC-DEF..."
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Get your token from{" "}
                      <span className="font-medium text-foreground">@BotFather</span> on Telegram.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    className="rounded-xl"
                    disabled={createMutation.isPending || !name || botToken.length < 30}
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    Connect
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {isLoading ? null : accounts.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No Telegram bots connected"
          description="Create a bot via @BotFather on Telegram, then paste the token here."
          action={
            <Button className="rounded-xl" type="button" onClick={() => setOpen(true)}>
              Connect your first bot
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-md">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Username</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Webhook</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((acc) => (
                <TableRow
                  key={acc.id}
                  className="border-border/60 transition-colors duration-150 hover:bg-muted/40"
                >
                  <TableCell className="font-medium">{acc.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {acc.botUsername ? `@${acc.botUsername}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={acc.isActive ? "default" : "secondary"}
                      className="rounded-lg px-2.5"
                    >
                      {acc.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={acc.webhookSet ? "outline" : "secondary"}
                      className="rounded-lg px-2.5"
                    >
                      {acc.webhookSet ? "Set" : "Not set"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!acc.webhookSet && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl"
                          disabled={
                            webhookMutation.isPending &&
                            webhookMutation.variables === acc.id
                          }
                          onClick={() => webhookMutation.mutate(acc.id)}
                        >
                          {webhookMutation.isPending &&
                          webhookMutation.variables === acc.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            "Set webhook"
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-xl text-destructive hover:text-destructive"
                        disabled={
                          deleteMutation.isPending &&
                          deleteMutation.variables === acc.id
                        }
                        onClick={() => deleteMutation.mutate(acc.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
