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
  CheckSquare,
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
  Minus,
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
  useAi: boolean;
  isDefault: boolean;
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
    useAi: items[0].useAi ?? false,
    isDefault: items[0].isDefault ?? false,
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function groupKey(name: string, accountId: string | null) {
  return `${name}:::${accountId ?? "__global__"}`;
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
  selectedKeys,
  onToggleSelect,
}: {
  account: WhatsAppAccount | null; // null = workspace-wide
  allRules: AutoresponderRule[];
  onEdit: (g: Group, accountId: string | null) => void;
  onToggle: (g: Group) => void;
  onDelete: (g: Group) => void;
  onImport: (file: File, accountId: string | null) => Promise<void>;
  onNew: (accountId: string | null) => void;
  selectedKeys: Set<string>;
  onToggleSelect: (key: string, allKeys?: string[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const rules = allRules.filter((r) =>
    account ? r.whatsappAccountId === account.id : r.whatsappAccountId === null,
  );
  const groups = buildGroups(rules);
  const sectionKeys = groups.map((g) => groupKey(g.name, account?.id ?? null));
  const allSelected = sectionKeys.length > 0 && sectionKeys.every((k) => selectedKeys.has(k));
  const someSelected = sectionKeys.some((k) => selectedKeys.has(k));

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
        {/* Section select-all checkbox */}
        {groups.length > 0 && (
          <button
            type="button"
            className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${allSelected ? "border-primary bg-primary text-white" : someSelected ? "border-primary bg-primary/20 text-primary" : "border-border bg-background hover:border-primary/60"}`}
            title={allSelected ? "Deselect all in section" : "Select all in section"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect("__section__", sectionKeys);
            }}
          >
            {allSelected ? (
              <svg viewBox="0 0 10 10" className="size-2.5 fill-current"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ) : someSelected ? (
              <Minus className="size-2.5" />
            ) : null}
          </button>
        )}
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
        groups.map((group, idx) => {
          const key = groupKey(group.name, account?.id ?? null);
          const isChecked = selectedKeys.has(key);
          return (
          <div
            key={group.name + idx}
            className={`flex items-start gap-3 border-t border-border/40 px-4 py-3 transition-colors hover:bg-muted/20 ${isChecked ? "bg-primary/5" : ""}`}
          >
            {/* Row checkbox */}
            <button
              type="button"
              className={`mt-1 flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${isChecked ? "border-primary bg-primary text-white" : "border-border bg-background hover:border-primary/60"}`}
              onClick={() => onToggleSelect(key)}
            >
              {isChecked && (
                <svg viewBox="0 0 10 10" className="size-2.5 fill-current"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              )}
            </button>
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
                {group.isDefault && (
                  <Badge
                    variant="outline"
                    className="rounded-md text-[11px] border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 flex items-center gap-1"
                  >
                    <MessageSquare className="size-2.5" />
                    Default
                  </Badge>
                )}
                {group.useAi && (
                  <Badge
                    variant="outline"
                    className="rounded-md text-[11px] border-violet-300 bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400 flex items-center gap-1"
                  >
                    <Bot className="size-2.5" />
                    AI
                  </Badge>
                )}
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
        );})}
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
  const [itemUseAi, setItemUseAi] = useState(false);
  const [itemIsDefault, setItemIsDefault] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
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
      if (!itemUseAi && !itemResponse.trim() && !itemMediaUrl) throw new Error("Response or media required");
      for (const kw of keywords) {
        await api.post("/autoresponder/rules", {
          name: itemName.trim() || kw,
          keyword: kw,
          matchType: itemMatchType,
          response: itemResponse.trim(),
          active: true,
          useAi: itemUseAi,
          isDefault: itemIsDefault,
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
      if (!itemUseAi && !itemResponse.trim() && !itemMediaUrl) throw new Error("Response or media required");
      for (const r of group.items) await api.delete(`/autoresponder/rules/${r.id}`);
      for (const kw of keywords) {
        await api.post("/autoresponder/rules", {
          name: itemName.trim() || kw,
          keyword: kw,
          matchType: itemMatchType,
          response: itemResponse.trim(),
          active: group.active,
          useAi: itemUseAi,
          isDefault: itemIsDefault,
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      // Build a flat map of all groups keyed by groupKey
      const allGroups = new Map<string, Group>();
      for (const acc of [null, ...accounts.map((a) => a)]) {
        const accRules = rules.filter((r) =>
          acc ? r.whatsappAccountId === (acc as WhatsAppAccount).id : r.whatsappAccountId === null,
        );
        for (const g of buildGroups(accRules)) {
          allGroups.set(groupKey(g.name, acc ? (acc as WhatsAppAccount).id : null), g);
        }
      }
      for (const key of keys) {
        const g = allGroups.get(key);
        if (g) for (const r of g.items) await api.delete(`/autoresponder/rules/${r.id}`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.autoresponderRules });
      setSelectedKeys(new Set());
      toast.success("Deleted selected items");
    },
    onError: (e) => toast.error("Bulk delete failed", getApiErrorMessage(e)),
  });

  const handleToggleSelect = (key: string, allKeys?: string[]) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (key === "__section__" && allKeys) {
        // If all in section already selected → deselect all; else select all
        const allSelected = allKeys.every((k) => prev.has(k));
        if (allSelected) allKeys.forEach((k) => next.delete(k));
        else allKeys.forEach((k) => next.add(k));
      } else {
        if (next.has(key)) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openNew = (accountId: string | null) => {
    setEditingGroup(null);
    setDialogAccountId(accountId);
    setItemName("");
    setItemKeywords("");
    setItemResponse("");
    setItemMatchType("EXACT");
    setItemUseAi(false);
    setItemIsDefault(false);
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
    setItemUseAi(group.useAi ?? false);
    setItemIsDefault(group.isDefault ?? false);
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
              selectedKeys={selectedKeys}
              onToggleSelect={handleToggleSelect}
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
            selectedKeys={selectedKeys}
            onToggleSelect={handleToggleSelect}
          />
        </div>
      )}

      {/* Stats */}
      {rules.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {totalActive} active · {buildGroups(rules).filter((g) => !g.active).length} inactive · {rules.length} total keyword rules
        </p>
      )}

      {/* Floating bulk-action bar */}
      {selectedKeys.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-border/80 bg-background/95 px-4 py-3 shadow-xl backdrop-blur-sm">
          <CheckSquare className="size-4 text-primary shrink-0" />
          <span className="text-sm font-semibold">
            {selectedKeys.size} item{selectedKeys.size !== 1 ? "s" : ""} selected
          </span>
          <div className="h-4 w-px bg-border/60" />
          <Button
            size="sm"
            variant="destructive"
            className="h-7 rounded-lg px-3 text-xs gap-1.5"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => {
              if (confirm(`Delete ${selectedKeys.size} selected item${selectedKeys.size !== 1 ? "s" : ""}?`)) {
                bulkDeleteMutation.mutate(Array.from(selectedKeys));
              }
            }}
          >
            {bulkDeleteMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Delete selected
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-lg px-3 text-xs"
            onClick={() => setSelectedKeys(new Set())}
          >
            Deselect all
          </Button>
        </div>
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

            {/* Default fallback toggle */}
            <div
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors cursor-pointer select-none ${itemIsDefault ? "border-amber-300 bg-amber-50 dark:bg-amber-900/20" : "border-border/60 hover:bg-muted/30"}`}
              onClick={() => setItemIsDefault((v) => !v)}
            >
              <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${itemIsDefault ? "bg-amber-500/20" : "bg-muted"}`}>
                <MessageSquare className={`size-4 ${itemIsDefault ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-semibold ${itemIsDefault ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>
                    Default fallback
                  </p>
                  <div className={`relative h-5 w-9 rounded-full transition-colors ${itemIsDefault ? "bg-amber-500" : "bg-muted-foreground/30"}`}>
                    <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${itemIsDefault ? "left-4" : "left-0.5"}`} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {itemIsDefault
                    ? "This rule fires for any message that didn't match a keyword. The keyword above is ignored."
                    : "Enable to use this as the catch-all reply when no keyword matches. Perfect for AI with a business system prompt."}
                </p>
              </div>
            </div>

            {/* AI toggle */}
            <div
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors cursor-pointer select-none ${itemUseAi ? "border-violet-300 bg-violet-50 dark:bg-violet-900/20" : "border-border/60 hover:bg-muted/30"}`}
              onClick={() => setItemUseAi((v) => !v)}
            >
              <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${itemUseAi ? "bg-violet-500/20" : "bg-muted"}`}>
                <Bot className={`size-4 ${itemUseAi ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-semibold ${itemUseAi ? "text-violet-700 dark:text-violet-300" : "text-foreground"}`}>
                    AI Reply
                  </p>
                  {/* toggle pill */}
                  <div className={`relative h-5 w-9 rounded-full transition-colors ${itemUseAi ? "bg-violet-500" : "bg-muted-foreground/30"}`}>
                    <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${itemUseAi ? "left-4" : "left-0.5"}`} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {itemUseAi
                    ? "The response box below is your AI system prompt — the AI will generate a dynamic reply for each message."
                    : "Enable to let AI generate the response. The response box becomes the AI system prompt."}
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{itemUseAi ? "AI system prompt" : "Response message"}</Label>
              <Textarea
                className="rounded-xl font-mono text-sm"
                rows={5}
                placeholder={itemUseAi
                  ? "e.g. You are a helpful assistant for Acme Co. Answer questions about repairs, pricing, and hours. Keep replies under 2 sentences."
                  : "Type the reply to send when this keyword is matched… (optional if media is attached)"}
                value={itemResponse}
                onChange={(e) => setItemResponse(e.target.value)}
              />
              {itemUseAi && (
                <p className="text-xs text-muted-foreground">
                  Requires an AI provider configured in{" "}
                  <a href="/settings/ai" className="underline text-violet-600 dark:text-violet-400">Settings → AI Providers</a>.
                </p>
              )}
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
                (!itemUseAi && !itemResponse.trim() && !itemMediaUrl)
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
