"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { WhatsAppAccount, WhatsAppSessionStatus } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, QrCode, Unplug, Wifi } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<WhatsAppSessionStatus, string> = {
  CONNECTED: "Connected",
  DISCONNECTED: "Disconnected",
  PENDING_QR: "Awaiting scan",
  RECONNECTING: "Reconnecting",
  ERROR: "Error",
};

const STATUS_VARIANT: Record<
  WhatsAppSessionStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  CONNECTED: "default",
  PENDING_QR: "secondary",
  RECONNECTING: "secondary",
  DISCONNECTED: "outline",
  ERROR: "destructive",
};

function StatusBadge({ status }: { status: WhatsAppSessionStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

// ── QR connect modal ──────────────────────────────────────────────────────────

interface SessionInfo {
  accountId: string;
  status: WhatsAppSessionStatus;
  qrDataUrl: string | null;
}

function QrConnectModal({
  account,
  open,
  onOpenChange,
}: {
  account: WhatsAppAccount;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const poll = async () => {
    try {
      const { data } = await api.get<SessionInfo>(
        `/whatsapp/accounts/${account.id}/session`,
      );
      setSession(data);
      if (data.status === "CONNECTED") {
        stopPolling();
        void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
        toast.success(`${account.name} is now connected to WhatsApp!`);
        onOpenChange(false);
      }
    } catch {
      // silently ignore polling errors
    }
  };

  const startConnect = async () => {
    setConnecting(true);
    try {
      await api.post(`/whatsapp/accounts/${account.id}/connect`);
      // Begin polling for QR / connected status
      pollRef.current = setInterval(() => { void poll(); }, 2000);
      void poll();
    } catch (e) {
      toast.error("Could not start connection", getApiErrorMessage(e));
    } finally {
      setConnecting(false);
    }
  };

  // Auto-start when modal opens
  useEffect(() => {
    if (open) {
      setSession(null);
      void startConnect();
    } else {
      stopPolling();
    }
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDisconnect = async () => {
    try {
      await api.delete(`/whatsapp/accounts/${account.id}/session`);
      stopPolling();
      setSession(null);
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      toast.success("Disconnected");
      onOpenChange(false);
    } catch (e) {
      toast.error("Could not disconnect", getApiErrorMessage(e));
    }
  };

  const isConnected = session?.status === "CONNECTED";
  const isPending = session?.status === "PENDING_QR" || session?.status === "RECONNECTING";
  const hasQr = !!session?.qrDataUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2">
            <QrCode className="h-5 w-5" />
            Connect {account.name}
          </DialogTitle>
          <DialogDescription>
            {isConnected
              ? "Your WhatsApp account is connected."
              : "Scan the QR code with WhatsApp on your phone."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {/* Status badge */}
          {session && <StatusBadge status={session.status} />}

          {/* QR code image */}
          {hasQr && !isConnected ? (
            <div className="rounded-xl border p-2 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={session!.qrDataUrl!}
                alt="WhatsApp QR code"
                className="h-52 w-52"
              />
            </div>
          ) : isConnected ? (
            <div className="flex h-52 w-52 flex-col items-center justify-center gap-2 rounded-xl border bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">
              <Wifi className="h-12 w-12" />
              <p className="text-sm font-medium">Connected!</p>
            </div>
          ) : (
            <div className="flex h-52 w-52 flex-col items-center justify-center gap-2 rounded-xl border bg-muted">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {connecting ? "Starting…" : isPending ? "Generating QR…" : "Waiting…"}
              </p>
            </div>
          )}

          {/* Instructions */}
          {hasQr && !isConnected && (
            <ol className="list-decimal text-left text-xs text-muted-foreground space-y-1 pl-4">
              <li>Open WhatsApp on your phone</li>
              <li>Go to Settings → Linked Devices</li>
              <li>Tap "Link a Device" and scan this code</li>
            </ol>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {session && !isConnected && (
            <Button variant="outline" size="sm" onClick={handleDisconnect}>
              <Unplug className="mr-1 h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="ml-auto"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WhatsAppAccountsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [providerType, setProviderType] = useState<"MOCK" | "CLOUD" | "BAILEYS">("MOCK");

  // QR modal state
  const [qrAccount, setQrAccount] = useState<WhatsAppAccount | null>(null);

  const { data: accounts = [], isLoading, error } = useQuery({
    queryKey: qk.whatsappAccounts,
    queryFn: async () => {
      const { data } = await api.get<WhatsAppAccount[]>("/whatsapp/accounts");
      return data;
    },
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/whatsapp/accounts", {
        name,
        phone: phone || undefined,
        providerType,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.whatsappAccounts });
      setAddOpen(false);
      setName("");
      setPhone("");
      setProviderType("MOCK");
    },
    onError: (e) =>
      toast.error("Could not add account", getApiErrorMessage(e)),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="WhatsApp accounts"
        description="Connected senders for this workspace."
        action={
          <>
            <Button type="button" onClick={() => setAddOpen(true)}>
              Add account
            </Button>

            {/* ── Add account dialog ── */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New WhatsApp account</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid gap-2">
                    <Label>Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Phone (optional)</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Provider</Label>
                    <Select
                      value={providerType}
                      onValueChange={(v) =>
                        setProviderType(v as "MOCK" | "CLOUD" | "BAILEYS")
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MOCK">MOCK — local dev (no real messages)</SelectItem>
                        <SelectItem value="CLOUD">CLOUD — Meta WhatsApp API</SelectItem>
                        <SelectItem value="BAILEYS">BAILEYS — scan QR code (Pro+)</SelectItem>
                      </SelectContent>
                    </Select>
                    {providerType === "BAILEYS" && (
                      <p className="text-xs text-muted-foreground">
                        After creating, click <strong>Connect</strong> to scan the QR code with your phone.
                      </p>
                    )}
                    {providerType === "CLOUD" && (
                      <p className="text-xs text-muted-foreground">
                        Requires <code>WHATSAPP_TOKEN</code> and <code>WHATSAPP_PHONE_ID</code> in the server environment.
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    disabled={createMutation.isPending || name.length < 2}
                    onClick={() => createMutation.mutate()}
                  >
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {error ? (
        <p className="text-sm text-destructive">{getApiErrorMessage(error)}</p>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No accounts. Add one above.
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((a) => {
                const sessionStatus: WhatsAppSessionStatus =
                  a.session?.status ?? a.sessionStatus ?? "DISCONNECTED";
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {a.phone ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.providerType}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={sessionStatus} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.providerType === "BAILEYS" &&
                        sessionStatus !== "CONNECTED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setQrAccount(a)}
                          >
                            <QrCode className="mr-1 h-3.5 w-3.5" />
                            Connect
                          </Button>
                        )}
                      {a.providerType === "BAILEYS" &&
                        sessionStatus === "CONNECTED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setQrAccount(a)}
                          >
                            <Unplug className="mr-1 h-3.5 w-3.5" />
                            Disconnect
                          </Button>
                        )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* QR connect / disconnect modal */}
      {qrAccount && (
        <QrConnectModal
          account={qrAccount}
          open={!!qrAccount}
          onOpenChange={(v) => { if (!v) setQrAccount(null); }}
        />
      )}
    </div>
  );
}
