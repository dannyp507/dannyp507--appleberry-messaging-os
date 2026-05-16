"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import type { Contact, ContactGroup } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  Plus,
  Trash2,
  UserMinus,
  Users,
  X,
  FolderPlus,
  Upload,
} from "lucide-react";

const PAGE_SIZE = 25;

// ─── Filter type ────────────────────────────────────────────────────────────
type FilterMode = "all" | "opted-out" | { groupId: string };

function filterKey(m: FilterMode) {
  if (m === "all") return "all";
  if (m === "opted-out") return "opted-out";
  return m.groupId;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const queryClient = useQueryClient();

  // Filter state
  const [filter, setFilter] = useState<FilterMode>("all");

  // Search / pagination
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Import options
  const [importGroupId, setImportGroupId] = useState<string>("");
  const [defaultCountry, setDefaultCountry] = useState("ZA");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create contact dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Create group dialog
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");

  // Add-to-group dropdown (bulk)
  const [addToGroupId, setAddToGroupId] = useState<string>("");

  // ── Debounce search ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [debounced, filter]);

  const skip = page * PAGE_SIZE;

  // ── Query params derived from filter ─────────────────────────────────────
  const queryParams = {
    search: debounced || undefined,
    skip,
    take: PAGE_SIZE,
    groupId: typeof filter === "object" ? filter.groupId : undefined,
    optedOut: filter === "opted-out" ? true : undefined,
  };

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: qk.contacts(queryParams),
    queryFn: async () => {
      const { data: res } = await api.get<{
        items: Contact[];
        total: number;
        skip: number;
        take: number;
      }>("/contacts", { params: queryParams });
      return res;
    },
  });

  const { data: groups = [] } = useQuery({
    queryKey: qk.contactGroups,
    queryFn: async () => {
      const { data: res } = await api.get<ContactGroup[]>("/contact-groups");
      return res;
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createContactMutation = useMutation({
    mutationFn: async () => {
      await api.post("/contacts", {
        firstName,
        lastName,
        phone,
        email: email || undefined,
        defaultCountry,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setCreateOpen(false);
      setFirstName(""); setLastName(""); setPhone(""); setEmail("");
      toast.success("Contact created");
    },
    onError: (e) => toast.error("Could not create contact", getApiErrorMessage(e)),
  });

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      await api.post("/contact-groups", { name: groupName.trim() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.contactGroups });
      setGroupOpen(false);
      setGroupName("");
      toast.success("Group created");
    },
    onError: (e) => toast.error("Could not create group", getApiErrorMessage(e)),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/contact-groups/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.contactGroups });
      // If we were viewing that group, go back to all
      setFilter("all");
      toast.success("Group deleted");
    },
    onError: (e) => toast.error("Could not delete group", getApiErrorMessage(e)),
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      // Do NOT set Content-Type manually — axios sets it automatically with the
      // correct multipart boundary when the body is a FormData instance.
      await api.post("/contacts/import", form, {
        params: {
          ...(importGroupId ? { groupId: importGroupId } : {}),
          defaultCountry,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Import queued", "Processing your file in the background.");
    },
    onError: (e) => toast.error("Import failed", getApiErrorMessage(e)),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await api.delete("/contacts/bulk", { data: { ids } });
    },
    onSuccess: (_, ids) => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setSelected(new Set());
      toast.success(`${ids.length} contact${ids.length !== 1 ? "s" : ""} deleted`);
    },
    onError: (e) => toast.error("Delete failed", getApiErrorMessage(e)),
  });

  const addToGroupMutation = useMutation({
    mutationFn: async ({ groupId, ids }: { groupId: string; ids: string[] }) => {
      await api.post(`/contact-groups/${groupId}/add`, { contactIds: ids });
    },
    onSuccess: (_, { ids, groupId }) => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: qk.contactGroups });
      setSelected(new Set());
      setAddToGroupId("");
      const g = groups.find((x) => x.id === groupId);
      toast.success(`Added ${ids.length} contact${ids.length !== 1 ? "s" : ""} to ${g?.name ?? "group"}`);
    },
    onError: (e) => toast.error("Could not add to group", getApiErrorMessage(e)),
  });

  const removeFromGroupMutation = useMutation({
    mutationFn: async ({ groupId, ids }: { groupId: string; ids: string[] }) => {
      await api.delete(`/contact-groups/${groupId}/members`, { data: { contactIds: ids } });
    },
    onSuccess: (_, { ids }) => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: qk.contactGroups });
      setSelected(new Set());
      toast.success(`${ids.length} contact${ids.length !== 1 ? "s" : ""} removed from group`);
    },
    onError: (e) => toast.error("Could not remove from group", getApiErrorMessage(e)),
  });

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleAll = useCallback(() => {
    if (!data?.items.length) return;
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((c) => c.id)));
    }
  }, [data?.items, selected.size]);

  const allOnPageSelected = !!data?.items.length && selected.size === data.items.length;

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const params: Record<string, string> = {};
      if (typeof filter === "object") params.groupId = filter.groupId;
      if (filter === "opted-out") params.optedOut = "true";

      const res = await api.get<Blob>("/contacts/export", {
        params,
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([res.data as unknown as BlobPart]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "contacts.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Export failed", getApiErrorMessage(e));
    }
  };

  // ── Current group (if filtering by one) ──────────────────────────────────
  const activeGroup =
    typeof filter === "object"
      ? groups.find((g) => g.id === filter.groupId)
      : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <PageHeader
        title="Contacts"
        description="Manage contacts, groups, imports and exports."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="mr-1.5 size-3.5" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending}
            >
              <Upload className="mr-1.5 size-3.5" />
              {importMutation.isPending ? "Importing…" : "Import CSV"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importMutation.mutate(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 size-3.5" />
              Add contact
            </Button>
          </div>
        }
      />

      {/* ── Group filter pills row ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* All contacts pill */}
        <FilterPill
          active={filter === "all"}
          onClick={() => setFilter("all")}
        >
          <Users className="size-3.5" />
          All contacts
          {data && filter === "all" && (
            <span className="ml-1 rounded bg-muted px-1 py-0 text-xs">{data.total}</span>
          )}
        </FilterPill>

        {/* Group pills */}
        {groups.map((g) => (
          <div key={g.id} className="flex items-center gap-0">
            <FilterPill
              active={typeof filter === "object" && filter.groupId === g.id}
              onClick={() => setFilter({ groupId: g.id })}
            >
              {g.name}
              <span className="ml-1 rounded bg-muted px-1 py-0 text-xs">
                {g._count?.members ?? 0}
              </span>
            </FilterPill>
            {/* Delete group button — only shown on hover via group */}
            <button
              className="ml-0.5 rounded p-0.5 text-muted-foreground opacity-50 hover:opacity-100 hover:text-destructive transition"
              title={`Delete group "${g.name}"`}
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete group "${g.name}"? Contacts will NOT be deleted.`)) {
                  deleteGroupMutation.mutate(g.id);
                }
              }}
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {/* Opted out pill */}
        <FilterPill
          active={filter === "opted-out"}
          onClick={() => setFilter("opted-out")}
          variant="destructive"
        >
          Opted Out
        </FilterPill>

        {/* New group button */}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs"
          onClick={() => setGroupOpen(true)}
        >
          <FolderPlus className="size-3.5" />
          New group
        </Button>
      </div>

      {/* ── Search + import group select ──────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 max-w-xs text-sm"
          placeholder="Search by name, phone, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Import CSV group assignment (only show when a group is active or as an option) */}
        <Select
          value={importGroupId || "__none__"}
          onValueChange={(v) => setImportGroupId(v === "__none__" ? "" : (v ?? ""))}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Import into group…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No group on import</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-xs text-muted-foreground">
          {data ? `${data.total} contact${data.total !== 1 ? "s" : ""}` : ""}
          {activeGroup ? ` in "${activeGroup.name}"` : ""}
        </span>
      </div>

      {/* ── Contacts table ────────────────────────────────────────────── */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : !data?.items.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  {filter === "opted-out"
                    ? "No opted-out contacts."
                    : typeof filter === "object"
                    ? "No contacts in this group."
                    : "No contacts yet. Import a CSV or add one manually."}
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((c) => (
                <TableRow
                  key={c.id}
                  className={c.optOut ? "opacity-60" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={(checked) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {c.firstName} {c.lastName}
                    {c.isDuplicate && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        duplicate
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {c.phone}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.tags?.map((t) => (
                        <Badge key={t.tag.id} variant="outline" className="text-xs">
                          {t.tag.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.optOut ? (
                      <Badge variant="destructive" className="text-xs">Opted out</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Active</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {page + 1} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {/* ── Floating bulk action bar ──────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-2xl border bg-card px-4 py-2.5 shadow-xl">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <div className="mx-2 h-4 w-px bg-border" />

          {/* Add to group */}
          <Select
            value={addToGroupId || ""}
            onValueChange={(v) => {
              if (!v) return;
              addToGroupMutation.mutate({ groupId: v, ids: [...selected] });
            }}
          >
            <SelectTrigger className="h-7 w-[160px] text-xs">
              <SelectValue placeholder="Add to group…" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Remove from group (only when in group view) */}
          {typeof filter === "object" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={removeFromGroupMutation.isPending}
              onClick={() =>
                removeFromGroupMutation.mutate({
                  groupId: filter.groupId,
                  ids: [...selected],
                })
              }
            >
              <UserMinus className="mr-1.5 size-3.5" />
              Remove from group
            </Button>
          )}

          {/* Delete */}
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-xs"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => {
              if (
                confirm(
                  `Delete ${selected.size} contact${selected.size !== 1 ? "s" : ""}? This cannot be undone.`
                )
              ) {
                bulkDeleteMutation.mutate([...selected]);
              }
            }}
          >
            <Trash2 className="mr-1.5 size-3.5" />
            Delete
          </Button>

          {/* Clear */}
          <button
            className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground transition"
            onClick={() => setSelected(new Set())}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* ── Create contact dialog ─────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New contact</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+27 82 123 4567"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Country code for parsing</Label>
              <Input
                value={defaultCountry}
                onChange={(e) => setDefaultCountry(e.target.value.toUpperCase())}
                placeholder="ZA"
                className="w-20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createContactMutation.mutate()}
              disabled={createContactMutation.isPending || !phone.trim()}
            >
              {createContactMutation.isPending ? "Saving…" : "Save contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create group dialog ───────────────────────────────────────── */}
      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>Group name</Label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. VIP Customers, Newsletter, March Campaign"
              onKeyDown={(e) => {
                if (e.key === "Enter" && groupName.trim().length >= 1) createGroupMutation.mutate();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createGroupMutation.mutate()}
              disabled={createGroupMutation.isPending || groupName.trim().length < 1}
            >
              {createGroupMutation.isPending ? "Creating…" : "Create group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── FilterPill helper component ─────────────────────────────────────────────
function FilterPill({
  active,
  onClick,
  children,
  variant = "default",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all border",
        active
          ? variant === "destructive"
            ? "bg-destructive/15 border-destructive text-destructive"
            : "bg-primary/10 border-primary text-primary"
          : "bg-muted/40 border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
