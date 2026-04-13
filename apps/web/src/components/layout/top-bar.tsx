"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import type { Workspace } from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { MobileMenuButton } from "./app-sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMemo } from "react";

const routeLabels: Record<string, string> = {
  "/": "Dashboard",
  "/contacts": "Contacts",
  "/campaigns": "Campaigns",
  "/templates": "Templates",
  "/chatbot": "Chatbot",
  "/inbox": "Inbox",
  "/whatsapp-accounts": "WhatsApp Accounts",
  "/settings": "Settings",
  "/settings/billing": "Billing & Usage",
  "/settings/api-keys": "API Keys",
};

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const logout = useAuthStore((s) => s.logout);
  const setTokens = useAuthStore((s) => s.setTokens);

  const { data: workspaces = [] } = useQuery({
    queryKey: qk.workspaces,
    queryFn: async () => {
      const { data } = await api.get<Workspace[]>("/workspaces");
      return data;
    },
  });

  const switchMutation = useMutation({
    mutationFn: async (nextId: string) => {
      const { data } = await api.post<{
        workspaceId: string;
        accessToken: string;
        refreshToken: string;
      }>("/workspaces/switch", { workspaceId: nextId });
      return data;
    },
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken, data.workspaceId);
      void queryClient.invalidateQueries();
    },
    onError: (e) => {
      toast.error("Could not switch workspace", getApiErrorMessage(e));
    },
  });

  const currentName = useMemo(() => {
    const w = workspaces.find((x) => x.id === workspaceId);
    return w?.name ?? "Workspace";
  }, [workspaces, workspaceId]);

  const pageLabel = routeLabels[pathname] ?? "Dashboard";

  const initials =
    user?.name?.slice(0, 2).toUpperCase() ??
    user?.email?.slice(0, 2).toUpperCase() ??
    "?";

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-[#262B33]/20 bg-[#0B0E14]/80 backdrop-blur-md px-6">
      {/* Left: mobile menu + breadcrumb */}
      <div className="flex items-center gap-4">
        <MobileMenuButton />
        <div className="hidden items-center gap-3 text-sm md:flex">
          <Select
            value={workspaceId ?? undefined}
            onValueChange={(v) => { if (v) switchMutation.mutate(v); }}
            disabled={switchMutation.isPending || workspaces.length === 0}
          >
            <SelectTrigger className="h-8 w-auto min-w-[120px] border-none bg-transparent text-[#a9abb3] hover:text-white shadow-none px-0 gap-1 focus:ring-0">
              <SelectValue placeholder={currentName}>{currentName}</SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-[#161a21] border-[#262B33]/40">
              {workspaces.map((w) => (
                <SelectItem key={w.id} value={w.id} className="text-[#ecedf6]">
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[#262B33] font-bold">/</span>
          <span className="font-semibold text-[#6366F1]">{pageLabel}</span>
        </div>
      </div>

      {/* Right: indicators + user */}
      <div className="flex items-center gap-4">
        {/* Status dot */}
        <div className="hidden items-center gap-2 md:flex">
          <div className="w-2 h-2 rounded-full bg-emerald-500/20 border border-emerald-500/40 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
        </div>

        {/* Notification */}
        <button className="text-[#a9abb3] hover:text-white transition-colors">
          <span className="material-symbols-outlined text-[22px]">notifications</span>
        </button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none">
            <div className="flex h-8 w-8 items-center justify-center rounded-full stitch-gradient text-xs font-bold text-white shadow-[0_0_10px_rgba(99,102,241,0.3)]">
              {initials}
            </div>
            <div className="hidden text-right md:block">
              <p className="text-xs font-bold text-white leading-none">
                {user?.name ?? "User"}
              </p>
              <p className="text-[10px] text-[#73757d] mt-0.5">
                {user?.email?.split("@")[0]}
              </p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 bg-[#161a21] border-[#262B33]/40"
          >
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-white">{user?.name ?? "User"}</span>
                <span className="text-xs font-normal text-[#a9abb3]">
                  {user?.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[#262B33]/40" />
            <DropdownMenuItem
              className="text-[#a9abb3] hover:text-white focus:text-white focus:bg-[#1c2028]"
              onClick={async () => {
                try {
                  await api.post("/auth/logout");
                } catch {
                  /* still sign out locally */
                }
                logout();
                queryClient.clear();
                router.replace("/login");
              }}
            >
              <span className="material-symbols-outlined text-sm mr-2">logout</span>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
