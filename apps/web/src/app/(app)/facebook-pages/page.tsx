"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { FacebookPage } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Share2,
  Loader2,
  MessageCircle,
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
        invalid_state: "OAuth session expired. Please try again.",
        token_exchange_failed: "Could not exchange the Facebook token. Please retry.",
        no_pages: "No Facebook Pages found on your account. Make sure you manage at least one Page.",
        missing_params: "OAuth callback was missing required parameters.",
        unknown: "An unexpected error occurred. Please try again.",
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
          <p className="font-medium text-amber-600 dark:text-amber-400">
            Meta App Review required for production
          </p>
          <p className="mt-0.5 text-muted-foreground">
            The{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">pages_messaging</code>{" "}
            permission requires Meta App Review before non-test users can connect Pages.
            In Development Mode, only test users assigned in your Meta App Dashboard can grant
            access. Messenger replies are only permitted within the{" "}
            <strong>24-hour messaging window</strong> — outside this window, use MESSAGE_TAG
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
              className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-md"
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-3 bg-blue-500/5 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15">
                    <Share2 className="size-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{page.name}</p>
                    {page.category && (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {page.category}
                      </p>
                    )}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`shrink-0 rounded-lg text-xs font-mono ${
                    page.isActive
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {page.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 divide-x divide-border/40 border-t border-border/40">
                <div className="px-5 py-3 text-center">
                  <p className="text-xl font-bold">
                    {page._count?.inboxThreads ?? 0}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Conversations
                  </p>
                </div>
                <div className="px-5 py-3 text-center">
                  <p className="font-mono text-xs text-muted-foreground mt-2 break-all">
                    {page.pageId}
                  </p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Page ID
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 border-t border-border/40 px-4 py-3">
                <Link href={`/facebook-pages/${page.id}`} className="flex-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full rounded-xl text-xs gap-1.5"
                  >
                    <ExternalLink className="size-3.5" />
                    Manage
                  </Button>
                </Link>
                <Link href={`/inbox?channel=MESSENGER&pageId=${page.id}`} className="flex-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full rounded-xl text-xs gap-1.5"
                  >
                    <MessageCircle className="size-3.5" />
                    Inbox
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-xs text-destructive hover:text-destructive"
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
        <div className="rounded-xl border border-border/50 bg-muted/20 px-5 py-4 text-sm text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">How it works</p>
          <p>
            Each connected Page receives Messenger messages in the unified{" "}
            <Link
              href="/inbox"
              className="underline underline-offset-2 text-primary"
            >
              Inbox
            </Link>
            . Keyword triggers and autoresponders you create under{" "}
            <Link
              href="/keyword-triggers"
              className="underline underline-offset-2 text-primary"
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
