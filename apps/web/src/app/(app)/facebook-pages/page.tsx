"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { FacebookPage } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  MessageCircle,
  Share2,
  Trash2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function FacebookPagesPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Handle post-OAuth redirect feedback
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) {
      toast.success(`${connected} Facebook page${Number(connected) !== 1 ? "s" : ""} connected.`);
    } else if (error) {
      const messages: Record<string, string> = {
        invalid_state:        "OAuth session expired. Please try again.",
        token_exchange_failed:"Could not exchange the Facebook token. Please retry.",
        no_pages:             "No Facebook Pages found on your account. Make sure you manage at least one Page.",
        missing_params:       "OAuth callback was missing required parameters.",
        unknown:              "An unexpected error occurred. Please try again.",
      };
      toast.error(messages[error] ?? "Facebook connection failed.");
    }
  }, [searchParams]);

  const { data: pages = [], isLoading } = useQuery({
    queryKey: qk.facebookPages,
    queryFn: async () => {
      const { data } = await api.get<FacebookPage[]>("/facebook/pages");
      return data;
    },
  });

  const { data: authUrlData, isFetching: loadingAuthUrl } = useQuery({
    queryKey: ["facebook-auth-url"],
    queryFn: async () => {
      const { data } = await api.get<{ url: string }>("/facebook/pages/auth-url");
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 min — state stored in Redis for 10 min
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/facebook/pages/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.facebookPages });
      toast.success("Page disconnected");
    },
    onError: () => toast.error("Could not remove page"),
  });

  const handleConnect = () => {
    if (!authUrlData?.url) return;
    window.location.href = authUrlData.url;
  };

  const ConnectButton = (
    <Button
      type="button"
      className="rounded-xl shadow-sm hover:shadow-md"
      disabled={loadingAuthUrl || !authUrlData?.url}
      onClick={handleConnect}
    >
      {loadingAuthUrl ? (
        <Loader2 className="mr-1.5 size-4 animate-spin" />
      ) : (
        <Share2 className="mr-1.5 size-4" />
      )}
      Connect Facebook
    </Button>
  );

  return (
    <div className="page-container space-y-8">
      <PageHeader
        title="Facebook Pages"
        description="Connect your Facebook Pages to receive and reply to Messenger conversations."
        action={ConnectButton}
      />

      {/* Meta policy callout */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-sm">
        <Zap className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div>
          <p className="font-medium text-amber-400">
            Meta App Review required for production
          </p>
          <p className="mt-0.5 text-[#6B7280]">
            The{" "}
            <code className="rounded bg-[#F3F4F6] px-1 py-0.5 font-mono text-xs text-[#6B7280]">pages_messaging</code>{" "}
            permission requires Meta App Review before non-test users can connect Pages.
            In Development Mode, only test users assigned in your Meta App Dashboard can grant
            access. Messenger replies are only permitted within the{" "}
            <strong className="text-[#6B7280]">24-hour messaging window</strong> — outside this window, use MESSAGE_TAG
            messages only.
          </p>
        </div>
      </div>

      {isLoading ? null : pages.length === 0 ? (
        <EmptyState
          icon={Share2}
          title="No Facebook Pages connected"
          description="Connect your Facebook account to see and manage your Pages here."
          action={ConnectButton}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <div
              key={page.id}
              className="overflow-hidden rounded-2xl border border-emerald-200 bg-white transition-all duration-200 hover:border-blue-900/50 hover:shadow-lg"
            >
              {/* Top accent */}
              <div className="h-0.5 w-full bg-gradient-to-r from-blue-500/80 to-blue-400/40" />

              {/* Card header */}
              <div className="flex items-start justify-between gap-3 bg-blue-500/5 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                    <Share2 className="size-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight text-[#111827]">{page.name}</p>
                    {page.category && (
                      <p className="mt-0.5 font-mono text-xs text-[#6B7280]">
                        {page.category}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status pill */}
                <div
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    page.isActive
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                      : "border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF]",
                  )}
                >
                  {page.isActive ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <Circle className="size-3" />
                  )}
                  {page.isActive ? "Active" : "Inactive"}
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 divide-x divide-[#F3F4F6] border-t border-[#E5E7EB]">
                <div className="px-5 py-3 text-center">
                  <p className="text-xl font-bold text-[#111827]">
                    {page._count?.inboxThreads ?? 0}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-[#9CA3AF]">
                    Conversations
                  </p>
                </div>
                <div className="px-5 py-3 text-center">
                  <p className="mt-1 font-mono text-xs text-[#6B7280] break-all">
                    {page.pageId}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-[#9CA3AF]">
                    Page ID
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 border-t border-[#E5E7EB] px-4 py-3">
                <Link href={`/facebook-pages/${page.id}`} className="flex-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full rounded-xl border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#6B7280] gap-1.5 hover:border-[#D1D5DB] hover:bg-[#F3F4F6] hover:text-[#111827]"
                  >
                    <ExternalLink className="size-3.5" />
                    Manage
                  </Button>
                </Link>
                <Link href={`/inbox?channel=MESSENGER&pageId=${page.id}`} className="flex-1">
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
                    removeMutation.variables === page.id
                  }
                  onClick={() => removeMutation.mutate(page.id)}
                >
                  {removeMutation.isPending &&
                  removeMutation.variables === page.id ? (
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

      {pages.length > 0 && (
        <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 text-sm text-[#6B7280]">
          <p className="mb-1 font-medium text-[#111827]">How it works</p>
          <p>
            Each connected Page receives Messenger messages in the unified{" "}
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
            will match inbound Messenger messages automatically.
          </p>
        </div>
      )}
    </div>
  );
}
