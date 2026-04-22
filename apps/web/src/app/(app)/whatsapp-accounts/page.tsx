"use client";

import { PageHeader } from "@/components/layout/page-header";
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
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  Circle,
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
        description="Each connected number runs your autoresponder rules automatically."
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
              <DialogContent className="rounded-xl sm:max-w-md bg-[#161a21] border-[#262B33]/40">
                <DialogHeader>
                  <DialogTitle className="text-xl text-white">New WhatsApp account</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <Label className="text-[#a9abb3]">Display name</Label>
                    <Input
                      className="rounded-xl bg-[#0f1219] border-[#262B33]/40 text-white placeholder:text-[#5a5d68]"
                      placeholder="e.g. Support Line"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[#a9abb3]">Provider</Label>
                    <Select value={providerType} onValueChange={(v) => setProviderType(v ?? "BAILEYS")}>
                      <SelectTrigger className="rounded-xl bg-[#0f1219] border-[#262B33]/40 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl bg-[#161a21] border-[#262B33]/40">
                        <SelectItem value="BAILEYS" className="text-[#ecedf6]">Phone pairing code (Baileys)</SelectItem>
                        <SelectItem value="CLOUD"   className="text-[#ecedf6]">Meta Cloud API</SelectItem>
                        <SelectItem value="MOCK"    className="text-[#ecedf6]">Mock (testing)</SelectItem>
                      </SelectContent>
                    </Select>
                    {providerType === "BAILEYS" && (
                      <p className="text-xs text-[#6b6d74]">
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
              <DialogContent className="rounded-xl sm:max-w-sm bg-[#161a21] border-[#262B33]/40">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl text-white">
                    <Smartphone className="size-5" />
                    Link WhatsApp
                  </DialogTitle>
                </DialogHeader>

                {pairingStatus === "CONNECTED" ? (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
                      <Wifi className="size-8 text-emerald-500" />
                    </div>
                    <p className="font-semibold text-emerald-400">Connected successfully!</p>
                    <p className="text-center text-sm text-[#6b6d74]">
                      Your WhatsApp number is now live and ready.
                    </p>
                    <Button className="rounded-xl" onClick={closeLinkModal}>Done</Button>
                  </div>
                ) : linkMode === "qr" ? (
                  <div className="flex flex-col items-center gap-4 py-2">
                    <p className="text-sm text-center text-[#6b6d74]">
                      Open WhatsApp → Settings → Linked Devices → Link a Device, then scan this QR code.
                    </p>

                    {connectMutation.isPending ? (
                      <div className="flex size-[260px] items-center justify-center rounded-xl border border-[#1e2330] bg-[#0f1219]">
                        <Loader2 className="size-8 animate-spin text-[#5a5d68]" />
                      </div>
                    ) : qrDataUrl ? (
                      <div className="rounded-xl overflow-hidden border border-[#1e2330] shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrDataUrl} alt="WhatsApp QR code" width={260} height={260} />
                      </div>
                    ) : (
                      <div className="flex size-[260px] items-center justify-center rounded-xl border border-[#1e2330] bg-[#0f1219]">
                        <div className="flex flex-col items-center gap-2 text-[#5a5d68]">
                          <QrCode className="size-8" />
                          <span className="text-xs">Generating QR…</span>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-[#6b6d74] text-center">
                      QR code refreshes automatically. Scan it quickly.
                    </p>
                    <button
                      className="text-xs text-[#818cf8] underline underline-offset-2 hover:text-[#6366F1]"
                      onClick={() => { setLinkMode("pairing"); setPairingCode(null); }}
                    >
                      Use pairing code instead
                    </button>
                  </div>
                ) : pairingCode ? (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <p className="text-sm text-center text-[#6b6d74]">
                      Open WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number instead
                    </p>
                    <div className="flex items-center justify-center rounded-xl border-2 border-[#6366F1]/30 bg-[#6366F1]/5 px-6 py-4">
                      <span className="font-mono text-4xl font-bold tracking-[0.3em] text-[#818cf8]">
                        {pairingCode}
                      </span>
                    </div>
                    <p className="text-xs text-[#6b6d74] text-center">Enter this code in WhatsApp when prompted.</p>
                    <div className="flex items-center gap-2 rounded-lg bg-[#1e2330] px-3 py-2 text-xs text-[#6b6d74]">
                      <Loader2 className="size-3 animate-spin" />
                      Waiting for confirmation…
                    </div>
                    <button
                      className="text-xs text-[#818cf8] underline underline-offset-2 hover:text-[#6366F1]"
                      onClick={switchToQr}
                    >
                      Scan QR code instead
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 py-2">
                    <p className="text-sm text-[#6b6d74]">
                      Enter your WhatsApp phone number (with country code) to generate a pairing code.
                    </p>
                    <div className="grid gap-2">
                      <Label className="text-[#a9abb3]">Phone number</Label>
                      <Input
                        className="rounded-xl font-mono bg-[#0f1219] border-[#262B33]/40 text-white placeholder:text-[#5a5d68]"
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
                    <button
                      className="text-xs text-[#818cf8] underline underline-offset-2 text-center hover:text-[#6366F1]"
                      onClick={switchToQr}
                    >
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
                className={cn(
                  "overflow-hidden rounded-2xl border bg-[#0f1219] transition-all duration-200 hover:shadow-lg",
                  isConnected
                    ? "border-[#1a2820] hover:border-emerald-900/60"
                    : "border-[#1a1f2a] hover:border-[#262B33]",
                )}
              >
                {/* Top accent */}
                <div className={cn(
                  "h-0.5 w-full",
                  isConnected
                    ? "bg-gradient-to-r from-emerald-500/80 to-emerald-400/40"
                    : "bg-[#1e2330]",
                )} />

                {/* Card header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      isConnected ? "bg-emerald-500/10" : "bg-[#161a21]",
                    )}>
                      <Smartphone className={cn(
                        "size-5",
                        isConnected ? "text-emerald-400" : "text-[#5a5d68]",
                      )} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight text-white">{a.name}</p>
                      <p className="font-mono text-xs text-[#6b6d74] mt-0.5">
                        {a.phone ?? "Not linked"}
                      </p>
                    </div>
                  </div>

                  {/* Provider + connection pill */}
                  <div className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    isConnected
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : "border-[#262B33]/60 bg-[#161a21] text-[#5a5d68]",
                  )}>
                    {isConnected ? (
                      <CheckCircle2 className="size-3" />
                    ) : (
                      <Circle className="size-3" />
                    )}
                    {a.providerType}
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 divide-x divide-[#1e2330] border-t border-[#1e2330]">
                  <div className="px-5 py-3 text-center">
                    <p className="text-xl font-bold text-white">
                      {isConnected ? (
                        <Wifi className="mx-auto size-5 text-emerald-400" />
                      ) : (
                        <WifiOff className="mx-auto size-5 text-[#3e4148]" />
                      )}
                    </p>
                    <p className={cn(
                      "text-[10px] font-medium uppercase tracking-widest mt-1",
                      isConnected ? "text-emerald-400" : "text-[#5a5d68]",
                    )}>
                      {isConnected ? "Connected" : "Offline"}
                    </p>
                  </div>
                  <div className="px-5 py-3 text-center">
                    <p className="text-xl font-bold text-white">{accountActiveItems(a.id)}</p>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-[#5a5d68] mt-0.5">
                      Active Rules
                    </p>
                  </div>
                </div>

                {/* Status bar */}
                <div className={cn(
                  "flex items-center gap-2 border-t border-[#1e2330] px-5 py-2.5",
                  isConnected ? "bg-emerald-500/5" : "bg-[#0b0e14]/50",
                )}>
                  {isConnected ? (
                    <Wifi className="size-3.5 text-emerald-500" />
                  ) : (
                    <WifiOff className="size-3.5 text-[#3e4148]" />
                  )}
                  <span className={cn(
                    "text-xs font-medium",
                    isConnected ? "text-emerald-400" : "text-[#5a5d68]",
                  )}>
                    {isConnected ? "Autoresponders active — receiving messages" : "Not receiving messages"}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 border-t border-[#1e2330] px-4 py-3">
                  <Link href={`/autoresponder?account=${a.id}`} className="flex-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full rounded-xl border-[#1e2330] bg-[#161a21] text-xs text-[#9b9da6] gap-1.5 hover:border-[#2d3141] hover:bg-[#1e2330] hover:text-white"
                    >
                      <Bot className="size-3.5" />
                      Add rule
                    </Button>
                  </Link>
                  <Link href="/autoresponder" className="flex-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full rounded-xl border-[#1e2330] bg-[#161a21] text-xs text-[#9b9da6] gap-1.5 hover:border-[#2d3141] hover:bg-[#1e2330] hover:text-white"
                    >
                      <List className="size-3.5" />
                      Rules{accountTotalItems(a.id) > 0 ? ` (${accountTotalItems(a.id)})` : ""}
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
                      className="rounded-xl text-xs text-red-500/70 hover:bg-red-500/10 hover:text-red-400"
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
        <div className="rounded-xl border border-[#1a1f2a] bg-[#0f1219] px-5 py-4 text-sm text-[#6b6d74]">
          <p className="font-medium text-white mb-1">How it works</p>
          <p>
            Each number runs its own{" "}
            <Link
              href="/autoresponder"
              className="font-medium text-[#818cf8] underline-offset-2 hover:underline"
            >
              autoresponder rules
            </Link>{" "}
            — keyword → reply rules that fire instantly when someone messages you.
            Add rules per account or workspace-wide (applies to all numbers).
          </p>
        </div>
      )}
    </div>
  );
}
