"use client";

import { PageHeader } from "@/components/layout/page-header";
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
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { InstagramAccount } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  MessageCircle,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface PendingAccount {
  igUserId: string;
  username: string | null;
  name: string;
}

export default function InstagramAccountsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Account picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingAccounts, setPendingAccounts] = useState<PendingAccount[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [loadingPending, setLoadingPending] = useState(false);

  // Handle post-OAuth redirect feedback and ?pending=TOKEN
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const pending = searchParams.get("pending");

    if (pending) {
      // Fetch pending accounts and open picker
      setLoadingPending(true);
      api
        .get<{ token: string; accounts: PendingAccount[] }>(`/instagram/accounts/pending?token=${pending}`)
        .then(({ data }) => {
          setPendingToken(data.token);
          setPendingAccounts(data.accounts);
          setSelectedAccountIds(new Set(data.accounts.map((a) => a.igUserId)));
          setPickerOpen(true);
        })
        .catch(() => {
          toast.error("Account selection expired or invalid. Please reconnect.");
        })
        .finally(() => setLoadingPending(false));
      // Clear the query param from URL without navigation
      router.replace("/instagram-accounts");
      return;
    }

    if (connected) {
      toast.success(`${connected} Instagram account${Number(connected) !== 1 ? "s" : ""} connected.`);
      router.replace("/instagram-accounts");
    } else if (error) {
      const messages: Record<string, string> = {
        invalid_state:        "OAuth session expired. Please try again.",
        token_exchange_failed:"Could not exchange the Instagram token. Please retry.",
        no_accounts:          "No Instagram Business accounts found. Make sure your account is a Business or Creator account linked to a Facebook Page.",
        missing_params:       "OAuth callback was missing required parameters.",
        unknown:              "An unexpected error occurred. Please try again.",
      };
      toast.error(messages[error] ?? "Instagram connection failed.");
      router.replace("/instagram-accounts");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const confirmMutation = useMutation({
    mutationFn: async ({ token, igUserIds }: { token: string; igUserIds: string[] }) => {
      const { data } = await api.post<{ connected: number }>("/instagram/accounts/confirm", {
        token,
        igUserIds,
      });
      return data;
    },
    onSuccess: (data) => {
      setPickerOpen(false);
      setPendingToken(null);
      setPendingAccounts([]);
      setSelectedAccountIds(new Set());
      void queryClient.invalidateQueries({ queryKey: qk.instagramAccounts });
      toast.success(
        `${data.connected} Instagram account${data.connected !== 1 ? "s" : ""} connected successfully.`,
      );
    },
    onError: () => toast.error("Could not confirm account selection. Please try again."),
  });

  const handleConfirmAccounts = () => {
    if (!pendingToken || selectedAccountIds.size === 0) return;
    confirmMutation.mutate({ token: pendingToken, igUserIds: Array.from(selectedAccountIds) });
  };

  const toggleAccount = (igUserId: string) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(igUserId)) {
        next.delete(igUserId);
      } else {
        next.add(igUserId);
      }
      return next;
    });
  };

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: qk.instagramAccounts,
    queryFn: async () => {
      const { data } = await api.get<InstagramAccount[]>("/instagram/accounts");
      return data;
    },
  });

  const syncFromPagesMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        token: string;
        accounts: PendingAccount[];
      }>("/instagram/accounts/sync-from-pages");
      return data;
    },
    onSuccess: (data) => {
      if (!data.token || data.accounts.length === 0) {
        toast.error(
          "No Instagram accounts found. Make sure at least one connected Facebook Page has a linked Instagram Business account.",
        );
        return;
      }
      setPendingToken(data.token);
      setPendingAccounts(data.accounts);
      setSelectedAccountIds(new Set(data.accounts.map((a) => a.igUserId)));
      setPickerOpen(true);
    },
    onError: () =>
      toast.error("Failed to search Facebook Pages for Instagram accounts."),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/instagram/accounts/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.instagramAccounts });
      toast.success("Account disconnected");
    },
    onError: () => toast.error("Could not remove account"),
  });

  const ConnectButton = (
    <Button
      type="button"
      className="rounded-xl shadow-sm hover:shadow-md"
      disabled={syncFromPagesMutation.isPending || loadingPending}
      onClick={() => syncFromPagesMutation.mutate()}
    >
      {syncFromPagesMutation.isPending || loadingPending ? (
        <Loader2 className="mr-1.5 size-4 animate-spin" />
      ) : (
        <RefreshCw className="mr-1.5 size-4" />
      )}
      Find Instagram Accounts
    </Button>
  );

  return (
    <div className="page-container space-y-8">
      {/* Account picker dialog — shown after OAuth redirect with ?pending=TOKEN */}
      <Dialog open={pickerOpen} onOpenChange={(open) => !confirmMutation.isPending && setPickerOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Accounts to Connect</DialogTitle>
            <DialogDescription>
              Choose which Instagram Business accounts you want to connect to Appleberry. You can connect more later.
            </DialogDescription>
          </DialogHeader>

          <div className="my-2 space-y-2 max-h-72 overflow-y-auto pr-1">
            {pendingAccounts.map((account) => {
              const checked = selectedAccountIds.has(account.igUserId);
              return (
                <button
                  key={account.igUserId}
                  type="button"
                  onClick={() => toggleAccount(account.igUserId)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                    checked
                      ? "border-pink-500/40 bg-pink-500/10"
                      : "border-[#E5E7EB] bg-[#F9FAFB] hover:bg-[#F3F4F6]",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                      checked
                        ? "border-pink-500 bg-pink-500"
                        : "border-[#D1D5DB] bg-white",
                    )}
                  >
                    {checked && (
                      <svg className="size-3 text-white" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-[#111827]">{account.name}</p>
                    {account.username && (
                      <p className="truncate text-xs text-[#6B7280]">@{account.username}</p>
                    )}
                  </div>
                  <p className="shrink-0 font-mono text-[10px] text-[#9CA3AF]">{account.igUserId}</p>
                </button>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setPickerOpen(false)}
              disabled={confirmMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              disabled={selectedAccountIds.size === 0 || confirmMutation.isPending}
              onClick={handleConfirmAccounts}
            >
              {confirmMutation.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Camera className="mr-1.5 size-4" />
              )}
              Connect {selectedAccountIds.size > 0 ? `${selectedAccountIds.size} ` : ""}
              {selectedAccountIds.size === 1 ? "Account" : "Accounts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageHeader
        title="Instagram Accounts"
        description="Connect your Instagram Business accounts for DM automation"
        action={ConnectButton}
      />

      {/* How-it-works callout */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-sm">
        <Zap className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div>
          <p className="font-medium text-amber-400">
            Connect via your Facebook Pages
          </p>
          <p className="mt-0.5 text-[#6B7280]">
            Click <strong className="text-[#6B7280]">Find Instagram Accounts</strong> to
            automatically discover Instagram Business accounts linked to your connected Facebook Pages.
            No additional login required — just make sure you have at least one{" "}
            <strong className="text-[#6B7280]">Facebook Page</strong> connected under{" "}
            <strong className="text-[#6B7280]">Channels → Facebook Pages</strong>, and
            that the Page has an Instagram Business (or Creator) account linked to it in Meta Business Suite.
          </p>
        </div>
      </div>

      {isLoading ? null : accounts.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No Instagram accounts connected"
          description="Click Find Instagram Accounts to discover Business accounts linked to your connected Facebook Pages."
          action={ConnectButton}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="overflow-hidden rounded-2xl border border-emerald-200 bg-white transition-all duration-200 hover:border-pink-900/50 hover:shadow-lg"
            >
              {/* Top accent */}
              <div className="h-0.5 w-full bg-gradient-to-r from-pink-500/80 to-rose-400/40" />

              {/* Card header */}
              <div className="flex items-start justify-between gap-3 bg-pink-500/5 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-pink-500/10">
                    <Camera className="size-5 text-pink-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight text-[#111827]">{account.name}</p>
                    {account.username && (
                      <p className="mt-0.5 font-mono text-xs text-[#6B7280]">
                        @{account.username}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status pill */}
                <div
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    account.isActive
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : "border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF]",
                  )}
                >
                  {account.isActive ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <Circle className="size-3" />
                  )}
                  {account.isActive ? "Active" : "Inactive"}
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 divide-x divide-[#F3F4F6] border-t border-[#E5E7EB]">
                <div className="px-5 py-3 text-center">
                  <p className="text-xl font-bold text-[#111827]">
                    {account._count?.inboxThreads ?? 0}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-[#9CA3AF]">
                    Conversations
                  </p>
                </div>
                <div className="px-5 py-3 text-center">
                  <p className="mt-1 font-mono text-xs text-[#6B7280] break-all">
                    {account.igUserId}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-[#9CA3AF]">
                    IG User ID
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 border-t border-[#E5E7EB] px-4 py-3">
                <Link href={`/instagram-accounts/${account.id}`} className="flex-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full rounded-xl border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#6B7280] gap-1.5 hover:border-[#D1D5DB] hover:bg-[#F3F4F6] hover:text-[#111827]"
                  >
                    <ExternalLink className="size-3.5" />
                    Manage
                  </Button>
                </Link>
                <Link href={`/inbox?channel=INSTAGRAM&accountId=${account.id}`} className="flex-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full rounded-xl border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#6B7280] gap-1.5 hover:border-[#D1D5DB] hover:bg-[#F3F4F6] hover:text-[#111827]"
                  >
                    <MessageCircle className="size-3.5" />
                    Inbox
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-xs text-red-500/70 hover:bg-red-500/10 hover:text-red-400"
                  disabled={
                    removeMutation.isPending &&
                    removeMutation.variables === account.id
                  }
                  onClick={() => removeMutation.mutate(account.id)}
                >
                  {removeMutation.isPending &&
                  removeMutation.variables === account.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {accounts.length > 0 && (
        <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 text-sm text-[#6B7280]">
          <p className="mb-1 font-medium text-[#111827]">How it works</p>
          <p>
            Each connected Instagram account receives DMs in the unified{" "}
            <Link
              href="/inbox"
              className="font-medium text-[#6366F1] underline-offset-2 hover:underline"
            >
              Inbox
            </Link>
            . Keyword triggers and autoresponders you create under{" "}
            <Link
              href="/keyword-triggers"
              className="font-medium text-[#6366F1] underline-offset-2 hover:underline"
            >
              Automation
            </Link>{" "}
            will match inbound Instagram DMs automatically.
          </p>
        </div>
      )}
    </div>
  );
}
