"use client";

import { PageHeader } from "@/components/layout/page-header";
import { TablePageSkeleton } from "@/components/shell/page-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Loader2,
  Clock,
  Gift,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoucherContact {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string;
}

interface Voucher {
  id: string;
  code: string;
  status: "PENDING" | "SENT" | "CLAIMED" | "REDEEMED" | "EXPIRED";
  valueZar: number;
  campaignName: string | null;
  sentAt: string | null;
  claimedAt: string | null;
  redeemedAt: string | null;
  expiresAt: string | null;
  contact: VoucherContact;
}

interface VoucherListResponse {
  items: Voucher[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type StatusFilter = "ALL" | "SENT" | "CLAIMED" | "REDEEMED";

const PAGE_SIZE = 50;

function statusBadge(status: Voucher["status"]) {
  switch (status) {
    case "CLAIMED":
      return <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400">Claimed</Badge>;
    case "REDEEMED":
      return <Badge className="bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400">Redeemed</Badge>;
    case "SENT":
      return <Badge variant="secondary">Sent</Badge>;
    case "EXPIRED":
      return <Badge variant="destructive">Expired</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-all hover:shadow-md ${
        active
          ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 shadow-sm"
          : "border-[#E5E7EB] dark:border-[#1e2433] bg-white dark:bg-[#111420]"
      }`}
    >
      <div className={`flex size-9 items-center justify-center rounded-lg ${color}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight">{value.toLocaleString()}</p>
        <p className="text-xs text-[#6B7280] dark:text-[#8b92a8] font-medium">{label}</p>
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VouchersPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [page, setPage] = useState(1);

  // ── Accurate counts via separate API calls (pageSize=1 — only need total) ──
  const { data: totalRes }    = useQuery({ queryKey: ["vc", "ALL"],      queryFn: () => api.get<VoucherListResponse>("/vouchers?pageSize=1").then(r => r.data), staleTime: 20_000 });
  const { data: sentRes }     = useQuery({ queryKey: ["vc", "SENT"],     queryFn: () => api.get<VoucherListResponse>("/vouchers?pageSize=1&status=SENT").then(r => r.data), staleTime: 20_000 });
  const { data: claimedRes }  = useQuery({ queryKey: ["vc", "CLAIMED"],  queryFn: () => api.get<VoucherListResponse>("/vouchers?pageSize=1&status=CLAIMED").then(r => r.data), staleTime: 20_000 });
  const { data: redeemedRes } = useQuery({ queryKey: ["vc", "REDEEMED"], queryFn: () => api.get<VoucherListResponse>("/vouchers?pageSize=1&status=REDEEMED").then(r => r.data), staleTime: 20_000 });

  const stats = {
    total:    totalRes?.total    ?? 0,
    sent:     sentRes?.total     ?? 0,
    claimed:  claimedRes?.total  ?? 0,
    redeemed: redeemedRes?.total ?? 0,
  };

  // ── Paginated table data ──────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["vouchers-table", statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: String(PAGE_SIZE), page: String(page) });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const { data } = await api.get<VoucherListResponse>(`/vouchers?${params}`);
      return data;
    },
  });

  const redeemMut = useMutation({
    mutationFn: (code: string) => api.patch(`/vouchers/redeem/${code}`),
    onSuccess: (_res, code) => {
      toast.success(`Voucher ${code} marked as redeemed ✅`);
      queryClient.invalidateQueries({ queryKey: ["vouchers-table"] });
      queryClient.invalidateQueries({ queryKey: ["vc"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  const vouchers = data?.items ?? [];
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  function handleFilterChange(f: StatusFilter) {
    setStatusFilter(f);
    setPage(1);
  }

  if (isLoading && page === 1) return <TablePageSkeleton />;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Vouchers"
        description="Track R200 voucher claims and in-store redemptions"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Issued"
          value={stats.total}
          icon={Gift}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          active={statusFilter === "ALL"}
          onClick={() => handleFilterChange("ALL")}
        />
        <StatCard
          label="Waiting"
          value={stats.sent}
          icon={Clock}
          color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          active={statusFilter === "SENT"}
          onClick={() => handleFilterChange("SENT")}
        />
        <StatCard
          label="Claimed"
          value={stats.claimed}
          icon={CheckCircle2}
          color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
          active={statusFilter === "CLAIMED"}
          onClick={() => handleFilterChange("CLAIMED")}
        />
        <StatCard
          label="Redeemed"
          value={stats.redeemed}
          icon={ShieldCheck}
          color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
          active={statusFilter === "REDEEMED"}
          onClick={() => handleFilterChange("REDEEMED")}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#E5E7EB] dark:border-[#1e2433] bg-white dark:bg-[#111420] overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-[#E5E7EB] dark:border-[#1e2433]">
                <TableHead>Client</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Claimed</TableHead>
                <TableHead>Redeemed</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-[#9CA3AF] py-10">
                    No vouchers found.
                  </TableCell>
                </TableRow>
              ) : (
                vouchers.map((v) => (
                  <TableRow key={v.id} className="border-[#E5E7EB] dark:border-[#1e2433]">
                    <TableCell className="font-medium">
                      {v.contact.firstName} {v.contact.lastName ?? ""}
                    </TableCell>
                    <TableCell className="text-sm text-[#6B7280] dark:text-[#8b92a8]">
                      {v.contact.phone}
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-[#F3F4F6] dark:bg-[#1e2433] px-2 py-0.5 text-xs font-mono">
                        {v.code}
                      </code>
                    </TableCell>
                    <TableCell className="font-medium text-green-600">
                      R{v.valueZar}
                    </TableCell>
                    <TableCell>{statusBadge(v.status)}</TableCell>
                    <TableCell className="text-sm text-[#6B7280] dark:text-[#8b92a8]">
                      {fmtDate(v.sentAt)}
                    </TableCell>
                    <TableCell className="text-sm text-[#6B7280] dark:text-[#8b92a8]">
                      {fmtDate(v.claimedAt)}
                    </TableCell>
                    <TableCell className="text-sm text-[#6B7280] dark:text-[#8b92a8]">
                      {fmtDate(v.redeemedAt)}
                    </TableCell>
                    <TableCell>
                      {v.status === "CLAIMED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-purple-600 border-purple-200 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                          disabled={redeemMut.isPending}
                          onClick={() => redeemMut.mutate(v.code)}
                        >
                          {redeemMut.isPending ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            "Mark Redeemed"
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-[#E5E7EB] dark:border-[#1e2433] px-4 py-3">
            <p className="text-sm text-[#6B7280] dark:text-[#8b92a8]">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm font-medium">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
