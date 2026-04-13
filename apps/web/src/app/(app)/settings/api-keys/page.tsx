"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";
import { Copy, Key, Plus, Trash2 } from "lucide-react";

type ApiKeyScope = "READ" | "WRITE" | "ADMIN";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  ipAllowlist: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  requestCount: string;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
}

interface CreatedKey extends ApiKey {
  secret: string;
}

const SCOPE_LABELS: Record<ApiKeyScope, string> = {
  READ: "Read — list and fetch resources",
  WRITE: "Write — create, update, delete resources",
  ADMIN: "Admin — full access including team management",
};

export default function ApiKeysPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["READ"]);
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const { data } = await api.get("/api-keys");
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<CreatedKey>("/api-keys", { name, scopes });
      return data;
    },
    onSuccess: (data) => {
      setCreatedKey(data);
      setName("");
      setScopes(["READ"]);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      toast.success("API key revoked");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });

  function toggleScope(scope: ApiKeyScope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  function copySecret() {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey.secret);
    toast.success("Copied to clipboard");
  }

  const scopeColor: Record<ApiKeyScope, "default" | "secondary" | "destructive"> = {
    READ: "secondary",
    WRITE: "default",
    ADMIN: "destructive",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">API Keys</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create scoped keys to access the Appleberry API programmatically.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New API Key
        </Button>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) { setCreatedKey(null); setError(null); }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {createdKey ? "API Key Created" : "Create API Key"}
              </DialogTitle>
            </DialogHeader>

            {createdKey ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  <strong>Copy this key now.</strong> It will never be shown again.
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono truncate">
                    {createdKey.secret}
                  </code>
                  <Button size="icon" variant="outline" onClick={copySecret}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Button className="w-full" onClick={() => { setOpen(false); setCreatedKey(null); }}>
                  Done
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="key-name">Key Name</Label>
                  <Input
                    id="key-name"
                    placeholder="e.g. Production Integration"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Scopes</Label>
                  {(Object.keys(SCOPE_LABELS) as ApiKeyScope[]).map((scope) => (
                    <div key={scope} className="flex items-start gap-3">
                      <Checkbox
                        id={`scope-${scope}`}
                        checked={scopes.includes(scope)}
                        onCheckedChange={() => toggleScope(scope)}
                      />
                      <div>
                        <label htmlFor={`scope-${scope}`} className="text-sm font-medium cursor-pointer">
                          {scope}
                        </label>
                        <p className="text-xs text-muted-foreground">{SCOPE_LABELS[scope]}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button
                  className="w-full"
                  disabled={!name.trim() || scopes.length === 0 || createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? "Creating…" : "Create Key"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Key className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No API keys yet</p>
            <p className="text-sm text-muted-foreground">
              Create a key to start integrating with the Appleberry API.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <Card key={key.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{key.name}</CardTitle>
                    <CardDescription className="font-mono text-xs mt-0.5">
                      {key.keyPrefix}••••••••••••••••••••••••••••••••
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => revokeMutation.mutate(key.id)}
                    disabled={revokeMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {key.scopes.map((s) => (
                    <Badge key={s} variant={scopeColor[s]} className="text-xs">
                      {s}
                    </Badge>
                  ))}
                  <span className="ml-auto">
                    {key.lastUsedAt
                      ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                      : "Never used"}
                  </span>
                  <span>·</span>
                  <span>{Number(key.requestCount).toLocaleString()} requests</span>
                  {key.expiresAt && (
                    <>
                      <span>·</span>
                      <span>Expires {new Date(key.expiresAt).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
