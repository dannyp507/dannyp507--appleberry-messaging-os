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
import { Download, Upload, Sparkles, Copy, Check, Plus, Trash2 } from "lucide-react";
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
  "BUTTONS",
  "LIST",
  "MEDIA",
  "DELAY",
  "AI_REPLY",
  "WEBHOOK",
  "END",
];

const NODE_TYPE_LABELS: Partial<Record<ChatbotNodeType, string>> = {
  TEXT:      "TEXT — Send a message",
  QUESTION:  "QUESTION — Ask for input",
  CONDITION: "CONDITION — Branch on variable",
  BUTTONS:   "BUTTONS — Interactive buttons",
  LIST:      "LIST — Interactive list",
  MEDIA:     "MEDIA — Send image/video/file",
  DELAY:     "DELAY — Wait N seconds",
  AI_REPLY:  "AI_REPLY — AI-generated reply",
  WEBHOOK:   "WEBHOOK — External call / tag action",
  END:       "END — End the flow",
};

export default function ChatbotPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [flowName, setFlowName] = useState("");

  const [nodeType, setNodeType] = useState<ChatbotNodeType>("TEXT");
  // Generic fields for most node types
  const [nodeContent, setNodeContent] = useState<Record<string, unknown>>({});
  // BUTTONS-specific rows
  const [btnRows, setBtnRows] = useState([
    { id: "btn1", title: "" },
    { id: "btn2", title: "" },
  ]);
  // LIST-specific rows
  const [listRows, setListRows] = useState([
    { id: "row1", title: "", description: "" },
  ]);
  // WEBHOOK: keep raw JSON textarea for complex payloads
  const [nodeContentJson, setNodeContentJson] = useState("{}");

  const handleTypeChange = (t: ChatbotNodeType) => {
    setNodeType(t as ChatbotNodeType);
    setNodeContent({});
    setNodeContentJson("{}");
    setBtnRows([{ id: "btn1", title: "" }, { id: "btn2", title: "" }]);
    setListRows([{ id: "row1", title: "", description: "" }]);
  };

  const nc = (key: string, val: unknown) =>
    setNodeContent((p) => ({ ...p, [key]: val }));

  // Import state
  const fileRef = useRef<HTMLInputElement>(null);
  const [importName, setImportName] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      let content: Record<string, unknown>;
      if (nodeType === "BUTTONS") {
        content = {
          ...nodeContent,
          buttons: btnRows.filter((b) => b.id.trim() && b.title.trim()),
        };
      } else if (nodeType === "LIST") {
        content = {
          ...nodeContent,
          sections: [{ title: "Options", rows: listRows.filter((r) => r.id.trim() && r.title.trim()) }],
        };
      } else if (nodeType === "WEBHOOK") {
        try {
          content = JSON.parse(nodeContentJson || "{}") as Record<string, unknown>;
        } catch {
          throw new Error("Webhook content must be valid JSON");
        }
      } else {
        content = { ...nodeContent };
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

  // ── Flow templates ────────────────────────────────────────────────────────
  const FLOW_TEMPLATES = [
    {
      id: "service-business",
      name: "Service Business",
      tag: "Repairs · Salons · Clinics",
      description: "Welcome flow, 3 service pages, booking intake, store info, human handoff, and AI fallback.",
      steps: 12,
      file: "/flow-templates/service-business.json",
      color: "bg-indigo-50 text-indigo-600 border-indigo-100",
      dot: "bg-indigo-500",
    },
    {
      id: "restaurant",
      name: "Restaurant & Food",
      tag: "Restaurants · Takeaways · Cafés",
      description: "Menu browsing, takeaway orders, table reservations, delivery info, and AI fallback.",
      steps: 12,
      file: "/flow-templates/restaurant.json",
      color: "bg-orange-50 text-orange-600 border-orange-100",
      dot: "bg-orange-500",
    },
    {
      id: "retail-store",
      name: "Retail Store",
      tag: "Boutiques · Electronics · Hardware",
      description: "3 product categories, deals page, stock enquiry, store info, human handoff, and AI fallback.",
      steps: 12,
      file: "/flow-templates/retail-store.json",
      color: "bg-emerald-50 text-emerald-600 border-emerald-100",
      dot: "bg-emerald-500",
    },
  ] as const;

  const copyPrompt = async (templateId: string) => {
    try {
      const res = await fetch(FLOW_TEMPLATES.find(t => t.id === templateId)!.file);
      const json = await res.json() as { _meta?: { chatgpt_prompt?: string } };
      const prompt = json._meta?.chatgpt_prompt ?? "";
      await navigator.clipboard.writeText(prompt);
      setCopiedId(templateId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* ignore */
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

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

        {/* ── Starter Templates ────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#6366F1]" />
              Starter Templates
            </CardTitle>
            <CardDescription>
              Download a template → paste the embedded ChatGPT prompt + your business info into ChatGPT → import the result above.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            {FLOW_TEMPLATES.map((t) => (
              <div
                key={t.id}
                className={`rounded-xl border p-3.5 ${t.color}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`inline-block size-1.5 rounded-full ${t.dot}`} />
                      <p className="text-sm font-semibold leading-none">{t.name}</p>
                    </div>
                    <p className="text-[10px] font-medium opacity-70 mb-1">{t.tag}</p>
                    <p className="text-xs opacity-80 leading-relaxed">{t.description}</p>
                    <p className="text-[10px] opacity-60 mt-1">{t.steps} steps</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <a
                    href={t.file}
                    download
                    className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 bg-white/60 px-3 py-1.5 text-xs font-semibold hover:bg-white/90 transition-colors"
                  >
                    <Download className="size-3" />
                    Download JSON
                  </a>
                  <button
                    onClick={() => copyPrompt(t.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 bg-white/40 px-3 py-1.5 text-xs font-semibold hover:bg-white/70 transition-colors"
                  >
                    {copiedId === t.id ? (
                      <><Check className="size-3" />Copied!</>
                    ) : (
                      <><Copy className="size-3" />Copy ChatGPT Prompt</>
                    )}
                  </button>
                </div>
              </div>
            ))}
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

                  <div className="space-y-3 border-t pt-4">
                    <h3 className="text-sm font-medium">Add node</h3>
                    <Select value={nodeType} onValueChange={handleTypeChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NODE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {NODE_TYPE_LABELS[t] ?? t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* TEXT */}
                    {nodeType === "TEXT" && (
                      <Textarea
                        rows={3}
                        placeholder="Message to send…"
                        value={(nodeContent.text as string) ?? ""}
                        onChange={(e) => nc("text", e.target.value)}
                      />
                    )}

                    {/* QUESTION */}
                    {nodeType === "QUESTION" && (
                      <div className="space-y-2">
                        <Textarea
                          rows={3}
                          placeholder="Question to ask the user…"
                          value={(nodeContent.prompt as string) ?? ""}
                          onChange={(e) => nc("prompt", e.target.value)}
                        />
                        <Input
                          placeholder="Variable name to store answer (e.g. name)"
                          value={(nodeContent.variableKey as string) ?? ""}
                          onChange={(e) => nc("variableKey", e.target.value)}
                        />
                      </div>
                    )}

                    {/* CONDITION */}
                    {nodeType === "CONDITION" && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Variable to test</Label>
                        <Input
                          placeholder="e.g. lastInput or answer"
                          value={(nodeContent.variableKey as string) ?? ""}
                          onChange={(e) => nc("variableKey", e.target.value)}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Draw edges from this node and enter the matching value per edge.
                        </p>
                      </div>
                    )}

                    {/* BUTTONS */}
                    {nodeType === "BUTTONS" && (
                      <div className="space-y-2">
                        <Textarea
                          rows={2}
                          placeholder="Message body (required)…"
                          value={(nodeContent.body as string) ?? ""}
                          onChange={(e) => nc("body", e.target.value)}
                        />
                        <Input
                          placeholder="Header text (optional)"
                          value={(nodeContent.header as string) ?? ""}
                          onChange={(e) => nc("header", e.target.value)}
                        />
                        <Input
                          placeholder="Footer text (optional)"
                          value={(nodeContent.footer as string) ?? ""}
                          onChange={(e) => nc("footer", e.target.value)}
                        />
                        <Label className="text-xs text-muted-foreground">Buttons (max 3) — ID is used for routing</Label>
                        {btnRows.map((b, i) => (
                          <div key={i} className="flex gap-1.5 items-center">
                            <Input
                              className="w-24 text-xs"
                              placeholder={`btn${i + 1}`}
                              value={b.id}
                              onChange={(e) => setBtnRows((r) => r.map((x, j) => j === i ? { ...x, id: e.target.value } : x))}
                            />
                            <Input
                              className="flex-1 text-xs"
                              placeholder="Button label"
                              value={b.title}
                              onChange={(e) => setBtnRows((r) => r.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                            />
                            {btnRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setBtnRows((r) => r.filter((_, j) => j !== i))}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        {btnRows.length < 3 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setBtnRows((r) => [...r, { id: `btn${r.length + 1}`, title: "" }])}
                          >
                            <Plus className="size-3 mr-1" /> Add button
                          </Button>
                        )}
                      </div>
                    )}

                    {/* LIST */}
                    {nodeType === "LIST" && (
                      <div className="space-y-2">
                        <Textarea
                          rows={2}
                          placeholder="Message body (required)…"
                          value={(nodeContent.body as string) ?? ""}
                          onChange={(e) => nc("body", e.target.value)}
                        />
                        <Input
                          placeholder="List button label (e.g. View options)"
                          value={(nodeContent.buttonText as string) ?? ""}
                          onChange={(e) => nc("buttonText", e.target.value)}
                        />
                        <Input
                          placeholder="Header text (optional)"
                          value={(nodeContent.header as string) ?? ""}
                          onChange={(e) => nc("header", e.target.value)}
                        />
                        <Input
                          placeholder="Footer text (optional)"
                          value={(nodeContent.footer as string) ?? ""}
                          onChange={(e) => nc("footer", e.target.value)}
                        />
                        <Label className="text-xs text-muted-foreground">Rows — ID is used for routing</Label>
                        {listRows.map((r, i) => (
                          <div key={i} className="flex gap-1.5 items-center">
                            <Input
                              className="w-20 text-xs"
                              placeholder={`row${i + 1}`}
                              value={r.id}
                              onChange={(e) => setListRows((rs) => rs.map((x, j) => j === i ? { ...x, id: e.target.value } : x))}
                            />
                            <Input
                              className="flex-1 text-xs"
                              placeholder="Row title"
                              value={r.title}
                              onChange={(e) => setListRows((rs) => rs.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                            />
                            <Input
                              className="flex-1 text-xs"
                              placeholder="Description (optional)"
                              value={r.description}
                              onChange={(e) => setListRows((rs) => rs.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                            />
                            {listRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setListRows((rs) => rs.filter((_, j) => j !== i))}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setListRows((rs) => [...rs, { id: `row${rs.length + 1}`, title: "", description: "" }])}
                        >
                          <Plus className="size-3 mr-1" /> Add row
                        </Button>
                      </div>
                    )}

                    {/* MEDIA */}
                    {nodeType === "MEDIA" && (
                      <div className="space-y-2">
                        <Input
                          placeholder="Public URL (https://…)"
                          value={(nodeContent.url as string) ?? ""}
                          onChange={(e) => nc("url", e.target.value)}
                        />
                        <Input
                          placeholder="Caption (optional)"
                          value={(nodeContent.caption as string) ?? ""}
                          onChange={(e) => nc("caption", e.target.value)}
                        />
                      </div>
                    )}

                    {/* DELAY */}
                    {nodeType === "DELAY" && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Seconds to wait (max 30)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          placeholder="5"
                          value={(nodeContent.seconds as number) ?? ""}
                          onChange={(e) => nc("seconds", Number(e.target.value))}
                        />
                      </div>
                    )}

                    {/* AI_REPLY */}
                    {nodeType === "AI_REPLY" && (
                      <Textarea
                        rows={3}
                        placeholder="System prompt for AI (optional — leave blank to use workspace default)"
                        value={(nodeContent.systemPrompt as string) ?? ""}
                        onChange={(e) => nc("systemPrompt", e.target.value)}
                      />
                    )}

                    {/* WEBHOOK — keeps raw JSON for advanced users */}
                    {nodeType === "WEBHOOK" && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Payload (JSON). Use{" "}
                          <code className="text-[11px]">{`{"type":"TAG","tagName":"hot-lead"}`}</code>{" "}
                          to tag the contact.
                        </Label>
                        <Textarea
                          rows={4}
                          className="font-mono text-xs"
                          value={nodeContentJson}
                          onChange={(e) => setNodeContentJson(e.target.value)}
                        />
                      </div>
                    )}

                    {/* END — no fields needed */}
                    {nodeType === "END" && (
                      <p className="text-xs text-muted-foreground">
                        Marks the end of the flow. No further nodes will be visited.
                      </p>
                    )}

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
