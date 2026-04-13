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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, getApiErrorMessage } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { WhatsAppAccount } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PhoneCall, QrCode, Wifi, WifiOff } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

interface QrResponse {
  qrCode: string | null;
  status: "CONNECTING" | "CONNECTED" | "DISCONNECTED";
}

interface WAAccountWithSession extends WhatsAppAccount {
  session?: { status: string; lastConnectedAt: string | null } | null;
}

export default function WhatsAppAccountsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [providerType, setProviderType] = useState("BAILEYS");

  // QR modal state
  const [qrAccountId, setQrAccountId] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string>("CONNECTING");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: qk.whatsappAccounts,
    queryFn: async () => {
      const { data } = await api.get<WAAccountWithSession[]>("/whatsapp/accounts");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<WAAccountWithSession>("/whatsapp/accounts", {
        name,
        phone: phone || undefined,
        providerType,
      });
      return data;
    },
    onSuccess: (account) => {
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      setOpen(false);
      setName("");
      setPhone("");
      setProviderType("BAILEYS");
      if (account.providerType === "BAILEYS") {
        setQrAccountId(account.id);
      } else {
        toast.success("Account added");
      }
    },
    onError: (e) => toast.error("Could not add account", getApiErrorMessage(e)),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/whatsapp/accounts/${id}/disconnect`, {});
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      toast.success("Disconnected");
    },
    onError: (e) => toast.error("Could not disconnect", getApiErrorMessage(e)),
  });

  // Poll QR code when modal is open
  useQuery({
    queryKey: ["wa-qr", qrAccountId],
    enabled: !!qrAccountId && qrStatus !== "CONNECTED",
    refetchInterval: 3000,
    queryFn: async () => {
      const { data } = await api.get<QrResponse>(`/whatsapp/accounts/${qrAccountId}/qr`);
      return data;
    },
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    select: (data) => data,
  });

  // Separate polling effect to draw QR + detect connected
  const { data: qrData } = useQuery({
    queryKey: ["wa-qr", qrAccountId],
    enabled: !!qrAccountId && qrStatus !== "CONNECTED",
    refetchInterval: 3000,
    queryFn: async () => {
      const { data } = await api.get<QrResponse>(`/whatsapp/accounts/${qrAccountId}/qr`);
      return data;
    },
  });

  useEffect(() => {
    if (!qrData) return;
    setQrStatus(qrData.status);

    if (qrData.status === "CONNECTED") {
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      toast.success("WhatsApp connected!");
      return;
    }

    if (qrData.qrCode && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrData.qrCode, {
        width: 260,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch(() => null);
    }
  }, [qrData, queryClient]);

  // Reset QR state on modal close
  const closeQrModal = () => {
    setQrAccountId(null);
    setQrStatus("CONNECTING");
  };

  return (
    <div className="page-container space-y-8">
      <PageHeader
        title="WhatsApp Accounts"
        description="Connect WhatsApp numbers to receive and send messages."
        action={
          <>
            <Button
              type="button"
              className="rounded-xl shadow-sm transition-shadow duration-200 hover:shadow-md"
              onClick={() => setOpen(true)}
            >
              Add account
            </Button>

            {/* Create account dialog */}
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
                        <SelectItem value="BAILEYS">
                          QR Code scan (Baileys)
                        </SelectItem>
                        <SelectItem value="CLOUD">Meta Cloud API</SelectItem>
                        <SelectItem value="MOCK">Mock (testing)</SelectItem>
                      </SelectContent>
                    </Select>
                    {providerType === "BAILEYS" && (
                      <p className="text-xs text-muted-foreground">
                        After saving, scan the QR code with WhatsApp on your phone.
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
                    {createMutation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : null}
                    {providerType === "BAILEYS" ? "Save & show QR" : "Save"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* QR Code modal */}
            <Dialog open={!!qrAccountId} onOpenChange={closeQrModal}>
              <DialogContent className="rounded-xl sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl">
                    <QrCode className="size-5" />
                    Scan with WhatsApp
                  </DialogTitle>
                </DialogHeader>

                {qrStatus === "CONNECTED" ? (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
                      <Wifi className="size-8 text-emerald-500" />
                    </div>
                    <p className="text-center font-semibold text-emerald-500">
                      Connected successfully!
                    </p>
                    <p className="text-center text-sm text-muted-foreground">
                      Your WhatsApp number is now live.
                    </p>
                    <Button className="rounded-xl" onClick={closeQrModal}>
                      Done
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 py-2">
                    <div className="relative flex items-center justify-center">
                      <canvas
                        ref={canvasRef}
                        className="rounded-xl border border-border/60 bg-white shadow-md"
                        width={260}
                        height={260}
                      />
                      {!qrData?.qrCode && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/80">
                          <Loader2 className="size-8 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5 text-center">
                      <p className="text-sm font-medium">
                        Open WhatsApp → Linked Devices → Link a device
                      </p>
                      <p className="text-xs text-muted-foreground">
                        QR refreshes automatically every 20 seconds
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Waiting for scan…
                    </div>
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
          description="Add an account and scan the QR code to connect your WhatsApp number."
          action={
            <Button className="rounded-xl" type="button" onClick={() => setOpen(true)}>
              Add your first account
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-md">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60 hover:bg-transparent">
                <TableHead className="font-semibold">Name</TableHead>
                <TableHead className="font-semibold">Phone</TableHead>
                <TableHead className="font-semibold">Provider</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => {
                const sessionStatus = a.session?.status ?? "DISCONNECTED";
                const isConnected = sessionStatus === "CONNECTED";
                return (
                  <TableRow
                    key={a.id}
                    className="border-border/60 transition-colors duration-150 hover:bg-muted/40"
                  >
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {a.phone ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-lg px-2.5 font-mono text-xs">
                        {a.providerType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isConnected ? (
                          <Wifi className="size-4 text-emerald-500" />
                        ) : (
                          <WifiOff className="size-4 text-muted-foreground" />
                        )}
                        <span
                          className={
                            isConnected
                              ? "text-sm font-medium text-emerald-500"
                              : "text-sm text-muted-foreground"
                          }
                        >
                          {sessionStatus === "CONNECTED"
                            ? "Connected"
                            : sessionStatus === "CONNECTING"
                              ? "Connecting…"
                              : "Disconnected"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {a.providerType === "BAILEYS" && !isConnected && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => setQrAccountId(a.id)}
                          >
                            <QrCode className="mr-1.5 size-3.5" />
                            Show QR
                          </Button>
                        )}
                        {a.providerType === "BAILEYS" && isConnected && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-xl text-destructive hover:text-destructive"
                            disabled={
                              disconnectMutation.isPending &&
                              disconnectMutation.variables === a.id
                            }
                            onClick={() => disconnectMutation.mutate(a.id)}
                          >
                            {disconnectMutation.isPending &&
                            disconnectMutation.variables === a.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              "Disconnect"
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
