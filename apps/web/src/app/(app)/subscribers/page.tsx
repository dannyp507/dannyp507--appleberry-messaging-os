"use client";

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  MessageSquare,
  Search,
  Tag,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { api, apiBaseURL, getApiErrorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/stores/auth-store";
import type { ContactSubscription, WhatsAppAccount } from "@/lib/api/types";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubscribersPage {
  items: ContactSubscription[];
  total: number;
  skip: number;
  take: number;
}

type StatusFilter = "ALL" | "SUBSCRIBED" | "UNSUBSCRIBED";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ContactSubscription["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "SUBSCRIBED"
          ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20"
          : "bg-zinc-700/60 text-zinc-400 ring-1 ring-inset ring-zinc-600/40",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "SUBSCRIBED" ? "bg-emerald-400" : "bg-zinc-500",
        )}
      />
      {status === "SUBSCRIBED" ? "Subscribed" : "Unsubscribed"}
    </span>
  );
}

// ─── Tag pill ────────────────────────────────────────────────────────────────

function TagPill({ name, color }: { name: string; color?: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset"
      style={
        color
          ? {
              backgroundColor: `${color}20`,
              color,
            }
          : undefined
      }
      data-color={color ?? undefined}
    >
      {!color && (
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/60 px-2 py-0.5 text-xs font-medium text-zinc-300 ring-1 ring-inset ring-zinc-600/40">
          {name}
        </span>
      )}
      {color && name}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SubscribersPage() {
  const queryClient = useQueryClient();
  const { workspaceId, accessToken } = useAuthStore();

  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);

  const TAKE = 50;

  // Debounce search
  const handleSearch = useCallback(
    (val: string) => {
      setSearch(val);
      clearTimeout((handleSearch as unknown as { _t?: ReturnType<typeof setTimeout> })._t);
      (handleSearch as unknown as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(
        () => setDebouncedSearch(val),
        350,
      );
    },
    [],
  );

  // ─── Fetch accounts ────────────────────────────────────────────────────────

  const { data: accounts = [] } = useQuery<WhatsAppAccount[]>({
    queryKey: ["whatsapp-accounts"],
    queryFn: async () => {
      const { data } = await api.get<WhatsAppAccount[]>("/whatsapp-accounts");
      return data;
    },
  });

  // ─── Fetch subscribers ────────────────────────────────────────────────────

  const queryKey = [
    "subscribers",
    selectedAccountId,
    statusFilter,
    debouncedSearch,
    page,
  ];

  const { data, isLoading } = useQuery<SubscribersPage>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAccountId) params.set("accountId", selectedAccountId);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("skip", String(page * TAKE));
      params.set("take", String(TAKE));
      const { data } = await api.get<SubscribersPage>(
        `/subscribers?${params.toString()}`,
      );
      return data;
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / TAKE);

  // ─── Toggle status mutation ───────────────────────────────────────────────

  const toggleStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "SUBSCRIBED" | "UNSUBSCRIBED";
    }) => {
      const { data } = await api.patch<ContactSubscription>(
        `/subscribers/${id}`,
        { status },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscribers"] });
    },
  });

  // ─── Export CSV ───────────────────────────────────────────────────────────

  const handleExport = () => {
    const params = new URLSearchParams();
    if (selectedAccountId) params.set("accountId", selectedAccountId);
    const token = accessToken;
    const wsId = workspaceId;
    // Build URL and trigger download
    const url = `${apiBaseURL}/subscribers/export?${params.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "subscribers.csv";
    // Append auth headers via fetch + blob approach
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Workspace-Id": wsId ?? "",
      },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      });
  };

  // ─── Stats ────────────────────────────────────────────────────────────────

  const subscribedCount = items.filter((i) => i.status === "SUBSCRIBED").length;
  const unsubscribedCount = items.filter(
    (i) => i.status === "UNSUBSCRIBED",
  ).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Subscribers
        </h1>
        <p className="text-sm text-zinc-400">
          Contacts who have messaged your WhatsApp accounts
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Users className="size-4" />}
          label="Total"
          value={total}
          color="indigo"
        />
        <StatCard
          icon={<UserCheck className="size-4" />}
          label="Subscribed"
          value={statusFilter === "ALL" ? total - unsubscribedCount : subscribedCount}
          color="emerald"
        />
        <StatCard
          icon={<UserMinus className="size-4" />}
          label="Unsubscribed"
          value={unsubscribedCount}
          color="zinc"
        />
        <StatCard
          icon={<MessageSquare className="size-4" />}
          label="Accounts"
          value={accounts.length}
          color="violet"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {/* Account picker */}
          <select
            value={selectedAccountId}
            onChange={(e) => {
              setSelectedAccountId(e.target.value);
              setPage(0);
            }}
            className="h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-200 focus:border-violet-500 focus:outline-none"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.phone ? `(${a.phone})` : ""}
              </option>
            ))}
          </select>

          {/* Status filter */}
          {(["ALL", "SUBSCRIBED", "UNSUBSCRIBED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(0);
              }}
              className={cn(
                "h-9 rounded-lg px-3 text-sm font-medium transition-colors",
                statusFilter === s
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200",
              )}
            >
              {s === "ALL" ? "All" : s === "SUBSCRIBED" ? "Subscribed" : "Unsubscribed"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search name or phone…"
              className="h-9 w-56 rounded-lg border border-zinc-700 bg-zinc-800 pl-8 pr-3 text-sm text-zinc-200 placeholder-zinc-500 focus:border-violet-500 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            className="flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
          >
            <Download className="size-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-800/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Contact
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Phone
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Tags
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Account
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Subscribed
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="h-4 animate-pulse rounded bg-zinc-800" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-16 text-center text-zinc-500"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <Users className="size-10 opacity-30" />
                      <div>
                        <p className="font-medium text-zinc-400">
                          No subscribers yet
                        </p>
                        <p className="mt-1 text-xs text-zinc-600">
                          Contacts who message your WhatsApp accounts will
                          appear here automatically
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((sub) => (
                  <SubscriberRow
                    key={sub.id}
                    sub={sub}
                    onToggleStatus={() =>
                      toggleStatus.mutate({
                        id: sub.id,
                        status:
                          sub.status === "SUBSCRIBED"
                            ? "UNSUBSCRIBED"
                            : "SUBSCRIBED",
                      })
                    }
                    isPending={toggleStatus.isPending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <span>
            {page * TAKE + 1}–{Math.min((page + 1) * TAKE, total)} of {total}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800 disabled:opacity-40"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
              const p =
                totalPages <= 7
                  ? i
                  : page < 4
                    ? i
                    : page > totalPages - 5
                      ? totalPages - 7 + i
                      : page - 3 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs",
                    p === page
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-zinc-700 hover:bg-zinc-800",
                  )}
                >
                  {p + 1}
                </button>
              );
            })}
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subscriber Row ───────────────────────────────────────────────────────────

function SubscriberRow({
  sub,
  onToggleStatus,
  isPending,
}: {
  sub: ContactSubscription;
  onToggleStatus: () => void;
  isPending: boolean;
}) {
  const fullName = [sub.contact.firstName, sub.contact.lastName]
    .filter(Boolean)
    .join(" ");

  const subscribedDate = new Date(sub.subscribedAt).toLocaleDateString(
    "en-ZA",
    { day: "numeric", month: "short", year: "numeric" },
  );

  return (
    <tr className="group transition-colors hover:bg-zinc-800/30">
      {/* Name + avatar */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-sm font-semibold text-violet-400">
            {sub.contact.firstName.charAt(0).toUpperCase()}
          </div>
          <span className="font-medium text-zinc-200">{fullName}</span>
        </div>
      </td>

      {/* Phone */}
      <td className="px-4 py-3.5 font-mono text-xs text-zinc-400">
        {sub.contact.phone}
      </td>

      {/* Status */}
      <td className="px-4 py-3.5">
        <StatusBadge status={sub.status} />
      </td>

      {/* Tags */}
      <td className="px-4 py-3.5">
        <div className="flex flex-wrap gap-1">
          {sub.contact.tags.length === 0 ? (
            <span className="text-xs text-zinc-600">—</span>
          ) : (
            sub.contact.tags.slice(0, 3).map(({ tag }) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-700/60 px-2 py-0.5 text-xs font-medium text-zinc-300 ring-1 ring-inset ring-zinc-600/40"
              >
                <Tag className="size-2.5 opacity-60" />
                {tag.name}
              </span>
            ))
          )}
          {sub.contact.tags.length > 3 && (
            <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
              +{sub.contact.tags.length - 3}
            </span>
          )}
        </div>
      </td>

      {/* Account */}
      <td className="px-4 py-3.5">
        <span className="text-xs text-zinc-400">
          {sub.whatsappAccount.name}
          {sub.whatsappAccount.phone && (
            <span className="ml-1 text-zinc-600">
              ({sub.whatsappAccount.phone})
            </span>
          )}
        </span>
      </td>

      {/* Subscribed at */}
      <td className="px-4 py-3.5 text-xs text-zinc-500">{subscribedDate}</td>

      {/* Actions */}
      <td className="px-4 py-3.5">
        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {/* Toggle subscribe/unsubscribe */}
          <button
            onClick={onToggleStatus}
            disabled={isPending}
            title={
              sub.status === "SUBSCRIBED" ? "Unsubscribe" : "Re-subscribe"
            }
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
              sub.status === "SUBSCRIBED"
                ? "bg-zinc-800 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                : "bg-zinc-800 text-zinc-400 hover:bg-emerald-500/10 hover:text-emerald-400",
            )}
          >
            {sub.status === "SUBSCRIBED" ? (
              <>
                <UserMinus className="size-3.5" />
                Unsubscribe
              </>
            ) : (
              <>
                <UserCheck className="size-3.5" />
                Re-subscribe
              </>
            )}
          </button>

          {/* Go to inbox */}
          <a
            href={`/inbox`}
            title="Go to inbox thread"
            className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-violet-500/10 hover:text-violet-400"
          >
            <MessageSquare className="size-3.5" />
            Chat
          </a>
        </div>
      </td>
    </tr>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "indigo" | "emerald" | "zinc" | "violet";
}) {
  const colors = {
    indigo: "bg-indigo-500/10 text-indigo-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    zinc: "bg-zinc-700/40 text-zinc-400",
    violet: "bg-violet-500/10 text-violet-400",
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3.5">
      <div className={cn("rounded-lg p-2", colors[color])}>{icon}</div>
      <div>
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="text-xl font-semibold text-white">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}
