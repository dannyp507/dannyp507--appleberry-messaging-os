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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { AutoresponderRule, WhatsAppAccount } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  List,
  Loader2,
  PhoneCall,
  Plus,
  QrCode,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";

type LinkMode = "qr" | "pairing";

export default function WhatsAppAccountsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState("BAILEYS");

  // Pairing/QR flow state
  const [pairingAccountId, setPairingAccountId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<LinkMode>("qr");
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<string>("PENDING_QR");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: qk.whatsappAccounts,
    queryFn: async () => {
      const { data } = await api.get<WhatsAppAccount[]>("/whatsapp/accounts");
      return data;
    },
    refetchInterval: 10000, // refresh every 10s to pick up status changes
  });

  const { data: rules = [] } = useQuery({
    queryKey: qk.autoresponderRules,
    queryFn: async () => {
      const { data } = await api.get<AutoresponderRule[]>("/autoresponder/rules");
      return data;
    },
  });

  // Per-account item counts (account-scoped + workspace-wide rules apply to all)
  const accountActiveItems = (accountId: string) =>
    rules.filter((r) => (r.whatsappAccountId === accountId || r.whatsappAccountId === null) && r.active).length;
  const accountTotalItems = (accountId: string) =>
    rules.filter((r) => r.whatsappAccountId === accountId || r.whatsappAccountId === null).length;

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<WhatsAppAccount>("/whatsapp/accounts", {
        name,
        providerType,
      });
      return data;
    },
    onSuccess: (account) => {
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      setOpen(false);
      setName("");
      setProviderType("BAILEYS");
      if (account.providerType === "BAILEYS") {
        openLinkModal(account.id);
      } else {
        toast.success("Account added");
      }
    },
    onError: () => toast.error("Could not add account"),
  });

  const pairingMutation = useMutation({
    mutationFn: async ({ id, phone }: { id: string; phone: string }) => {
      const { data } = await api.post<{ code: string }>(
        `/whatsapp/accounts/${id}/pairing-code`,
        { phone }
      );
      return data.code;
    },
    onSuccess: (code) => setPairingCode(code),
    onError: () => toast.error("Could not get pairing code. Make sure the account session is starting."),
  });

  const connectMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/whatsapp/accounts/${id}/disconnect`, {}).catch(() => {});
      await api.post(`/whatsapp/accounts/${id}/connect`, {});
    },
    onError: () => toast.error("Could not start session"),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/whatsapp/accounts/${id}/disconnect`, {});
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      toast.success("Disconnected");
    },
    onError: () => toast.error("Could not disconnect"),
  });

  const { data: statusData } = useQuery({
    queryKey: ["wa-pairing-status", pairingAccountId],
    enabled: !!pairingAccountId && pairingStatus !== "CONNECTED",
    refetchInterval: 3000,
    queryFn: async () => {
      const { data } = await api.get<{ qrDataUrl: string | null; status: string }>(
        `/whatsapp/accounts/${pairingAccountId}/qr`
      );
      return data;
    },
  });

  useEffect(() => {
    if (!statusData) return;
    setPairingStatus(statusData.status);
    if (statusData.status === "CONNECTED") {
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      toast.success("WhatsApp connected!");
    }
  }, [statusData, queryClient]);

  const closeLinkModal = () => {
    setPairingAccountId(null);
    setPairingCode(null);
    setPairingPhone("");
    setPairingStatus("PENDING_QR");
    setLinkMode("qr");
  };

  const openLinkModal = (id: string) => {
    setPairingAccountId(id);
    setPairingCode(null);
    setPairingPhone("");
    setPairingStatus("PENDING_QR");
    setLinkMode("qr");
    connectMutation.mutate(id);
  };

  const switchToQr = () => {
    setLinkMode("qr");
    setPairingCode(null);
    if (pairingAccountId) connectMutation.mutate(pairingAccountId);
  };

  const qrDataUrl = statusData?.qrDataUrl ?? null;

  return (
    <div className="page-container space-y-8">
      <PageHeader
        title="WhatsApp Accounts"
        description="Each connected number runs your chatbot items automatically."
        action={
          <>
            <Button
              type="button"
              className="rounded-xl shadow-sm hover:shadow-md"
              onClick={() => setOpen(true)}
            >
              <Plus className="mr-1.5 size-4" />
              Add account
            </Button>

            {/* Create dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="rounded-xl sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-xl">New WhatsApp account</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <Label>Display name</Label>
                    <Input
                      className="rounded-xl"
                      placeholder="e.g. Support Line"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Provider</Label>
                    <Select value={providerType} onValueChange={(v) => setProviderType(v ?? "BAILEYS")}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="BAILEYS">Phone pairing code (Baileys)</SelectItem>
                        <SelectItem value="CLOUD">Meta Cloud API</SelectItem>
                        <SelectItem value="MOCK">Mock (testing)</SelectItem>
                      </SelectContent>
                    </Select>
                    {providerType === "BAILEYS" && (
                      <p className="text-xs text-muted-foreground">
                        After saving, scan the QR code to link your WhatsApp number.
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    className="rounded-xl"
                    disabled={createMutation.isPending || name.length < 2}
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {providerType === "BAILEYS" ? "Save & link phone" : "Save"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Link modal — QR + pairing code */}
            <Dialog open={!!pairingAccountId} onOpenChange={closeLinkModal}>
              <DialogContent className="rounded-xl sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <Smartphone className="size-5" />
                    Link WhatsApp
                  </DialogTitle>
                </DialogHeader>

                {pairingStatus === "CONNECTED" ? (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
                      <Wifi className="size-8 text-emerald-500" />
                    </div>
                    <p className="font-semibold text-emerald-500">Connected successfully!</p>
                    <p className="text-center text-sm text-muted-foreground">
                      Your WhatsApp number is now live and ready.
                    </p>
                    <Button className="rounded-xl" onClick={closeLinkModal}>Done</Button>
                  </div>
                ) : linkMode === "qr" ? (
                  <div className="flex flex-col items-center gap-4 py-2">
                    <p className="text-sm text-center text-muted-foreground">
                      Open WhatsApp → Settings → Linked Devices → Link a Device, then scan this QR code.
                    </p>

                    {connectMutation.isPending ? (
                      <div className="flex size-[260px] items-center justify-center rounded-xl border border-border/60 bg-muted/30">
                        <Loader2 className="size-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : qrDataUrl ? (
                      <div className="rounded-xl overflow-hidden border border-border/60 shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrDataUrl} alt="WhatsApp QR code" width={260} height={260} />
                      </div>
                    ) : (
                      <div className="flex size-[260px] items-center justify-center rounded-xl border border-border/60 bg-muted/30">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <QrCode className="size-8" />
                          <span className="text-xs">Generating QR…</span>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground text-center">
                      QR code refreshes automatically. Scan it quickly.
                    </p>
                    <button
                      className="text-xs text-primary underline underline-offset-2"
                      onClick={() => { setLinkMode("pairing"); setPairingCode(null); }}
                    >
                      Use pairing code instead
                    </button>
                  </div>
                ) : pairingCode ? (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <p className="text-sm text-center text-muted-foreground">
                      Open WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number instead
                    </p>
                    <div className="flex items-center justify-center rounded-xl border-2 border-primary/30 bg-primary/5 px-6 py-4">
                      <span className="font-mono text-4xl font-bold tracking-[0.3em] text-primary">
                        {pairingCode}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Enter this code in WhatsApp when prompted.</p>
                    <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Waiting for confirmation…
                    </div>
                    <button className="text-xs text-primary underline underline-offset-2" onClick={switchToQr}>
                      Scan QR code instead
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 py-2">
                    <p className="text-sm text-muted-foreground">
                      Enter your WhatsApp phone number (with country code) to generate a pairing code.
                    </p>
                    <div className="grid gap-2">
                      <Label>Phone number</Label>
                      <Input
                        className="rounded-xl font-mono"
                        placeholder="+27821234567"
                        value={pairingPhone}
                        onChange={(e) => setPairingPhone(e.target.value)}
                      />
                    </div>
                    <Button
                      className="rounded-xl"
                      disabled={pairingMutation.isPending || pairingPhone.length < 7}
                      onClick={() => pairingMutation.mutate({ id: pairingAccountId!, phone: pairingPhone })}
                    >
                      {pairingMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Get pairing code
                    </Button>
                    <button className="text-xs text-primary underline underline-offset-2 text-center" onClick={switchToQr}>
                      Scan QR code instead
                    </button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {isLoading ? null : accounts.length === 0 ? (
        <EmptyState
          icon={PhoneCall}
          title="No WhatsApp accounts yet"
          description="Add an account and link your phone to connect your WhatsApp number."
          action={
            <Button className="rounded-xl" type="button" onClick={() => setOpen(true)}>
              Add your first account
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => {
            const sessionStatus = a.session?.status ?? "DISCONNECTED";
            const isConnected = sessionStatus === "CONNECTED";
            return (
              <div
                key={a.id}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-md"
              >
                {/* Card header */}
                <div className={`px-5 py-4 ${isConnected ? "bg-emerald-500/5" : "bg-muted/30"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${isConnected ? "bg-emerald-500/15" : "bg-muted"}`}>
                        <Smartphone className={`size-5 ${isConnected ? "text-emerald-500" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm leading-tight">{a.name}</p>
                        <p className="font-mono text-xs text-muted-foreground mt-0.5">
                          {a.phone ?? "Not linked"}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 rounded-lg text-xs font-mono ${isConnected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                    >
                      {a.providerType}
                    </Badge>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 divide-x divide-border/40 border-t border-border/40">
                  <div className="px-5 py-3 text-center">
                    <p className="text-xl font-bold">{isConnected ? "✓" : "—"}</p>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-0.5">
                      {isConnected ? "Connected" : "Offline"}
                    </p>
                  </div>
                  <div className="px-5 py-3 text-center">
                    <p className="text-xl font-bold">{accountActiveItems(a.id)}</p>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-0.5">
                      Active Items
                    </p>
                  </div>
                </div>

                {/* Status bar */}
                <div className={`flex items-center gap-2 border-t border-border/40 px-5 py-2.5 ${isConnected ? "bg-emerald-500/5" : ""}`}>
                  {isConnected ? (
                    <Wifi className="size-3.5 text-emerald-500" />
                  ) : (
                    <WifiOff className="size-3.5 text-muted-foreground" />
                  )}
                  <span className={`text-xs font-medium ${isConnected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                    {isConnected ? "Chatbot active — receiving messages" : "Not receiving messages"}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 border-t border-border/40 px-4 py-3">
                  <Link href={`/autoresponder?account=${a.id}`} className="flex-1">
                    <Button size="sm" variant="outline" className="w-full rounded-xl text-xs gap-1.5">
                      <Bot className="size-3.5" />
                      Add item
                    </Button>
                  </Link>
                  <Link href="/autoresponder" className="flex-1">
                    <Button size="sm" variant="outline" className="w-full rounded-xl text-xs gap-1.5">
                      <List className="size-3.5" />
                      Item list{accountTotalItems(a.id) > 0 ? ` (${accountTotalItems(a.id)})` : ""}
                    </Button>
                  </Link>
                  {a.providerType === "BAILEYS" && !isConnected && (
                    <Button
                      size="sm"
                      className="rounded-xl text-xs"
                      onClick={() => openLinkModal(a.id)}
                    >
                      <QrCode className="mr-1 size-3.5" />
                      Link
                    </Button>
                  )}
                  {a.providerType === "BAILEYS" && isConnected && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-xl text-xs text-destructive hover:text-destructive"
                      disabled={disconnectMutation.isPending && disconnectMutation.variables === a.id}
                      onClick={() => disconnectMutation.mutate(a.id)}
                    >
                      {disconnectMutation.isPending && disconnectMutation.variables === a.id
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : "Disconnect"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Help callout */}
      {accounts.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-muted/20 px-5 py-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">How it works</p>
          <p>
            Each number runs its own{" "}
            <Link href="/autoresponder" className="underline underline-offset-2 text-primary">
              Chatbot Items
            </Link>{" "}
            — keyword → reply rules that fire instantly when someone messages you.
            Add items per account or workspace-wide (applies to all numbers).
          </p>
        </div>
      )}
    </div>
  );
}
