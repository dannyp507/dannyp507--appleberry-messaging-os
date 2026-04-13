"use client";

import { FlowCanvas } from "@/components/chatbot/flow-canvas";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { Download, Upload } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type {
  ChatbotFlowDetail,
  ChatbotFlowSummary,
  ChatbotNodeType,
} from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

const NODE_TYPES: ChatbotNodeType[] = [
  "TEXT",
  "QUESTION",
  "CONDITION",
  "ACTION",
];

export default function ChatbotPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [flowName, setFlowName] = useState("");

  const [nodeType, setNodeType] = useState<ChatbotNodeType>("TEXT");
  const [nodeContentJson, setNodeContentJson] = useState("{}");

  // Import state
  const fileRef = useRef<HTMLInputElement>(null);
  const [importName, setImportName] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importFile || importName.trim().length < 2) throw new Error("Name and file required");
      const text = await importFile.text();
      const data = JSON.parse(text) as unknown;
      const { data: result } = await api.post("/chatbot/flows/import", {
        name: importName.trim(),
        data,
      });
      return result;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      setImportName("");
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.success(`Imported "${(result as { name: string }).name}" successfully`);
    },
    onError: (e) => toast.error("Import failed", getApiErrorMessage(e)),
  });

  const exportFlow = async (flowId: string, flowName: string) => {
    try {
      const { data } = await api.get(`/chatbot/flows/${flowId}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${flowName.replace(/\s+/g, "_")}_flow.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Export failed", getApiErrorMessage(e));
    }
  };

  const { data: flows = [], isLoading } = useQuery({
    queryKey: qk.chatbotFlows,
    queryFn: async () => {
      const { data } = await api.get<ChatbotFlowSummary[]>("/chatbot/flows");
      return data;
    },
  });

  const { data: detail } = useQuery({
    queryKey: qk.chatbotFlow(selectedId ?? ""),
    enabled: !!selectedId,
    queryFn: async () => {
      const { data } = await api.get<ChatbotFlowDetail>(
        `/chatbot/flows/${selectedId}`,
      );
      return data;
    },
  });

  const createFlowMutation = useMutation({
    mutationFn: async () => {
      await api.post("/chatbot/flows", { name: flowName });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      setCreateOpen(false);
      setFlowName("");
    },
    onError: (e) => toast.error("Could not create flow", getApiErrorMessage(e)),
  });

  const statusMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "ACTIVE") => {
      if (!selectedId) return;
      await api.patch(`/chatbot/flows/${selectedId}/status`, { status });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      if (selectedId) {
        void queryClient.invalidateQueries({
          queryKey: qk.chatbotFlow(selectedId),
        });
      }
    },
    onError: (e) => toast.error("Could not update status", getApiErrorMessage(e)),
  });

  const addNodeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !detail) return;
      let content: Record<string, unknown> = {};
      try {
        content = JSON.parse(nodeContentJson || "{}") as Record<
          string,
          unknown
        >;
      } catch {
        throw new Error("Node content must be valid JSON");
      }
      const n = detail.nodes.length;
      await api.post(`/chatbot/flows/${selectedId}/nodes`, {
        type: nodeType,
        content,
        position: { x: 80 + (n % 6) * 90, y: 80 + Math.floor(n / 6) * 100 },
      });
    },
    onSuccess: () => {
      if (selectedId) {
        void queryClient.invalidateQueries({
          queryKey: qk.chatbotFlow(selectedId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
    },
    onError: (e) => toast.error("Could not add node", getApiErrorMessage(e)),
  });

  const entryMutation = useMutation({
    mutationFn: async (entryNodeId: string) => {
      if (!selectedId) return;
      await api.patch(`/chatbot/flows/${selectedId}/entry`, { entryNodeId });
    },
    onSuccess: () => {
      if (selectedId) {
        void queryClient.invalidateQueries({
          queryKey: qk.chatbotFlow(selectedId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
    },
    onError: (e) => toast.error("Could not set entry", getApiErrorMessage(e)),
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <PageHeader
        title="Chatbot flows"
        description="Visual builder: drag nodes, connect handles, Backspace to delete. Positions save automatically."
        action={
          <>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              New flow
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create flow</DialogTitle>
                </DialogHeader>
                <div className="grid gap-2 py-2">
                  <Label>Name</Label>
                  <Input
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button
                    disabled={createFlowMutation.isPending || flowName.length < 2}
                    onClick={() => createFlowMutation.mutate()}
                  >
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]">
        <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Flows</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : flows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No flows.
                    </TableCell>
                  </TableRow>
                ) : (
                  flows.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{f.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Export flow"
                            onClick={() => exportFlow(f.id, f.name)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant={selectedId === f.id ? "default" : "outline"}
                            onClick={() => setSelectedId(f.id)}
                          >
                            Open
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Import flow ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import flow
            </CardTitle>
            <CardDescription>
              Upload a flow JSON exported from Appleberry or any compatible WhatsApp chatbot platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Flow name</Label>
              <Input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="e.g. AppleBerry Main Menu"
              />
            </div>
            <div className="space-y-1">
              <Label>Flow file (.json)</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button
              size="sm"
              disabled={
                importMutation.isPending ||
                importName.trim().length < 2 ||
                !importFile
              }
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending ? "Importing…" : "Import"}
            </Button>
          </CardContent>
        </Card>
        </div>{/* end left column */}

        <div className="space-y-4">
          {!detail ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Select a flow to open the canvas.
              </CardContent>
            </Card>
          ) : (
            <>
              <FlowCanvas flowId={detail.id} detail={detail} />

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{detail.name}</CardTitle>
                  <CardDescription>
                    Draft / active, entry node, and palette. Connect nodes by
                    dragging from a handle to another node.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => statusMutation.mutate("DRAFT")}
                      disabled={statusMutation.isPending}
                    >
                      Set draft
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => statusMutation.mutate("ACTIVE")}
                      disabled={statusMutation.isPending}
                    >
                      Activate
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Entry node</Label>
                    {detail.nodes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Add a node first, then choose the entry.
                      </p>
                    ) : (
                      <Select
                        value={detail.entryNodeId ?? undefined}
                        onValueChange={(v) => {
                          if (v) entryMutation.mutate(v);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pick entry node" />
                        </SelectTrigger>
                        <SelectContent>
                          {detail.nodes.map((n) => (
                            <SelectItem key={n.id} value={n.id}>
                              {n.type} · {n.id.slice(0, 8)}…
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <h3 className="text-sm font-medium">Add node</h3>
                    <Select
                      value={nodeType}
                      onValueChange={(v) =>
                        setNodeType((v ?? "TEXT") as ChatbotNodeType)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NODE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      rows={4}
                      className="font-mono text-xs"
                      value={nodeContentJson}
                      onChange={(e) => setNodeContentJson(e.target.value)}
                      placeholder='JSON object, e.g. {"text":"Hello"}'
                    />
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => addNodeMutation.mutate()}
                      disabled={addNodeMutation.isPending}
                    >
                      Add node to graph
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
