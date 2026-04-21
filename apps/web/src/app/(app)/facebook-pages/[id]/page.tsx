"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { FacebookPage } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Share2,
  Globe,
  Info,
  Loader2,
  MessageCircle,
  Settings,
  Trash2,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "overview" | "settings";

export default function FacebookPageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  const { data: pages = [] } = useQuery({
    queryKey: qk.facebookPages,
    queryFn: async () => {
      const { data } = await api.get<FacebookPage[]>("/facebook/pages");
      return data;
    },
  });

  const page = pages.find((p) => p.id === id);

  const removeMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/facebook/pages/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.facebookPages });
      toast.success("Page disconnected");
      router.push("/facebook-pages");
    },
    onError: () => toast.error("Could not remove page"),
  });

  if (!page) {
    return (
      <div className="page-container flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-4">
        <Link href="/facebook-pages">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/15">
            <Share2 className="size-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">{page.name}</h1>
            {page.category && (
              <p className="text-xs text-muted-foreground">{page.category}</p>
            )}
          </div>
        </div>
        <Badge
          variant="outline"
          className={`ml-auto shrink-0 rounded-lg text-xs font-mono ${
            page.isActive
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          }`}
        >
          {page.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/20 p-1 w-fit">
        {(["overview", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-all",
              tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Status card */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CheckCircle2 className="size-4" />
              Connection
            </div>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium">Page token active</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Page access tokens do not expire unless the user revokes access.
            </p>
          </div>

          {/* Webhook card */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Webhook className="size-4" />
              Webhook
            </div>
            <p className="text-sm font-medium">Verify endpoint</p>
            <code className="mt-1.5 block rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all">
              {typeof window !== "undefined"
                ? `${window.location.origin.replace(":3000", ":3001")}/facebook/webhook`
                : "/facebook/webhook"}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              Register this URL in your Meta App Dashboard under Webhooks → Page subscription.
              Subscribe to the <code className="font-mono">messages</code> field.
            </p>
          </div>

          {/* Conversations card */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <MessageCircle className="size-4" />
              Conversations
            </div>
            <p className="text-3xl font-bold">{page._count?.inboxThreads ?? 0}</p>
            <Link
              href={`/inbox?channel=MESSENGER&pageId=${page.id}`}
              className="mt-3 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
            >
              Open in Inbox
            </Link>
          </div>

          {/* 24-hour window notice */}
          <div className="col-span-full flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-4 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-blue-500" />
            <div>
              <p className="font-medium">24-Hour Messaging Window</p>
              <p className="mt-0.5 text-muted-foreground">
                You can only reply to a Messenger conversation within 24 hours of the last user
                message. After this window expires, replies will fail with a permissions error
                from Meta. Use MESSAGE_TAG messages for post-window notifications (requires
                App Review approval for the relevant tag category).
              </p>
            </div>
          </div>

          {/* Automation quick links */}
          <div className="col-span-full grid gap-3 sm:grid-cols-2">
            <Link href={`/keyword-triggers`}>
              <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer">
                <Globe className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Keyword Triggers</p>
                  <p className="text-xs text-muted-foreground">
                    All-channel and Messenger-scoped keyword rules apply to this Page.
                  </p>
                </div>
              </div>
            </Link>
            <Link href={`/autoresponder`}>
              <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer">
                <MessageCircle className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Autoresponder Rules</p>
                  <p className="text-xs text-muted-foreground">
                    Workspace-wide autoresponders fire for this Page. Page-scoped rules in Phase 2.
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* Settings tab */}
      {tab === "settings" && (
        <div className="grid gap-4 max-w-lg">
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Settings className="size-4" />
              Page details
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Page name
                </p>
                <p className="font-medium">{page.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Facebook Page ID
                </p>
                <code className="font-mono text-xs bg-muted px-2 py-1 rounded-lg">
                  {page.pageId}
                </code>
              </div>
              {page.category && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Category
                  </p>
                  <p>{page.category}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Connected
                </p>
                <p>{new Date(page.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5">
            <p className="mb-1 text-sm font-medium text-destructive">Danger zone</p>
            <p className="mb-4 text-xs text-muted-foreground">
              Disconnecting this Page will stop all Messenger automation. Existing inbox threads
              are preserved but new messages will not be received.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="rounded-xl"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate()}
            >
              {removeMutation.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 size-4" />
              )}
              Disconnect page
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
