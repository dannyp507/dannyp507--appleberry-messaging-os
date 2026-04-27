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
import { useCallback, useEffect, useState } from "react";

const PAGE_SIZE = 25;

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importGroupId, setImportGroupId] = useState<string>("");
  const [defaultCountry, setDefaultCountry] = useState("ZA");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debounced]);

  const skip = page * PAGE_SIZE;

  const { data, isLoading, error } = useQuery({
    queryKey: qk.contacts({ search: debounced || undefined, skip, take: PAGE_SIZE }),
    queryFn: async () => {
      const { data: res } = await api.get<{
        items: Contact[];
        total: number;
        skip: number;
        take: number;
      }>("/contacts", {
        params: {
          take: PAGE_SIZE,
          skip,
          ...(debounced ? { search: debounced } : {}),
        },
      });
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

  const [createOpen, setCreateOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/contacts", {
        firstName,
        lastName: lastName || undefined,
        phone,
        email: email || undefined,
        defaultCountry,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setCreateOpen(false);
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      toast.success("Contact saved");
    },
    onError: (e) => toast.error("Could not create contact", getApiErrorMessage(e)),
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      await api.post("/contacts/import", form, {
        headers: { "Content-Type": "multipart/form-data" },
        params: {
          ...(importGroupId ? { groupId: importGroupId } : {}),
          defaultCountry,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Import queued", "We will process your file in the background.");
    },
    onError: (e) => toast.error("Import failed", getApiErrorMessage(e)),
  });

  const addToGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const ids = [...selected];
      await api.post(`/contact-groups/${groupId}/add`, { contactIds: ids });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setSelected(new Set());
      toast.success("Contacts added to group");
    },
    onError: (e) =>
      toast.error("Could not add to group", getApiErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/contacts/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact deleted");
    },
    onError: (e) => toast.error("Could not delete contact", getApiErrorMessage(e)),
  });

  const toggleAll = useCallback(() => {
    if (!data?.items.length) return;
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((c) => c.id)));
    }
  }, [data?.items, selected.size]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Contacts"
        description="Search, import CSV, create contacts, and assign groups."
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Create contact
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New contact</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid gap-2">
                    <Label>First name <span className="text-destructive">*</span></Label>
                    <Input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Last name (optional)</Label>
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Phone <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="+27821234567 or 0821234567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Include country code (+27) or select the country below.</p>
                  </div>
                  <div className="grid gap-2">
                    <Label>Email (optional)</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Country code for phone parsing</Label>
                    <Select value={defaultCountry} onValueChange={setDefaultCountry}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ZA">🇿🇦 South Africa (ZA)</SelectItem>
                        <SelectItem value="US">🇺🇸 United States (US)</SelectItem>
                        <SelectItem value="GB">🇬🇧 United Kingdom (GB)</SelectItem>
                        <SelectItem value="NG">🇳🇬 Nigeria (NG)</SelectItem>
                        <SelectItem value="KE">🇰🇪 Kenya (KE)</SelectItem>
                        <SelectItem value="GH">🇬🇭 Ghana (GH)</SelectItem>
                        <SelectItem value="IN">🇮🇳 India (IN)</SelectItem>
                        <SelectItem value="AE">🇦🇪 UAE (AE)</SelectItem>
                        <SelectItem value="AU">🇦🇺 Australia (AU)</SelectItem>
                        <SelectItem value="BR">🇧🇷 Brazil (BR)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Used to parse local numbers without a country code.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending || !firstName.trim() || phone.trim().length < 5}
                  >
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".csv,text/csv"
                className="max-w-[200px]"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importMutation.mutate(f);
                  e.target.value = "";
                }}
              />
              <Select
                value={importGroupId || "__none__"}
                onValueChange={(v) =>
                  setImportGroupId(
                    v === "__none__" || v == null ? "" : v,
                  )
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="CSV group (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No group</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label>Search</Label>
          <Input
            placeholder="Name, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {selected.size} selected
          </span>
          <Select
            onValueChange={(groupId) => {
              if (typeof groupId !== "string" || !groupId) return;
              if (!selected.size) {
                toast.info("Select contacts first");
                return;
              }
              addToGroupMutation.mutate(groupId);
            }}
          >
            <SelectTrigger className="w-[200px]">
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
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{getApiErrorMessage(error)}</p>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    !!data?.items.length && selected.size === data.items.length
                  }
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Tags</TableHead>
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
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No contacts match your filters.
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={(checked) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {c.firstName} {c.lastName}
                    {c.isDuplicate ? (
                      <Badge variant="secondary" className="ml-2">
                        duplicate phone
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.tags?.map((t) => (
                        <Badge key={t.tag.id} variant="outline">
                          {t.tag.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm("Delete this contact?")) {
                          deleteMutation.mutate(c.id);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {data ? `${data.total} total` : ""}
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
    </div>
  );
}
