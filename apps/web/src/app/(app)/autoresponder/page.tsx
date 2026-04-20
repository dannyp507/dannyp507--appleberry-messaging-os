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
import type { AutoresponderRule } from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Download,
  Hash,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState, useMemo } from "react";

// ─── Planify X JSON types ─────────────────────────────────────────────────────
interface PlanifyBot {
  name: string;
  keywords: string;
  type_search: string; // "1" = exact, "2" = contains
  caption: string;
  use_ai?: string;
  is_default?: string;
}
interface PlanifyJson {
  version?: string;
  chatbots: PlanifyBot[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cleanName(raw: string): string {
  return raw
    .replace(/_imported/gi, "")
    .replace(/_+$/, "")
    .trim();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChatbotItemsPage() {
  const queryClient = useQueryClient();

  // create / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemKeywords, setItemKeywords] = useState(""); // comma-separated
  const [itemResponse, setItemResponse] = useState("");
  const [itemMatchType, setItemMatchType] = useState<"EXACT" | "CONTAINS">("CONTAINS");

  // search filter
  const [search, setSearch] = useState("");

  // import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: qk.autoresponderRules,
    queryFn: async () => {
      const { data } = await api.get<AutoresponderRule[]>("/autoresponder/rules");
      return data;
    },
  });

  // Group rules by name so multi-keyword items appear as one card
  const groups = useMemo(() => {
    const map = new Map<string, AutoresponderRule[]>();
    for (const r of rules) {
      const key = r.name ?? r.keyword;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    const arr = Array.from(map.entries()).map(([name, items]) => ({
      name,
      items,
      active: items.some((i) => i.active),
      response: items[0].response,
      matchType: items[0].matchType,
    }));
    if (!search.trim()) return arr;
    const q = search.toLowerCase();
    return arr.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.items.some((i) => i.keyword.toLowerCase().includes(q)) ||
        g.response.toLowerCase().includes(q),
    );
  }, [rules, search]);

  const openCreate = () => {
    setEditingId(null);
    setItemName("");
    setItemKeywords("");
    setItemResponse("");
    setItemMatchType("CONTAINS");
    setDialogOpen(true);
  };

  const openEdit = (group: (typeof groups)[0]) => {
    setEditingId(group.items[0].id);
    setItemName(group.name);
    setItemKeywords(group.items.map((i) => i.keyword).join(", "));
    setItemResponse(group.response);
    setItemMatchType(group.matchType === "EXACT" ? "EXACT" : "CONTAINS");
    setDialogOpen(true);
  };

  // Create — splits comma-separated keywords into multiple rules
  const createMutation = useMutation({
    mutationFn: async () => {
      const keywords = itemKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (keywords.length === 0) throw new Error("At least one keyword required");
      if (!itemResponse.trim()) throw new Error("Response required");
      for (const kw of keywords) {
        await api.post("/autoresponder/rules", {
          name: itemName.trim() || kw,
          keyword: kw,
          matchType: itemMatchType,
          response: itemResponse.trim(),
          active: true,
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

  // Edit — delete old rules for group, recreate with new keywords
  const editMutation = useMutation({
    mutationFn: async (group: (typeof groups)[0]) => {
      const keywords = itemKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (keywords.length === 0) throw new Error("At least one keyword required");
      if (!itemResponse.trim()) throw new Error("Response required");
      // Delete existing rules in this group
      for (const r of group.items) {
        await api.delete(`/autoresponder/rules/${r.id}`);
      }
      // Recreate
      for (const kw of keywords) {
        await api.post("/autoresponder/rules", {
          name: itemName.trim() || kw,
          keyword: kw,
          matchType: itemMatchType,
          response: itemResponse.trim(),
          active: group.active,
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
    mutationFn: async (group: (typeof groups)[0]) => {
      for (const r of group.items) {
        await api.patch(`/autoresponder/rules/${r.id}/toggle`);
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.autoresponderRules }),
    onError: (e) => toast.error("Could not toggle", getApiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (group: (typeof groups)[0]) => {
      for (const r of group.items) {
        await api.delete(`/autoresponder/rules/${r.id}`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.autoresponderRules });
      toast.success("Deleted");
    },
    onError: (e) => toast.error("Could not delete", getApiErrorMessage(e)),
  });

  // ── Import from Planify X JSON ────────────────────────────────────────────
  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as PlanifyJson;
      const bots: PlanifyBot[] = json?.chatbots ?? [];
      if (bots.length === 0) {
        toast.error("No chatbot items found in file");
        return;
      }

      let created = 0;
      for (const bot of bots) {
        // Skip AI fallback and special items
        if (bot.use_ai === "1" || bot.is_default === "1") continue;
        if (!bot.caption?.trim()) continue;
        if (!bot.keywords?.trim()) continue;

        const name = cleanName(bot.name);
        const matchType: "EXACT" | "CONTAINS" =
          bot.type_search === "2" ? "CONTAINS" : "EXACT";
        const response = bot.caption.trim();

        const keywords = bot.keywords
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean);

        for (const kw of keywords) {
          if (!kw) continue;
          try {
            await api.post("/autoresponder/rules", {
              name,
              keyword: kw,
              matchType,
              response,
              active: true,
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
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const currentGroup = editingId
    ? groups.find((g) => g.items.some((i) => i.id === editingId)) ?? null
    : null;

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Chatbot Items"
        description="Keyword-based auto-replies that fire instantly when a contact messages you."
        action={
          <div className="flex items-center gap-2">
            {/* Import button */}
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-muted ${importing ? "pointer-events-none opacity-60" : ""}`}
            >
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {importing ? "Importing…" : "Import JSON"}
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImport(f);
                }}
              />
            </label>

            <Button
              className="rounded-xl shadow-sm hover:shadow-md"
              onClick={openCreate}
            >
              <Plus className="mr-1.5 size-4" />
              New item
            </Button>
          </div>
        }
      />

      {/* Search */}
      {rules.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-xl pl-9"
            placeholder="Search keywords or responses…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No chatbot items yet"
          description="Create keyword-triggered replies or import a flow from Planify X / WhatsApp chatbot platforms."
          action={
            <Button className="rounded-xl" onClick={openCreate}>
              <Plus className="mr-1.5 size-4" />
              New chatbot item
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-md">
          {groups.map((group, idx) => (
            <div
              key={group.name + idx}
              className={`flex items-start gap-4 p-4 transition-colors hover:bg-muted/30 ${idx !== 0 ? "border-t border-border/40" : ""}`}
            >
              {/* Status dot */}
              <div
                className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${group.active ? "bg-emerald-500/10" : "bg-muted"}`}
              >
                <MessageSquare
                  className={`size-4 ${group.active ? "text-emerald-500" : "text-muted-foreground"}`}
                />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 space-y-1.5">
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

                {/* Response preview */}
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {group.response}
                </p>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-lg p-0"
                  title={group.active ? "Disable" : "Enable"}
                  onClick={() => toggleMutation.mutate(group)}
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
                  className="h-8 w-8 rounded-lg p-0"
                  title="Edit"
                  onClick={() => openEdit(group)}
                >
                  <Pencil className="size-3.5 text-muted-foreground" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-lg p-0 text-destructive hover:text-destructive"
                  title="Delete"
                  onClick={() => {
                    if (confirm(`Delete "${group.name}"?`)) {
                      deleteMutation.mutate(group);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats footer */}
      {groups.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {groups.filter((g) => g.active).length} active ·{" "}
          {groups.filter((g) => !g.active).length} inactive ·{" "}
          {rules.length} total keyword rules
        </p>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {currentGroup ? "Edit chatbot item" : "New chatbot item"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Item name</Label>
              <Input
                className="rounded-xl"
                placeholder="e.g. Start message, Repair menu"
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
                placeholder="e.g. hi, hello, start"
                value={itemKeywords}
                onChange={(e) => setItemKeywords(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Multiple keywords create separate rules pointing to the same reply.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Match type</Label>
              <Select
                value={itemMatchType}
                onValueChange={(v) => setItemMatchType((v as "EXACT" | "CONTAINS") ?? "CONTAINS")}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="EXACT">
                    Exact — full message must equal keyword
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
                placeholder="Type the reply to send when this keyword is matched…"
                value={itemResponse}
                onChange={(e) => setItemResponse(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              disabled={
                (currentGroup ? editMutation.isPending : createMutation.isPending) ||
                !itemKeywords.trim() ||
                !itemResponse.trim()
              }
              onClick={() => {
                if (currentGroup) {
                  editMutation.mutate(currentGroup);
                } else {
                  createMutation.mutate();
                }
              }}
            >
              {(currentGroup ? editMutation.isPending : createMutation.isPending) && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {currentGroup ? "Save changes" : "Create item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
