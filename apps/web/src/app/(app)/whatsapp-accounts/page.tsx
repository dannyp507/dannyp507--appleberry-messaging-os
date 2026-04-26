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
  Cloud,
  Copy,
  ExternalLink,
  Key,
  List,
  Loader2,
  Pencil,
  PhoneCall,
  Plus,
  QrCode,
  Smartphone,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type LinkMode = "qr" | "pairing";

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
const META_CONFIG_ID = process.env.NEXT_PUBLIC_META_SIGNUP_CONFIG_ID ?? "";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    FB?: any;
  }
}

export default function WhatsAppAccountsPage() {
  const queryClient = useQueryClient();

  // ── Create / edit dialog state ─────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState("BAILEYS");

  // Cloud API credential fields
  const [cloudPhoneNumberId, setCloudPhoneNumberId] = useState("");
  const [cloudAccessToken, setCloudAccessToken] = useState("");
  const [cloudWabaId, setCloudWabaId] = useState("");
  const [editingCloudId, setEditingCloudId] = useState<string | null>(null);

  // Embedded signup state
  const embeddedDataRef = useRef<{ phoneNumberId: string; wabaId: string } | null>(null);
  const [fbSdkReady, setFbSdkReady] = useState(false);

  // ── Cloud connect success modal ────────────────────────────────────────────
  const [cloudSuccess, setCloudSuccess] = useState<{
    verifyToken: string;
    displayPhone: string | null;
    webhookUrl: string;
  } | null>(null);

  // ── QR / pairing flow state ────────────────────────────────────────────────
  const [pairingAccountId, setPairingAccountId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<LinkMode>("qr");
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<string>("PENDING_QR");

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: qk.whatsappAccounts,
    queryFn: async () => {
      const { data } = await api.get<WhatsAppAccount[]>("/whatsapp/accounts");
      return data;
    },
    refetchInterval: 10000,
  });

  const { data: rules = [] } = useQuery({
    queryKey: qk.autoresponderRules,
    queryFn: async () => {
      const { data } = await api.get<AutoresponderRule[]>("/autoresponder/rules");
      return data;
    },
  });

  const accountActiveItems = (id: string) =>
    rules.filter((r) => (r.whatsappAccountId === id || r.whatsappAccountId === null) && r.active).length;
  const accountTotalItems = (id: string) =>
    rules.filter((r) => r.whatsappAccountId === id || r.whatsappAccountId === null).length;

  // ── FB SDK loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!META_APP_ID || typeof window === "undefined") return;
    if (document.getElementById("facebook-jssdk")) {
      if (window.FB) setFbSdkReady(true);
      return;
    }
    window.fbAsyncInit = function () {
      window.FB?.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: true, version: "v21.0" });
      setFbSdkReady(true);
    };
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Listen for Meta's WA_EMBEDDED_SIGNUP message (fires during the popup)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Accept any facebook.com subdomain
      if (!event.origin.includes("facebook.com")) return;
      try {
        const parsed =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (parsed?.type === "WA_EMBEDDED_SIGNUP") {
          const { phone_number_id, waba_id } =
            parsed.data ?? parsed.sessionInfo?.metadata ?? {};
          if (phone_number_id) {
            embeddedDataRef.current = {
              phoneNumberId: String(phone_number_id),
              wabaId: waba_id ? String(waba_id) : "",
            };
          }
        }
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const resetCreateForm = () => {
    setName("");
    setProviderType("BAILEYS");
    setCloudPhoneNumberId("");
    setCloudAccessToken("");
    setCloudWabaId("");
    setEditingCloudId(null);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<WhatsAppAccount>("/whatsapp/accounts", { name, providerType });
      return data;
    },
    onSuccess: (account) => {
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      setOpen(false);
      resetCreateForm();
      if (account.providerType === "BAILEYS") openLinkModal(account.id);
      else toast.success("Account added");
    },
    onError: () => toast.error("Could not add account"),
  });

  const cloudConnectMutation = useMutation({
    mutationFn: async () => {
      const endpoint = editingCloudId
        ? `/whatsapp/accounts/${editingCloudId}/cloud-connect`
        : "/whatsapp/accounts/cloud-connect";
      const { data } = await api.post<{
        account: WhatsAppAccount;
        verifyToken: string;
        displayPhone: string | null;
      }>(endpoint, {
        name: editingCloudId ? undefined : (name.trim() || `WhatsApp Cloud ${cloudPhoneNumberId}`),
        phoneNumberId: cloudPhoneNumberId.trim(),
        accessToken: cloudAccessToken.trim(),
        wabaId: cloudWabaId.trim() || undefined,
      });
      return data;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      setOpen(false);
      resetCreateForm();
      const webhookBase =
        typeof window !== "undefined"
          ? window.location.origin.replace(/:\d+$/, "")
          : "https://your-domain.com";
      setCloudSuccess({
        verifyToken: result.verifyToken,
        displayPhone: result.displayPhone,
        webhookUrl: `${process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ?? webhookBase}/api/whatsapp-cloud/webhook`,
      });
    },
    onError: (e: Error) => toast.error(e.message || "Could not connect Cloud API account"),
  });

  const embeddedSignupMutation = useMutation({
    mutationFn: async (params: { accessToken: string; phoneNumberId: string; wabaId?: string }) => {
      const endpoint = editingCloudId
        ? `/whatsapp/accounts/${editingCloudId}/embedded-signup`
        : "/whatsapp/accounts/embedded-signup";
      const { data } = await api.post<{
        account: WhatsAppAccount;
        verifyToken: string;
        displayPhone: string | null;
      }>(endpoint, {
        ...params,
        name: editingCloudId ? undefined : (name.trim() || "WhatsApp Cloud"),
      });
      return data;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      setOpen(false);
      resetCreateForm();
      const webhookBase =
        typeof window !== "undefined"
          ? window.location.origin.replace(/:\d+$/, "")
          : "https://your-domain.com";
      setCloudSuccess({
        verifyToken: result.verifyToken,
        displayPhone: result.displayPhone,
        webhookUrl: `${process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ?? webhookBase}/api/whatsapp-cloud/webhook`,
      });
    },
    onError: (e: Error) => toast.error(e.message || "Meta signup failed — please try manual credentials"),
  });

  const launchEmbeddedSignup = () => {
    if (!window.FB) {
      toast.error("Facebook SDK not ready yet, please wait a moment and try again");
      return;
    }
    embeddedDataRef.current = null;
    window.FB.login(
      () => {
        // WA_EMBEDDED_SIGNUP postMessage arrives async after the popup closes —
        // wait 1.5 s before reading the ref so the message handler can populate it.
        setTimeout(() => {
          const embedded = embeddedDataRef.current;
          if (embedded?.phoneNumberId) {
            setCloudPhoneNumberId(embedded.phoneNumberId);
            if (embedded.wabaId) setCloudWabaId(embedded.wabaId);
            toast.success("Account identified! Paste your permanent access token below to finish connecting.");
          } else {
            toast.error("Could not detect phone number ID — please fill the fields manually.");
          }
        }, 1500);
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "2" },
      },
    );
  };

  const pairingMutation = useMutation({
    mutationFn: async ({ id, phone }: { id: string; phone: string }) => {
      const { data } = await api.post<{ code: string }>(`/whatsapp/accounts/${id}/pairing-code`, { phone });
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
        `/whatsapp/accounts/${pairingAccountId}/qr`,
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

  const openEditCloud = (account: WhatsAppAccount) => {
    setEditingCloudId(account.id);
    setName(account.name);
    setProviderType("CLOUD");
    setCloudPhoneNumberId("");
    setCloudAccessToken("");
    setCloudWabaId("");
    setOpen(true);
  };

  const qrDataUrl = statusData?.qrDataUrl ?? null;

  const cloudConnecting = cloudConnectMutation.isPending || embeddedSignupMutation.isPending;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const webhookUrl =
    `${process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ?? ""}/api/whatsapp-cloud/webhook`;

  // ── Render ─────────────────────────────────────────────────────────────────
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
              onClick={() => { resetCreateForm(); setOpen(true); }}
            >
              <Plus className="mr-1.5 size-4" />
              Add account
            </Button>

            {/* ── Create / Edit Cloud dialog ─────────────────────────────── */}
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetCreateForm(); }}>
              <DialogContent className="rounded-xl sm:max-w-md bg-[#F9FAFB] border-[#E5E7EB]">
                <DialogHeader>
                  <DialogTitle className="text-xl text-[#111827]">
                    {editingCloudId ? "Update Cloud API credentials" : "New WhatsApp account"}
                  </DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                  {/* Display name */}
                  {!editingCloudId && (
                    <div className="grid gap-2">
                      <Label className="text-[#6B7280]">Display name</Label>
                      <Input
                        className="rounded-xl bg-white border-[#E5E7EB] text-[#111827] placeholder:text-[#9CA3AF]"
                        placeholder="e.g. Support Line"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Provider selector */}
                  {!editingCloudId && (
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
                  )}

                  {/* Cloud API section */}
                  {(providerType === "CLOUD" || editingCloudId) && (
                    <div className="grid gap-3">
                      {/* Embedded Signup button — only shown when Meta App is configured */}
                      {META_APP_ID && META_CONFIG_ID && (
                        <>
                          <button
                            type="button"
                            disabled={embeddedSignupMutation.isPending || !fbSdkReady}
                            onClick={launchEmbeddedSignup}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl border-2 border-[#1877F2] bg-[#1877F2] px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-[#166FE5] active:bg-[#1464D8] disabled:opacity-60",
                            )}
                          >
                            {embeddedSignupMutation.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Zap className="size-4" />
                            )}
                            <span className="flex-1 text-left">
                              {embeddedSignupMutation.isPending
                                ? "Connecting via Meta…"
                                : "Connect with Meta  (Recommended)"}
                            </span>
                            {!fbSdkReady && (
                              <Loader2 className="size-3 animate-spin opacity-60" />
                            )}
                          </button>

                          <div className="flex items-center gap-2">
                            <div className="h-px flex-1 bg-[#E5E7EB]" />
                            <span className="text-xs text-[#9CA3AF]">or enter credentials manually</span>
                            <div className="h-px flex-1 bg-[#E5E7EB]" />
                          </div>
                        </>
                      )}

                      {/* Manual credential fields */}
                      <div className="grid gap-2">
                        <Label className="text-[#6B7280]">Phone Number ID <span className="text-red-400">*</span></Label>
                        <Input
                          className="rounded-xl bg-white border-[#E5E7EB] text-[#111827] font-mono placeholder:text-[#9CA3AF] placeholder:font-sans"
                          placeholder="e.g. 123456789012345"
                          value={cloudPhoneNumberId}
                          onChange={(e) => setCloudPhoneNumberId(e.target.value)}
                        />
                        <p className="text-xs text-[#9CA3AF]">
                          Found in Meta Business Manager → WhatsApp → API Setup
                        </p>
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-[#6B7280]">Access Token <span className="text-red-400">*</span></Label>
                        <Input
                          className="rounded-xl bg-white border-[#E5E7EB] text-[#111827] font-mono text-xs placeholder:text-[#9CA3AF] placeholder:font-sans"
                          placeholder="EAAxxxxxx…"
                          type="password"
                          value={cloudAccessToken}
                          onChange={(e) => setCloudAccessToken(e.target.value)}
                        />
                        <p className="text-xs text-[#9CA3AF]">
                          Permanent system user token (not the temp token)
                        </p>
                      </div>

                      <div className="grid gap-2">
                        <Label className="text-[#6B7280]">WABA ID <span className="text-[#D1D5DB] font-normal">(optional)</span></Label>
                        <Input
                          className="rounded-xl bg-white border-[#E5E7EB] text-[#111827] font-mono placeholder:text-[#9CA3AF] placeholder:font-sans"
                          placeholder="e.g. 987654321098765"
                          value={cloudWabaId}
                          onChange={(e) => setCloudWabaId(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  {providerType === "CLOUD" || editingCloudId ? (
                    <Button
                      className="rounded-xl"
                      disabled={
                        cloudConnecting ||
                        !cloudPhoneNumberId.trim() ||
                        !cloudAccessToken.trim()
                      }
                      onClick={() => cloudConnectMutation.mutate()}
                    >
                      {cloudConnectMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      {editingCloudId ? "Update credentials" : "Connect Cloud API"}
                    </Button>
                  ) : (
                    <Button
                      className="rounded-xl"
                      disabled={createMutation.isPending || name.length < 2}
                      onClick={() => createMutation.mutate()}
                    >
                      {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      {providerType === "BAILEYS" ? "Save & link phone" : "Save"}
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* ── Cloud connect success modal ────────────────────────────── */}
            <Dialog open={!!cloudSuccess} onOpenChange={() => setCloudSuccess(null)}>
              <DialogContent className="rounded-xl sm:max-w-lg bg-[#F9FAFB] border-[#E5E7EB]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl text-[#111827]">
                    <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/10">
                      <CheckCircle2 className="size-5 text-emerald-500" />
                    </div>
                    WhatsApp Cloud API connected!
                  </DialogTitle>
                </DialogHeader>

                {cloudSuccess && (
                  <div className="space-y-4 py-1">
                    {cloudSuccess.displayPhone && (
                      <p className="text-sm text-[#6B7280]">
                        Phone number: <span className="font-mono font-medium text-[#111827]">{cloudSuccess.displayPhone}</span>
                      </p>
                    )}

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                      <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                        <Key className="size-4" />
                        Configure your webhook in Meta Business Manager
                      </p>
                      <div className="space-y-2 text-xs">
                        <div>
                          <p className="text-[#6B7280] mb-1">Callback URL</p>
                          <div className="flex items-center gap-2 rounded-lg bg-white border border-[#E5E7EB] px-3 py-2">
                            <code className="flex-1 font-mono text-[#111827] break-all">{cloudSuccess.webhookUrl}</code>
                            <button
                              className="shrink-0 text-[#6366F1] hover:text-[#4F46E5]"
                              onClick={() => { void navigator.clipboard.writeText(cloudSuccess.webhookUrl); toast.success("Copied!"); }}
                            >
                              <Copy className="size-3.5" />
                            </button>
                          </div>
                        </div>
                        <div>
                          <p className="text-[#6B7280] mb-1">Verify Token</p>
                          <div className="flex items-center gap-2 rounded-lg bg-white border border-[#E5E7EB] px-3 py-2">
                            <code className="flex-1 font-mono text-[#111827]">{cloudSuccess.verifyToken}</code>
                            <button
                              className="shrink-0 text-[#6366F1] hover:text-[#4F46E5]"
                              onClick={() => { void navigator.clipboard.writeText(cloudSuccess.verifyToken); toast.success("Copied!"); }}
                            >
                              <Copy className="size-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[#9CA3AF]">Subscribe to the <strong>messages</strong> webhook field.</p>
                      </div>
                    </div>

                    <a
                      href="https://business.facebook.com/latest/whatsapp-manager/phone-numbers"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs text-[#6366F1] hover:underline"
                    >
                      Open Meta Business Manager
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                )}

                <DialogFooter>
                  <Button className="rounded-xl" onClick={() => setCloudSuccess(null)}>Done</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* ── QR / pairing modal ────────────────────────────────────────── */}
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
                    <p className="text-center text-sm text-[#6B7280]">Your WhatsApp number is now live and ready.</p>
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
                    <p className="text-xs text-[#6B7280] text-center">QR code refreshes automatically. Scan it quickly.</p>
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
                      <span className="font-mono text-4xl font-bold tracking-[0.3em] text-[#6366F1]">{pairingCode}</span>
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

      {/* ── Account list ──────────────────────────────────────────────────── */}
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
            // Cloud accounts use sessionStatus directly; Baileys uses the session relation
            const effectiveStatus = a.session?.status ?? a.sessionStatus ?? "DISCONNECTED";
            const isConnected = effectiveStatus === "CONNECTED";
            const isCloud = a.providerType === "CLOUD";

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
                <div className={cn("h-0.5 w-full", isConnected
                  ? "bg-gradient-to-r from-emerald-500/80 to-emerald-400/40"
                  : "bg-[#F3F4F6]"
                )} />

                <div className="flex items-start justify-between gap-3 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      isConnected ? "bg-emerald-500/10" : "bg-[#F9FAFB]",
                    )}>
                      {isCloud ? (
                        <Cloud className={cn("size-5", isConnected ? "text-emerald-400" : "text-[#9CA3AF]")} />
                      ) : (
                        <Smartphone className={cn("size-5", isConnected ? "text-emerald-400" : "text-[#9CA3AF]")} />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight text-[#111827]">{a.name}</p>
                      <p className="font-mono text-xs text-[#6B7280] mt-0.5">{a.phone ?? "Not linked"}</p>
                    </div>
                  </div>

                  <div className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    isConnected
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : "border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF]",
                  )}>
                    {isConnected ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}
                    {isCloud ? "CLOUD" : a.providerType}
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-[#F3F4F6] border-t border-[#E5E7EB]">
                  <div className="px-5 py-3 text-center">
                    <p className="text-xl font-bold text-[#111827]">
                      {isConnected
                        ? <Wifi className="mx-auto size-5 text-emerald-400" />
                        : <WifiOff className="mx-auto size-5 text-[#9CA3AF]" />
                      }
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
                    <p className="text-[10px] font-medium uppercase tracking-widest text-[#9CA3AF] mt-0.5">Active Rules</p>
                  </div>
                </div>

                <div className={cn(
                  "flex items-center gap-2 border-t border-[#E5E7EB] px-5 py-2.5",
                  isConnected ? "bg-emerald-500/5" : "bg-[#F7F8FA]/50",
                )}>
                  {isConnected
                    ? <Wifi className="size-3.5 text-emerald-500" />
                    : <WifiOff className="size-3.5 text-[#9CA3AF]" />
                  }
                  <span className={cn(
                    "text-xs font-medium",
                    isConnected ? "text-emerald-400" : "text-[#9CA3AF]",
                  )}>
                    {isConnected ? "Autoresponders active — receiving messages" : "Not receiving messages"}
                  </span>
                </div>

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
                  {isCloud && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl text-xs border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] gap-1.5 hover:border-[#D1D5DB] hover:bg-[#F3F4F6] hover:text-[#111827]"
                      onClick={() => openEditCloud(a)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                  )}
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

                {/* Cloud: webhook info strip */}
                {isCloud && isConnected && (
                  <div className="border-t border-[#E5E7EB] bg-[#F9FAFB] px-5 py-2.5">
                    <p className="text-[10px] text-[#9CA3AF]">
                      Webhook: <span className="font-mono">{webhookUrl}</span>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {accounts.length > 0 && (
        <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 text-sm text-[#6B7280]">
          <p className="font-medium text-[#111827] mb-1">How it works</p>
          <p>
            Each number runs its own{" "}
            <Link href="/autoresponder" className="font-medium text-[#6366F1] underline-offset-2 hover:underline">
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
