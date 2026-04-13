"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { InboxMessage, InboxThread } from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function threadHasUnread(t: InboxThread): boolean {
  const latest = t.messages?.[0];
  return latest?.direction === "INBOUND";
}

export default function InboxPage() {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [showTyping, setShowTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: threads = [], isLoading } = useQuery({
    queryKey: qk.inboxThreads,
    queryFn: async () => {
      const { data } = await api.get<InboxThread[]>("/inbox/threads");
      return data;
    },
  });

  const { data: messages = [], isFetching: messagesFetching } = useQuery({
    queryKey: qk.inboxMessages(threadId ?? ""),
    enabled: !!threadId,
    queryFn: async () => {
      const { data } = await api.get<InboxMessage[]>(
        `/inbox/threads/${threadId}/messages`,
      );
      return data;
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, showTyping, threadId]);

  useEffect(() => {
    if (!threadId) {
      setShowTyping(false);
      return;
    }
    const id = window.setInterval(() => {
      setShowTyping((v) => !v);
    }, 2200);
    return () => clearInterval(id);
  }, [threadId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!threadId) return;
      await api.post("/inbox/send", { threadId, message: draft });
    },
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({
        queryKey: qk.inboxMessages(threadId ?? ""),
      });
      void queryClient.invalidateQueries({ queryKey: qk.inboxThreads });
    },
    onError: (e) => toast.error("Could not send", getApiErrorMessage(e)),
  });

  const patchMutation = useMutation({
    mutationFn: async (body: {
      status?: "OPEN" | "CLOSED";
      assignedToId?: string | null;
    }) => {
      if (!threadId) return;
      await api.patch(`/inbox/threads/${threadId}`, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.inboxThreads });
    },
    onError: (e) => toast.error("Could not update thread", getApiErrorMessage(e)),
  });

  const active = threads.find((t) => t.id === threadId);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:h-[calc(100vh-4rem)]">
      <div className="page-container border-b border-border/60 pb-6 pt-2">
        <PageHeader
          title="Inbox"
          description="Reply fast. Unread customer threads are highlighted."
        />
      </div>
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(240px,300px)_1fr]">
        <div className="border-b border-border/60 bg-muted/15 md:border-b-0 md:border-r md:border-border/60">
          <ScrollArea className="h-full md:max-h-[calc(100vh-12rem)]">
            <div className="space-y-1 p-3">
              {isLoading ? (
                <div className="space-y-2 p-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-[4.25rem] w-full rounded-xl" />
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <EmptyState
                  className="mx-2 my-4 border-none bg-transparent"
                  icon={Inbox}
                  title="No conversations yet"
                  description="When customers message your WhatsApp numbers, threads appear here."
                />
              ) : (
                threads.map((t) => {
                  const unread = threadHasUnread(t);
                  const preview = t.messages?.[0]?.message;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setThreadId(t.id)}
                      className={cn(
                        "w-full rounded-xl border border-transparent px-3 py-2.5 text-left text-sm transition-all duration-200",
                        t.id === threadId
                          ? "border-border/80 bg-background shadow-md ring-1 ring-border/50"
                          : "hover:border-border/60 hover:bg-background/80 hover:shadow-sm",
                        unread && t.id !== threadId && "bg-primary/5 ring-1 ring-primary/15",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 font-medium leading-tight">
                          {t.contact.firstName} {t.contact.lastName}
                        </div>
                        {unread ? (
                          <span className="mt-0.5 size-2 shrink-0 rounded-full bg-primary shadow-sm" />
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {t.contact.phone}
                      </div>
                      {preview ? (
                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {preview}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t.status} · {t._count?.messages ?? 0} messages
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex min-h-0 flex-col bg-background/40">
          {!threadId ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={Inbox}
                title="Select a thread"
                description="Choose a conversation to read and reply."
              />
            </div>
          ) : (
            <>
              <div className="space-y-3 border-b border-border/60 p-4 md:p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select
                      value={active?.status}
                      onValueChange={(v) => {
                        if (v === "OPEN" || v === "CLOSED") {
                          patchMutation.mutate({ status: v });
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 w-[140px] rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="OPEN">Open</SelectItem>
                        <SelectItem value="CLOSED">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="rounded-xl"
                    onClick={() =>
                      me && patchMutation.mutate({ assignedToId: me.id })
                    }
                    disabled={!me || patchMutation.isPending}
                  >
                    {patchMutation.isPending ? (
                      <Loader2 className="mr-1 size-3.5 animate-spin" />
                    ) : null}
                    Assign to me
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => patchMutation.mutate({ assignedToId: null })}
                    disabled={patchMutation.isPending}
                  >
                    Unassign
                  </Button>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grid min-w-[200px] flex-1 gap-1">
                    <Label className="text-xs text-muted-foreground">
                      Assign to user (UUID)
                    </Label>
                    <Input
                      className="rounded-xl"
                      placeholder="User UUID"
                      value={assignUserId}
                      onChange={(e) => setAssignUserId(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => {
                      if (!assignUserId.trim()) {
                        toast.info("Enter a user id to assign.");
                        return;
                      }
                      patchMutation.mutate({ assignedToId: assignUserId.trim() });
                    }}
                    disabled={patchMutation.isPending}
                  >
                    Apply
                  </Button>
                </div>
                {active?.assignedTo ? (
                  <p className="text-xs text-muted-foreground">
                    Assigned: {active.assignedTo.name ?? active.assignedTo.email}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Unassigned</p>
                )}
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-3 p-4 md:p-5">
                  {messagesFetching && messages.length === 0 ? (
                    <div className="space-y-3">
                      <Skeleton className="ml-auto h-16 w-[78%] rounded-xl" />
                      <Skeleton className="h-14 w-[72%] rounded-xl" />
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm shadow-sm transition-shadow duration-200",
                          m.direction === "OUTBOUND"
                            ? "ml-auto bg-primary text-primary-foreground"
                            : "bg-muted/80 ring-1 ring-border/40",
                        )}
                      >
                        <div className="text-[10px] opacity-80">
                          {m.direction === "OUTBOUND" ? "You" : "Customer"} ·{" "}
                          {new Date(m.createdAt).toLocaleString()}
                        </div>
                        <div className="whitespace-pre-wrap">{m.message}</div>
                      </div>
                    ))
                  )}
                  {showTyping && threadId ? (
                    <div className="flex max-w-[78%] items-center gap-2 rounded-xl bg-muted/80 px-3.5 py-2.5 text-xs text-muted-foreground ring-1 ring-border/40">
                      <span className="flex gap-1">
                        <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.2s]" />
                        <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.1s]" />
                        <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/70" />
                      </span>
                      Customer is typing…
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="space-y-2 border-t border-border/60 bg-background/80 p-4 backdrop-blur-sm md:p-5">
                <Textarea
                  rows={3}
                  className="min-h-[88px] rounded-xl"
                  placeholder="Write a reply…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button
                  className="rounded-xl"
                  onClick={() => sendMutation.mutate()}
                  disabled={sendMutation.isPending || !draft.trim()}
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Send
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
