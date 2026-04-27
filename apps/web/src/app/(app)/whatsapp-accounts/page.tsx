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
  ExternalLink,
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
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type LinkMode = "qr" | "pairing";

export default function WhatsAppAccountsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState("BAILEYS");
  const [cloudPhoneId, setCloudPhoneId] = useState("");
  const [cloudToken, setCloudToken] = useState("");
  const [cloudWabaId, setCloudWabaId] = useState("");

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
    mutationFn: async (vars: { useManual: boolean; phoneId: string; token: string; wabaId: string }) => {
      const { data } = await api.post<WhatsAppAccount>("/whatsapp/accounts", {
        name,
        providerType,
      });
      return { account: data, ...vars };
    },
    onSuccess: ({ account, useManual, phoneId, token, wabaId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      setOpen(false);
      setName("");
      setProviderType("BAILEYS");
      setCloudPhoneId("");
      setCloudToken("");
      setCloudWabaId("");
      if (account.providerType === "BAILEYS") {
        openLinkModal(account.id);
      } else if (account.providerType === "CLOUD") {
        if (useManual && phoneId.trim() && token.trim()) {
          cloudCredentialsMutation.mutate({ id: account.id, phoneId, token, wabaId });
        } else {
          metaConnectMutation.mutate(account.id);
        }
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

  // Handle redirect params from Meta OAuth callback
  useEffect(() => {
    const cloudConnected = searchParams.get("cloud_connected");
    const error = searchParams.get("error");
    if (cloudConnected) {
      toast.success("WhatsApp number connected via Meta!");
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      router.replace("/whatsapp-accounts");
    } else if (error) {
      const messages: Record<string, string> = {
        invalid_state: "Session expired — please try again.",
        token_exchange_failed: "Meta login failed — please try again.",
        no_waba: "No WhatsApp Business Account found on your Meta account.",
        no_phone_number: "No phone number found on your WhatsApp Business Account.",
        missing_params: "Meta login was cancelled.",
        unknown: "Something went wrong during Meta login.",
      };
      toast.error(messages[error] ?? `Meta login error: ${error}`);
      router.replace("/whatsapp-accounts");
    }
  }, [searchParams, queryClient, router]);

  const cloudCredentialsMutation = useMutation({
    mutationFn: async ({ id, phoneId, token, wabaId }: { id: string; phoneId: string; token: string; wabaId: string }) => {
      await api.post(`/whatsapp/accounts/${id}/cloud-credentials`, {
        cloudPhoneNumberId: phoneId.trim(),
        cloudAccessToken: token.trim(),
        ...(wabaId.trim() ? { cloudWabaId: wabaId.trim() } : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      toast.success("Cloud API account connected!");
    },
    onError: () => toast.error("Could not save credentials — check the Phone Number ID and Access Token."),
  });

  const metaConnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.get<{ url: string }>(
        `/whatsapp/accounts/${id}/meta-oauth-url`
      );
      return data.url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: () => toast.error("Could not start Meta login. Check that META_APP_ID is configured."),
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
              <DialogContent className="rounded-xl sm:max-w-md bg-[#F9FAFB] border-[#E5E7EB]">
                <DialogHeader>
                  <DialogTitle className="text-xl text-[#111827]">New WhatsApp account</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <Label className="text-[#6B7280]">Display name</Label>
                    <Input
                      className="rounded-xl bg-white border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF]"
                      placeholder="e.g. Support Line"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[#6B7280]">Provider</Label>
                    <Select value={providerType} onValueChange={(v) => setProviderType(v ?? "BAILEYS")}>
                      <SelectTrigger className="rounded-xl bg-white border-[#E5E7EB] text-[#111827]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl bg-[#F9FAFB] border-[#E5E7EB]">
                        <SelectItem value="BAILEYS" className="text-[#111827]">Phone pairing code (Baileys)</SelectItem>
                        <SelectItem value="CLOUD"   className="text-[#111827]">Meta Cloud API</SelectItem>
                        <SelectItem value="MOCK"    className="text-[#111827]">Mock (testing)</SelectItem>
                      </SelectContent>
                    </Select>
                    {providerType === "BAILEYS" && (
                      <p className="text-xs text-[#6B7280]">
                        After saving, scan the QR code to link your WhatsApp number.
                      </p>
                    )}
                  </div>

                  {providerType === "CLOUD" && (
                    <>
                      {/* Primary: Meta OAuth */}
                      <Button
                        type="button"
                        className="w-full rounded-xl bg-[#1877F2] hover:bg-[#1565D8] text-white"
                        disabled={createMutation.isPending || metaConnectMutation.isPending || name.length < 2}
                        onClick={() => createMutation.mutate({ useManual: false, phoneId: "", token: "", wabaId: "" })}
                      >
                        {(createMutation.isPending || metaConnectMutation.isPending) && <Loader2 className="mr-2 size-4 animate-spin" />}
                        Connect with Meta (Recommended)
                      </Button>
                      <p className="text-xs text-[#6B7280] text-center -mt-1">
                        Your phone number and access token are set up automatically.
                      </p>

                      {/* Divider */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                        <span className="text-xs text-[#9CA3AF]">or enter credentials manually</span>
                        <div className="flex-1 h-px bg-[#E5E7EB]" />
                      </div>

                      {/* Manual: Phone Number ID + Access Token + WABA ID */}
                      <div className="grid gap-3">
                        <div className="grid gap-1.5">
                          <Label className="text-[#6B7280]">
                            Phone Number ID <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            className="rounded-xl bg-white border-[#E5E7EB] text-[#111827] font-mono text-sm placeholder:text-[#9CA3AF]"
                            placeholder="e.g. 1143836705476116"
                            value={cloudPhoneId}
                            onChange={(e) => setCloudPhoneId(e.target.value)}
                          />
                          <p className="text-[11px] text-[#9CA3AF]">
                            Found in Meta Business Manager → WhatsApp → API Setup
                          </p>
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-[#6B7280]">
                            Access Token <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            className="rounded-xl bg-white border-[#E5E7EB] text-[#111827] font-mono text-sm placeholder:text-[#9CA3AF]"
                            placeholder="EAAxxxxxxx…"
                            value={cloudToken}
                            onChange={(e) => setCloudToken(e.target.value)}
                          />
                          <p className="text-[11px] text-[#9CA3AF]">
                            Permanent system user token (not the temp token)
                          </p>
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-[#6B7280]">WABA ID <span className="text-[#9CA3AF] font-normal">(optional)</span></Label>
                          <Input
                            className="rounded-xl bg-white border-[#E5E7EB] text-[#111827] font-mono text-sm placeholder:text-[#9CA3AF]"
                            placeholder="e.g. 992318829922327"
                            value={cloudWabaId}
                            onChange={(e) => setCloudWabaId(e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <DialogFooter>
                  {providerType === "CLOUD" ? (
                    <Button
                      className="rounded-xl"
                      disabled={
                        createMutation.isPending ||
                        cloudCredentialsMutation.isPending ||
                        name.length < 2 ||
                        !cloudPhoneId.trim() ||
                        !cloudToken.trim()
                      }
                      onClick={() => createMutation.mutate({ useManual: true, phoneId: cloudPhoneId, token: cloudToken, wabaId: cloudWabaId })}
                    >
                      {(createMutation.isPending || cloudCredentialsMutation.isPending) && (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      )}
                      Connect Cloud API
                    </Button>
                  ) : (
                    <Button
                      className="rounded-xl"
                      disabled={createMutation.isPending || name.length < 2}
                      onClick={() => createMutation.mutate({ useManual: false, phoneId: "", token: "", wabaId: "" })}
                    >
                      {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      {providerType === "BAILEYS" ? "Save & link phone" : "Save"}
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Link modal — QR + pairing code */}
            <Dialog open={!!pairingAccountId} onOpenChange={closeLinkModal}>
              <DialogContent className="rounded-xl sm:max-w-sm bg-[#F9FAFB] border-[#E5E7EB]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl text-[#111827]">
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
                    <p className="text-center text-sm text-[#6B7280]">
                      Your WhatsApp number is now live and ready.
                    </p>
                    <Button className="rounded-xl" onClick={closeLinkModal}>Done</Button>
                  </div>
                ) : linkMode === "qr" ? (
                  <div className="flex flex-col items-center gap-4 py-2">
                    <p className="text-sm text-center text-[#6B7280]">
                      Open WhatsApp → Settings → Linked Devices → Link a Device, then scan this QR code.
                    </p>

                    {connectMutation.isPending ? (
                      <div className="flex size-[260px] items-center justify-center rounded-xl border border-[#E5E7EB] bg-white">
                        <Loader2 className="size-8 animate-spin text-[#9CA3AF]" />
                      </div>
                    ) : qrDataUrl ? (
                      <div className="rounded-xl overflow-hidden border border-[#E5E7EB] shadow-sm">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrDataUrl} alt="WhatsApp QR code" width={260} height={260} />
                      </div>
                    ) : (
                      <div className="flex size-[260px] items-center justify-center rounded-xl border border-[#E5E7EB] bg-white">
                        <div className="flex flex-col items-center gap-2 text-[#9CA3AF]">
                          <QrCode className="size-8" />
                          <span className="text-xs">Generating QR…</span>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-[#6B7280] text-center">
                      QR code refreshes automatically. Scan it quickly.
                    </p>
                    <button
                      className="text-xs text-[#6366F1] underline underline-offset-2 hover:text-[#6366F1]"
                      onClick={() => { setLinkMode("pairing"); setPairingCode(null); }}
                    >
                      Use pairing code instead
                    </button>
                  </div>
                ) : pairingCode ? (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <p className="text-sm text-center text-[#6B7280]">
                      Open WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number instead
                    </p>
                    <div className="flex items-center justify-center rounded-xl border-2 border-[#6366F1]/30 bg-[#6366F1]/5 px-6 py-4">
                      <span className="font-mono text-4xl font-bold tracking-[0.3em] text-[#6366F1]">
                        {pairingCode}
                      </span>
                    </div>
                    <p className="text-xs text-[#6B7280] text-center">Enter this code in WhatsApp when prompted.</p>
                    <div className="flex items-center gap-2 rounded-lg bg-[#F3F4F6] px-3 py-2 text-xs text-[#6B7280]">
                      <Loader2 className="size-3 animate-spin" />
                      Waiting for confirmation…
                    </div>
                    <button
                      className="text-xs text-[#6366F1] underline underline-offset-2 hover:text-[#6366F1]"
                      onClick={switchToQr}
                    >
                      Scan QR code instead
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 py-2">
                    <p className="text-sm text-[#6B7280]">
                      Enter your WhatsApp phone number (with country code) to generate a pairing code.
                    </p>
                    <div className="grid gap-2">
                      <Label className="text-[#6B7280]">Phone number</Label>
                      <Input
                        className="rounded-xl font-mono bg-white border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF]"
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
                      className="text-xs text-[#6366F1] underline underline-offset-2 text-center hover:text-[#6366F1]"
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
            // Cloud accounts are "connected" once OAuth has linked a phone number
            const isConnected =
              a.providerType === "CLOUD"
                ? !!a.cloudPhoneNumberId
                : sessionStatus === "CONNECTED";
            return (
              <div
                key={a.id}
                className={cn(
                  "overflow-hidden rounded-2xl border bg-white transition-all duration-200 hover:shadow-lg",
                  isConnected
                    ? "border-emerald-200 hover:border-emerald-900/60"
                    : "border-[#E5E7EB] hover:border-[#D1D5DB]",
                )}
              >
                {/* Top accent */}
                <div className={cn(
                  "h-0.5 w-full",
                  isConnected
                    ? "bg-gradient-to-r from-emerald-500/80 to-emerald-400/40"
                    : "bg-[#F3F4F6]",
                )} />

                {/* Card header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      isConnected ? "bg-emerald-500/10" : "bg-[#F9FAFB]",
                    )}>
                      <Smartphone className={cn(
                        "size-5",
                        isConnected ? "text-emerald-400" : "text-[#9CA3AF]",
                      )} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight text-[#111827]">{a.name}</p>
                      <p className="font-mono text-xs text-[#6B7280] mt-0.5">
                        {a.phone ?? "Not linked"}
                      </p>
                    </div>
                  </div>

                  {/* Provider + connection pill */}
                  <div className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    isConnected
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : "border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF]",
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
                <div className="grid grid-cols-2 divide-x divide-[#F3F4F6] border-t border-[#E5E7EB]">
                  <div className="px-5 py-3 text-center">
                    <p className="text-xl font-bold text-[#111827]">
                      {isConnected ? (
                        <Wifi className="mx-auto size-5 text-emerald-400" />
                      ) : (
                        <WifiOff className="mx-auto size-5 text-[#9CA3AF]" />
                      )}
                    </p>
                    <p className={cn(
                      "text-[10px] font-medium uppercase tracking-widest mt-1",
                      isConnected ? "text-emerald-400" : "text-[#9CA3AF]",
                    )}>
                      {isConnected ? "Connected" : "Offline"}
                    </p>
                  </div>
                  <div className="px-5 py-3 text-center">
                    <p className="text-xl font-bold text-[#111827]">{accountActiveItems(a.id)}</p>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-[#9CA3AF] mt-0.5">
                      Active Rules
                    </p>
                  </div>
                </div>

                {/* Status bar */}
                <div className={cn(
                  "flex items-center gap-2 border-t border-[#E5E7EB] px-5 py-2.5",
                  isConnected ? "bg-emerald-500/5" : "bg-[#F7F8FA]/50",
                )}>
                  {isConnected ? (
                    <Wifi className="size-3.5 text-emerald-500" />
                  ) : (
                    <WifiOff className="size-3.5 text-[#9CA3AF]" />
                  )}
                  <span className={cn(
                    "text-xs font-medium",
                    isConnected ? "text-emerald-400" : "text-[#9CA3AF]",
                  )}>
                    {isConnected ? "Autoresponders active — receiving messages" : "Not receiving messages"}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 border-t border-[#E5E7EB] px-4 py-3">
                  <Link href={`/autoresponder?account=${a.id}`} className="flex-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full rounded-xl border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#6B7280] gap-1.5 hover:border-[#D1D5DB] hover:bg-[#F3F4F6] hover:text-[#111827]"
                    >
                      <Bot className="size-3.5" />
                      Add rule
                    </Button>
                  </Link>
                  <Link href="/autoresponder" className="flex-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full rounded-xl border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#6B7280] gap-1.5 hover:border-[#D1D5DB] hover:bg-[#F3F4F6] hover:text-[#111827]"
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
                  {a.providerType === "CLOUD" && !a.cloudPhoneNumberId && (
                    <Button
                      size="sm"
                      className="rounded-xl text-xs"
                      disabled={metaConnectMutation.isPending && metaConnectMutation.variables === a.id}
                      onClick={() => metaConnectMutation.mutate(a.id)}
                    >
                      {metaConnectMutation.isPending && metaConnectMutation.variables === a.id
                        ? <Loader2 className="mr-1 size-3.5 animate-spin" />
                        : <ExternalLink className="mr-1 size-3.5" />}
                      Connect via Meta
                    </Button>
                  )}
                  {a.providerType === "CLOUD" && !!a.cloudPhoneNumberId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-xl text-xs text-[#6B7280] hover:bg-[#F3F4F6]"
                      disabled={metaConnectMutation.isPending && metaConnectMutation.variables === a.id}
                      onClick={() => metaConnectMutation.mutate(a.id)}
                    >
                      {metaConnectMutation.isPending && metaConnectMutation.variables === a.id
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : <ExternalLink className="size-3.5" />}
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
        <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 text-sm text-[#6B7280]">
          <p className="font-medium text-[#111827] mb-1">How it works</p>
          <p>
            Each number runs its own{" "}
            <Link
              href="/autoresponder"
              className="font-medium text-[#6366F1] underline-offset-2 hover:underline"
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
