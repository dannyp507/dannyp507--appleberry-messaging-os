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
import { Textarea } from "@/components/ui/textarea";
import { api, getApiErrorMessage } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import type { AutoresponderRule, WhatsAppAccount } from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  FileImage,
  FileVideo,
  FileText,
  Globe,
  Hash,
  ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001";

function mediaIcon(url: string) {
  const ext = url.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return <FileImage className="size-3.5" />;
  if (["mp4", "mov", "avi", "3gp", "mkv", "webm"].includes(ext)) return <FileVideo className="size-3.5" />;
  return <FileText className="size-3.5" />;
}

// ─── Planify X JSON types ─────────────────────────────────────────────────────
interface PlanifyBot {
  name: string;
  keywords: string;
  type_search: string; // "1" = exact, "2" = contains
  caption: string;
  use_ai?: string;
  is_default?: string;
  nextBot?: string; // keyword of the next chatbot item to chain after this one
}
interface PlanifyJson {
  version?: string;
  chatbots: PlanifyBot[];
}

/**
 * Follow the nextBot chain for a given bot and collect all captions in order.
 * Returns them joined by '\n---\n' so the dispatch sends separate WA messages.
 */
function resolveChain(
  bot: PlanifyBot,
  byKeyword: Map<string, PlanifyBot>,
  visited = new Set<string>(),
): string {
  const captions: string[] = [bot.caption?.trim()].filter(Boolean);
  let next = bot.nextBot?.trim();
  while (next && !visited.has(next)) {
    visited.add(next);
    const nextBot = byKeyword.get(next.toLowerCase());
    if (!nextBot || !nextBot.caption?.trim()) break;
    captions.push(nextBot.caption.trim());
    next = nextBot.nextBot?.trim();
  }
  return captions.join("\n---\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cleanName(raw: string): string {
  return raw.replace(/_imported/gi, "").replace(/_+$/, "").trim();
}

// Group rules by name → one card per chatbot item
type Group = {
  name: string;
  items: AutoresponderRule[];
  active: boolean;
  response: string;
  matchType: "EXACT" | "CONTAINS" | "REGEX";
  mediaUrl: string | null;
};

function buildGroups(rules: AutoresponderRule[]): Group[] {
  const map = new Map<string, AutoresponderRule[]>();
  for (const r of rules) {
    const key = r.name ?? r.keyword;
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([name, items]) => ({
    name,
    items,
    active: items.some((i) => i.active),
    response: items[0].response,
    matchType: items[0].matchType,
    mediaUrl: items[0].mediaUrl ?? null,
  }));
}

// ─── Account section ──────────────────────────────────────────────────────────
function AccountSection({
  account,
  allRules,
  onEdit,
  onToggle,
  onDelete,
  onImport,
  onNew,
}: {
  account: WhatsAppAccount | null; // null = workspace-wide
  allRules: AutoresponderRule[];
  onEdit: (g: Group, accountId: string | null) => void;
  onToggle: (g: Group) => void;
  onDelete: (g: Group) => void;
  onImport: (file: File, accountId: string | null) => Promise<void>;
  onNew: (accountId: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const rules = allRules.filter((r) =>
    account ? r.whatsappAccountId === account.id : r.whatsappAccountId === null,
  );
  const groups = buildGroups(rules);

  const label = account
    ? account.name + (account.phone ? ` · ${account.phone}` : "")
    : "Workspace-wide (all numbers)";

  const statusDot =
    account?.session?.status === "CONNECTED"
      ? "bg-emerald-500"
      : account
      ? "bg-zinc-300 dark:bg-zinc-600"
      : "bg-blue-400";

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      {/* Header row */}
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`size-2.5 rounded-full ${statusDot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {account ? (
              <Phone className="size-3.5 text-muted-foreground shrink-0" />
            ) : (
              <Globe className="size-3.5 text-blue-500 shrink-0" />
            )}
            <span className="font-semibold text-sm truncate">{label}</span>
            <Badge variant="outline" className="rounded-md text-[11px] shrink-0">
              {groups.length} item{groups.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Import */}
          <label
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-xs font-medium shadow-sm transition hover:bg-muted ${importing ? "pointer-events-none opacity-60" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            {importing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            {importing ? "Importing…" : "Import JSON"}
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setImporting(true);
                try {
                  await onImport(f, account?.id ?? null);
                } finally {
                  setImporting(false);
                  if (fileRef.current) fileRef.current.value = "";
                }
              }}
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-lg px-2.5 text-xs gap-1"
            onClick={(e) => {
              e.stopPropagation();
              onNew(account?.id ?? null);
            }}
          >
            <Plus className="size-3.5" />
            Add item
          </Button>
          {open ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Items */}
      {open && groups.length === 0 && (
        <div className="border-t border-border/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No chatbot items yet — import a JSON flow or add an item.
        </div>
      )}

      {open &&
        groups.map((group, idx) => (
          <div
            key={group.name + idx}
            className="flex items-start gap-4 border-t border-border/40 px-4 py-3 transition-colors hover:bg-muted/20"
          >
            {/* Status dot */}
            <div
              className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${group.active ? "bg-emerald-500/10" : "bg-muted"}`}
            >
              <MessageSquare
                className={`size-3.5 ${group.active ? "text-emerald-500" : "text-muted-foreground"}`}
              />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm">{group.name}</span>
                <Badge
                  variant="outline"
                  className={`rounded-md text-[11px] font-medium ${group.active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                >
                  {group.active ? "Active" : "Inactive"}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-md text-[11px] font-mono text-muted-foreground"
                >
                  {group.matchType}
                </Badge>
              </div>

              {/* Keywords */}
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary"
                  >
                    <Hash className="size-3" />
                    {item.keyword}
                  </span>
                ))}
              </div>

              {/* Media badge */}
              {group.mediaUrl && (
                <div className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400">
                  {mediaIcon(group.mediaUrl)}
                  <span className="truncate max-w-[180px]">
                    {group.mediaUrl.split("/").pop()}
                  </span>
                </div>
              )}

              {/* Response preview */}
              {group.response && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {group.response}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 rounded-lg p-0"
                title={group.active ? "Disable" : "Enable"}
                onClick={() => onToggle(group)}
              >
                {group.active ? (
                  <PowerOff className="size-3.5 text-muted-foreground" />
                ) : (
                  <Power className="size-3.5 text-emerald-500" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 rounded-lg p-0"
                title="Edit"
                onClick={() => onEdit(group, account?.id ?? null)}
              >
                <Pencil className="size-3.5 text-muted-foreground" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 rounded-lg p-0 text-destructive hover:text-destructive"
                title="Delete"
                onClick={() => {
                  if (confirm(`Delete "${group.name}"?`)) onDelete(group);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ChatbotItemsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [dialogAccountId, setDialogAccountId] = useState<string | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemKeywords, setItemKeywords] = useState("");
  const [itemResponse, setItemResponse] = useState("");
  const [itemMatchType, setItemMatchType] = useState<"EXACT" | "CONTAINS">("EXACT");
  const [itemMediaUrl, setItemMediaUrl] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const mediaFileRef = useRef<HTMLInputElement>(null);

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: qk.autoresponderRules,
    queryFn: async () => {
      const { data } = await api.get<AutoresponderRule[]>("/autoresponder/rules");
      return data;
    },
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: qk.whatsappAccounts,
    queryFn: async () => {
      const { data } = await api.get<WhatsAppAccount[]>("/whatsapp-accounts");
      return data;
    },
  });

  const isLoading = rulesLoading || accountsLoading;

  // If ?account=<id> is in the URL, auto-open the new-item dialog for that account
  useEffect(() => {
    const accountParam = searchParams.get("account");
    if (accountParam && accounts.length > 0 && !dialogOpen) {
      openNew(accountParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length, searchParams]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      const keywords = itemKeywords.split(",").map((k) => k.trim()).filter(Boolean);
      if (!keywords.length) throw new Error("At least one keyword required");
      if (!itemResponse.trim() && !itemMediaUrl) throw new Error("Response or media required");
      for (const kw of keywords) {
        await api.post("/autoresponder/rules", {
          name: itemName.trim() || kw,
          keyword: kw,
          matchType: itemMatchType,
          response: itemResponse.trim(),
          active: true,
          whatsappAccountId: dialogAccountId ?? undefined,
          ...(itemMediaUrl ? { mediaUrl: itemMediaUrl } : {}),
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.autoresponderRules });
      setDialogOpen(false);
      toast.success("Chatbot item saved");
    },
    onError: (e) => toast.error("Could not save item", getApiErrorMessage(e)),
  });

  const editMutation = useMutation({
    mutationFn: async (group: Group) => {
      const keywords = itemKeywords.split(",").map((k) => k.trim()).filter(Boolean);
      if (!keywords.length) throw new Error("At least one keyword required");
      if (!itemResponse.trim() && !itemMediaUrl) throw new Error("Response or media required");
      for (const r of group.items) await api.delete(`/autoresponder/rules/${r.id}`);
      for (const kw of keywords) {
        await api.post("/autoresponder/rules", {
          name: itemName.trim() || kw,
          keyword: kw,
          matchType: itemMatchType,
          response: itemResponse.trim(),
          active: group.active,
          whatsappAccountId: dialogAccountId ?? undefined,
          ...(itemMediaUrl ? { mediaUrl: itemMediaUrl } : {}),
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.autoresponderRules });
      setDialogOpen(false);
      toast.success("Chatbot item updated");
    },
    onError: (e) => toast.error("Could not update item", getApiErrorMessage(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: async (group: Group) => {
      for (const r of group.items) await api.patch(`/autoresponder/rules/${r.id}/toggle`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.autoresponderRules }),
    onError: (e) => toast.error("Could not toggle", getApiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (group: Group) => {
      for (const r of group.items) await api.delete(`/autoresponder/rules/${r.id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.autoresponderRules });
      toast.success("Deleted");
    },
    onError: (e) => toast.error("Could not delete", getApiErrorMessage(e)),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openNew = (accountId: string | null) => {
    setEditingGroup(null);
    setDialogAccountId(accountId);
    setItemName("");
    setItemKeywords("");
    setItemResponse("");
    setItemMatchType("EXACT");
    setItemMediaUrl(null);
    setDialogOpen(true);
  };

  const openEdit = (group: Group, accountId: string | null) => {
    setEditingGroup(group);
    setDialogAccountId(accountId);
    setItemName(group.name);
    setItemKeywords(group.items.map((i) => i.keyword).join(", "));
    setItemResponse(group.response);
    setItemMatchType(group.matchType === "EXACT" ? "EXACT" : "CONTAINS");
    setItemMediaUrl(group.mediaUrl ?? null);
    setDialogOpen(true);
  };

  const handleMediaUpload = async (file: File) => {
    setUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post<{ url: string }>(
        "/autoresponder/media/upload",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setItemMediaUrl(data.url);
      toast.success("Media uploaded");
    } catch (e) {
      toast.error("Upload failed", getApiErrorMessage(e));
    } finally {
      setUploadingMedia(false);
      if (mediaFileRef.current) mediaFileRef.current.value = "";
    }
  };

  const handleImport = async (file: File, accountId: string | null) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text) as PlanifyJson;
      const bots: PlanifyBot[] = json?.chatbots ?? [];
      if (!bots.length) {
        toast.error("No chatbot items found in file");
        return;
      }

      // Build keyword → bot lookup so we can follow nextBot chains
      const byKeyword = new Map<string, PlanifyBot>();
      for (const bot of bots) {
        if (!bot.keywords?.trim()) continue;
        for (const kw of bot.keywords.split(",").map((k) => k.trim().toLowerCase())) {
          if (kw) byKeyword.set(kw, bot);
        }
      }

      let created = 0;
      for (const bot of bots) {
        if (bot.use_ai === "1" || bot.is_default === "1") continue;
        if (!bot.caption?.trim() || !bot.keywords?.trim()) continue;

        const name = cleanName(bot.name);
        const matchType: "EXACT" | "CONTAINS" =
          bot.type_search === "2" ? "CONTAINS" : "EXACT";

        // Resolve the full nextBot chain into one multi-part response.
        // Every item is imported as its own standalone rule so direct triggers
        // (e.g. typing "menu") always work, even if the item is also a chain
        // target of another rule.
        const response = resolveChain(bot, byKeyword);

        const keywords = bot.keywords
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean);

        for (const kw of keywords) {
          try {
            await api.post("/autoresponder/rules", {
              name,
              keyword: kw,
              matchType,
              response,
              active: true,
              whatsappAccountId: accountId ?? undefined,
            });
            created++;
          } catch {
            // skip duplicates / validation errors
          }
        }
      }
      void queryClient.invalidateQueries({ queryKey: qk.autoresponderRules });
      toast.success(`Imported ${created} chatbot item${created !== 1 ? "s" : ""}`);
    } catch {
      toast.error("Invalid JSON file");
    }
  };

  const totalActive = useMemo(
    () => buildGroups(rules).filter((g) => g.active).length,
    [rules],
  );

  const dialogAccountLabel = useMemo(() => {
    if (!dialogAccountId) return "Workspace-wide";
    const acc = accounts.find((a) => a.id === dialogAccountId);
    return acc ? acc.name + (acc.phone ? ` · ${acc.phone}` : "") : dialogAccountId;
  }, [dialogAccountId, accounts]);

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Chatbot Items"
        description="Keyword-triggered auto-replies. Each WhatsApp number has its own items. Rules also apply workspace-wide as a fallback."
        action={
          <Button className="rounded-xl shadow-sm" onClick={() => openNew(null)}>
            <Plus className="mr-1.5 size-4" />
            New item
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : accounts.length === 0 && rules.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No chatbot items yet"
          description="Create keyword-triggered replies or import a flow from Planify X / other chatbot platforms."
          action={
            <Button className="rounded-xl" onClick={() => openNew(null)}>
              <Plus className="mr-1.5 size-4" />
              New chatbot item
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Per-account sections */}
          {accounts.map((acc) => (
            <AccountSection
              key={acc.id}
              account={acc}
              allRules={rules}
              onEdit={openEdit}
              onToggle={(g) => toggleMutation.mutate(g)}
              onDelete={(g) => deleteMutation.mutate(g)}
              onImport={handleImport}
              onNew={openNew}
            />
          ))}

          {/* Workspace-wide fallback section */}
          <AccountSection
            account={null}
            allRules={rules}
            onEdit={openEdit}
            onToggle={(g) => toggleMutation.mutate(g)}
            onDelete={(g) => deleteMutation.mutate(g)}
            onImport={handleImport}
            onNew={openNew}
          />
        </div>
      )}

      {/* Stats */}
      {rules.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {totalActive} active · {buildGroups(rules).filter((g) => !g.active).length} inactive · {rules.length} total keyword rules
        </p>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {editingGroup ? "Edit chatbot item" : "New chatbot item"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Scope badge */}
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {dialogAccountId ? (
                <Phone className="size-3.5 shrink-0" />
              ) : (
                <Globe className="size-3.5 shrink-0 text-blue-500" />
              )}
              <span>Scope: <strong className="text-foreground">{dialogAccountLabel}</strong></span>
              {!editingGroup && (
                <Select
                  value={dialogAccountId ?? "__global__"}
                  onValueChange={(v) => setDialogAccountId(v === "__global__" ? null : v)}
                >
                  <SelectTrigger className="ml-auto h-6 w-auto rounded-md px-2 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="__global__">Workspace-wide</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}{a.phone ? ` · ${a.phone}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Item name</Label>
              <Input
                className="rounded-xl"
                placeholder="e.g. Welcome, Option 1, Repair menu"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>
                Keywords{" "}
                <span className="text-muted-foreground font-normal">(comma-separated)</span>
              </Label>
              <Input
                className="rounded-xl font-mono"
                placeholder="e.g. hi, hello, 1, start"
                value={itemKeywords}
                onChange={(e) => setItemKeywords(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Multiple keywords → separate rules pointing to the same reply.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Match type</Label>
              <Select
                value={itemMatchType}
                onValueChange={(v) => setItemMatchType((v as "EXACT" | "CONTAINS") ?? "EXACT")}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="EXACT">
                    Exact — full message must equal keyword (recommended for numbers)
                  </SelectItem>
                  <SelectItem value="CONTAINS">
                    Contains — message just needs to include keyword
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Response message</Label>
              <Textarea
                className="rounded-xl font-mono text-sm"
                rows={5}
                placeholder="Type the reply to send when this keyword is matched… (optional if media is attached)"
                value={itemResponse}
                onChange={(e) => setItemResponse(e.target.value)}
              />
            </div>

            {/* Media attachment */}
            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5">
                <Paperclip className="size-3.5" />
                Media attachment
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>

              {itemMediaUrl ? (
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                  {/* Thumbnail for images, icon for others */}
                  {/\.(jpg|jpeg|png|gif|webp)$/i.test(itemMediaUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${API_BASE}${itemMediaUrl}`}
                      alt="preview"
                      className="size-12 rounded-lg object-cover shrink-0 border border-border/40"
                    />
                  ) : (
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                      {mediaIcon(itemMediaUrl)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{itemMediaUrl.split("/").pop()}</p>
                    <p className="text-xs text-muted-foreground">Attached</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 rounded-lg p-0 text-destructive hover:text-destructive shrink-0"
                    title="Remove media"
                    onClick={() => setItemMediaUrl(null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground transition hover:bg-muted/40 hover:text-foreground ${uploadingMedia ? "pointer-events-none opacity-60" : ""}`}
                >
                  {uploadingMedia ? (
                    <Loader2 className="size-4 animate-spin shrink-0" />
                  ) : (
                    <ImageIcon className="size-4 shrink-0" />
                  )}
                  {uploadingMedia ? "Uploading…" : "Click to attach image, video, or document"}
                  <input
                    ref={mediaFileRef}
                    type="file"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.pptx,.zip,.txt"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleMediaUpload(f);
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              disabled={
                (editingGroup ? editMutation.isPending : createMutation.isPending) ||
                uploadingMedia ||
                !itemKeywords.trim() ||
                (!itemResponse.trim() && !itemMediaUrl)
              }
              onClick={() => {
                if (editingGroup) editMutation.mutate(editingGroup);
                else createMutation.mutate();
              }}
            >
              {(editingGroup ? editMutation.isPending : createMutation.isPending) && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {editingGroup ? "Save changes" : "Create item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
