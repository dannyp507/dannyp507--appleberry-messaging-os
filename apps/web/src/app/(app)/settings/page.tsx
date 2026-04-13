"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, getApiErrorMessage } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { Workspace } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const organizationId = useAuthStore((s) => s.organizationId);
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const logout = useAuthStore((s) => s.logout);
  const setTokens = useAuthStore((s) => s.setTokens);

  const [open, setOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [wsName, setWsName] = useState("");
  const [joinId, setJoinId] = useState("");

  const { data: workspaces = [] } = useQuery({
    queryKey: qk.workspaces,
    queryFn: async () => {
      const { data } = await api.get<Workspace[]>("/workspaces");
      return data;
    },
  });

  const createWsMutation = useMutation({
    mutationFn: async () => {
      await api.post("/workspaces", { name: wsName });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.workspaces });
      setOpen(false);
      setWsName("");
    },
    onError: (e) =>
      toast.error("Could not create workspace", getApiErrorMessage(e)),
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      await api.post("/workspaces/join", { workspaceId: joinId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.workspaces });
      setJoinOpen(false);
      setJoinId("");
    },
    onError: (e) => toast.error("Could not join workspace", getApiErrorMessage(e)),
  });

  const switchMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{
        workspaceId: string;
        accessToken: string;
        refreshToken: string;
      }>("/workspaces/switch", { workspaceId: id });
      return data;
    },
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken, data.workspaceId);
      void queryClient.invalidateQueries();
    },
    onError: (e) =>
      toast.error("Could not switch workspace", getApiErrorMessage(e)),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        title="Settings"
        description="Session, workspace IDs, and workspace management."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Email: </span>
            {user?.email}
          </div>
          <div>
            <span className="text-muted-foreground">User ID: </span>
            <code className="text-xs">{user?.id}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Organization ID: </span>
            <code className="text-xs">{organizationId}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Active workspace ID: </span>
            <code className="text-xs">{workspaceId}</code>
          </div>
          <Button
            variant="outline"
            className="mt-4"
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
            Log out
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Workspaces</CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setJoinOpen(true)}
            >
              Join workspace
            </Button>
            <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Join workspace</DialogTitle>
                </DialogHeader>
                <div className="grid gap-2 py-2">
                  <Label>Workspace ID (UUID)</Label>
                  <Input
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button
                    disabled={joinMutation.isPending || !joinId}
                    onClick={() => joinMutation.mutate()}
                  >
                    Join
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              Create workspace
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New workspace</DialogTitle>
                </DialogHeader>
                <div className="grid gap-2 py-2">
                  <Label>Name</Label>
                  <Input
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button
                    disabled={createWsMutation.isPending || wsName.length < 2}
                    onClick={() => createWsMutation.mutate()}
                  >
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {workspaces.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div>
                  <div className="font-medium">{w.name}</div>
                  <code className="text-xs text-muted-foreground">{w.id}</code>
                </div>
                <Button
                  size="sm"
                  variant={w.id === workspaceId ? "secondary" : "outline"}
                  disabled={w.id === workspaceId || switchMutation.isPending}
                  onClick={() => switchMutation.mutate(w.id)}
                >
                  {w.id === workspaceId ? "Active" : "Switch"}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Frontend calls{" "}
            <code className="text-foreground">
              {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}
            </code>{" "}
            with <code className="text-foreground">Authorization: Bearer</code>{" "}
            and <code className="text-foreground">X-Workspace-Id</code> on each
            workspace-scoped request.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
