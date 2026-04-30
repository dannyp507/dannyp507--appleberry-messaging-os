"use client";

import { FlowCanvas } from "@/components/chatbot/flow-canvas";
import { NodeConfigForm } from "@/components/chatbot/node-config-form";
import { buildContent } from "@/components/chatbot/node-config";
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
import { Download, Upload, Sparkles, Copy, Check } from "lucide-react";
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

// ─── Node type definitions ────────────────────────────────────────────────────

const NODE_TYPES: { value: ChatbotNodeType; label: string; desc: string }[] = [
  { value: "TEXT",           label: "💬 Text Message",         desc: "Send a plain message. Use {{variable}} to insert captured data." },
  { value: "MEDIA",          label: "🖼️ Media Message",        desc: "Send an image, video, audio clip, or document. Optionally add a caption." },
  { value: "BUTTONS",        label: "🔘 Button Menu",          desc: "Show up to 3 tappable buttons. Waits for the customer to choose." },
  { value: "LIST",           label: "📋 List Picker",          desc: "Show a scrollable list of options (Cloud API only; falls back to numbered text)." },
  { value: "QUESTION",       label: "❓ Question",              desc: "Ask a question and wait for the reply. Saves answer as a variable." },
  { value: "CONDITION",      label: "🔀 Condition",             desc: "Branch the flow based on a variable's value." },
  { value: "AI_REPLY",       label: "✨ AI Reply",              desc: "Generate a dynamic reply using Gemini or OpenAI with a custom system prompt." },
  { value: "TAG_CONTACT",    label: "🏷️ Tag Contact",          desc: "Apply a tag to the contact. Creates the tag if it doesn't exist." },
  { value: "HUMAN_HANDOFF",  label: "👤 Human Handoff",        desc: "Send a message then transfer the conversation to a human agent." },
  { value: "END",            label: "🔴 End Flow",             desc: "Terminate the conversation flow. Optionally send a goodbye message." },
  { value: "SAVE_TO_SHEET",  label: "📊 Save to Google Sheet", desc: "Append a row to your connected Google Sheet with contact data and captured variables." },
  { value: "CHECK_CALENDAR", label: "📅 Check Availability",   desc: "Check if a date/time is available on your Google Calendar." },
  { value: "CREATE_BOOKING", label: "🗓️ Create Booking",       desc: "Create a Google Calendar event with the customer's details." },
  { value: "WEBHOOK",        label: "🔗 Webhook",              desc: "Legacy tag-contact action. Use 'Tag Contact' node for new flows." },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatbotPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [flowName, setFlowName] = useState("");

  const [nodeType, setNodeType] = useState<ChatbotNodeType>("TEXT");
  const [nodeConfig, setNodeConfig] = useState<Record<string, string>>({});

  const fileRef = useRef<HTMLInputElement>(null);
  const [importName, setImportName] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const updateConfig = (key: string, value: string) =>
    setNodeConfig((prev) => ({ ...prev, [key]: value }));

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importFile || importName.trim().length < 2) throw new Error("Name and file required");
      const text = await importFile.text();
      const data = JSON.parse(text) as unknown;
      const { data: result } = await api.post("/chatbot/flows/import", { name: importName.trim(), data });
      return result;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      setImportName(""); setImportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.success(`Imported "${(result as { name: string }).name}" successfully`);
    },
    onError: (e) => toast.error("Import failed", getApiErrorMessage(e)),
  });

  const exportFlow = async (flowId: string, name: string) => {
    try {
      const { data } = await api.get(`/chatbot/flows/${flowId}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `${name.replace(/\s+/g, "_")}_flow.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("Export failed", getApiErrorMessage(e)); }
  };

  const { data: flows = [], isLoading } = useQuery({
    queryKey: qk.chatbotFlows,
    queryFn: async () => { const { data } = await api.get<ChatbotFlowSummary[]>("/chatbot/flows"); return data; },
  });

  const { data: detail } = useQuery({
    queryKey: qk.chatbotFlow(selectedId ?? ""),
    enabled: !!selectedId,
    queryFn: async () => { const { data } = await api.get<ChatbotFlowDetail>(`/chatbot/flows/${selectedId}`); return data; },
  });

  const createFlowMutation = useMutation({
    mutationFn: async () => { await api.post("/chatbot/flows", { name: flowName }); },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows }); setCreateOpen(false); setFlowName(""); },
    onError: (e) => toast.error("Could not create flow", getApiErrorMessage(e)),
  });

  const statusMutation = useMutation({
    mutationFn: async (status: "DRAFT" | "ACTIVE") => {
      if (!selectedId) return;
      await api.patch(`/chatbot/flows/${selectedId}/status`, { status });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      if (selectedId) void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(selectedId) });
    },
    onError: (e) => toast.error("Could not update status", getApiErrorMessage(e)),
  });

  const addNodeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !detail) return;
      const content = buildContent(nodeType, nodeConfig);
      const n = detail.nodes.length;
      await api.post(`/chatbot/flows/${selectedId}/nodes`, {
        type: nodeType,
        content,
        position: { x: 80 + (n % 5) * 200, y: 80 + Math.floor(n / 5) * 120 },
      });
    },
    onSuccess: () => {
      if (selectedId) void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(selectedId) });
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      setNodeConfig({});
      toast.success("Node added");
    },
    onError: (e) => toast.error("Could not add node", getApiErrorMessage(e)),
  });

  const entryMutation = useMutation({
    mutationFn: async (entryNodeId: string) => {
      if (!selectedId) return;
      await api.patch(`/chatbot/flows/${selectedId}/entry`, { entryNodeId });
    },
    onSuccess: () => {
      if (selectedId) void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(selectedId) });
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
    },
    onError: (e) => toast.error("Could not set entry", getApiErrorMessage(e)),
  });

  // ── Flow templates ──────────────────────────────────────────────────────────
  const FLOW_TEMPLATES = [
    {
      id: "service-business",
      name: "Service Business",
      tag: "Repairs · Salons · Clinics",
      description: "Welcome, 3 service pages, booking intake, store info, human handoff, AI fallback.",
      steps: 12,
      file: "/flow-templates/service-business.json",
      color: "bg-indigo-50 text-indigo-600 border-indigo-100",
      dot: "bg-indigo-500",
    },
    {
      id: "restaurant",
      name: "Restaurant & Food",
      tag: "Restaurants · Takeaways · Cafés",
      description: "Menu browsing, takeaway orders, table reservations, delivery info, AI fallback.",
      steps: 12,
      file: "/flow-templates/restaurant.json",
      color: "bg-orange-50 text-orange-600 border-orange-100",
      dot: "bg-orange-500",
    },
    {
      id: "retail-store",
      name: "Retail Store",
      tag: "Boutiques · Electronics · Hardware",
      description: "3 product categories, deals, stock enquiry, store info, human handoff, AI fallback.",
      steps: 12,
      file: "/flow-templates/retail-store.json",
      color: "bg-emerald-50 text-emerald-600 border-emerald-100",
      dot: "bg-emerald-500",
    },
    {
      id: "interactive-menu-demo",
      name: "Button Menu Demo",
      tag: "Buttons · List Picker · AI Reply",
      description: "Full demo: tappable button menu, scrollable list picker, conditional routing, AI reply. Download & import directly — no ChatGPT step needed.",
      steps: 10,
      file: "/flow-templates/interactive-menu-demo.json",
      color: "bg-violet-50 text-violet-600 border-violet-100",
      dot: "bg-violet-500",
      native: true,
    },
  ];

  const copyPrompt = async (templateId: string) => {
    try {
      const res = await fetch(FLOW_TEMPLATES.find((t) => t.id === templateId)!.file);
      const json = await res.json() as { _meta?: { chatgpt_prompt?: string } };
      await navigator.clipboard.writeText(json._meta?.chatgpt_prompt ?? "");
      setCopiedId(templateId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  const selectedNodeDef = NODE_TYPES.find((t) => t.value === nodeType);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <PageHeader
        title="Chatbot Flows"
        description="Visual builder: drag nodes, connect handles, click a node to edit it inline."
        action={
          <>
            <Button type="button" onClick={() => setCreateOpen(true)}>New flow</Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogContent>
                <DialogHeader><DialogTitle>Create flow</DialogTitle></DialogHeader>
                <div className="grid gap-2 py-2">
                  <Label>Name</Label>
                  <Input value={flowName} onChange={(e) => setFlowName(e.target.value)} />
                </div>
                <DialogFooter>
                  <Button disabled={createFlowMutation.isPending || flowName.length < 2} onClick={() => createFlowMutation.mutate()}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_1fr]">
        {/* ── Left column ── */}
        <div className="space-y-4">

          {/* Flow list */}
          <Card>
            <CardHeader><CardTitle className="text-base">Flows</CardTitle></CardHeader>
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
                    <TableRow><TableCell colSpan={3} className="text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : flows.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-muted-foreground">No flows yet.</TableCell></TableRow>
                  ) : (
                    flows.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.name}</TableCell>
                        <TableCell><Badge variant="secondary">{f.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" title="Export" onClick={() => exportFlow(f.id, f.name)}>
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant={selectedId === f.id ? "default" : "outline"} onClick={() => setSelectedId(f.id)}>
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

          {/* Starter templates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#6366F1]" />
                Starter Templates
              </CardTitle>
              <CardDescription>Download → fill ChatGPT prompt → import above.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pb-4">
              {FLOW_TEMPLATES.map((t) => (
                <div key={t.id} className={`rounded-xl border p-3.5 ${t.color}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`inline-block size-1.5 rounded-full ${t.dot}`} />
                    <p className="text-sm font-semibold">{t.name}</p>
                  </div>
                  <p className="text-[10px] font-medium opacity-70 mb-1">{t.tag}</p>
                  <p className="text-xs opacity-80 leading-relaxed">{t.description}</p>
                  <div className="flex gap-2 mt-2">
                    <a href={t.file} download className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 bg-white/60 px-3 py-1.5 text-xs font-semibold hover:bg-white/90 transition-colors">
                      <Download className="size-3" />Download JSON
                    </a>
                    {!("native" in t && t.native) && (
                      <button onClick={() => copyPrompt(t.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 bg-white/40 px-3 py-1.5 text-xs font-semibold hover:bg-white/70 transition-colors">
                        {copiedId === t.id ? <><Check className="size-3" />Copied!</> : <><Copy className="size-3" />Copy Prompt</>}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Import */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" />Import flow</CardTitle>
              <CardDescription>Upload a flow JSON exported from Appleberry or any compatible platform.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Flow name</Label>
                <Input value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="e.g. Main Menu" />
              </div>
              <div className="space-y-1">
                <Label>Flow file (.json)</Label>
                <input ref={fileRef} type="file" accept=".json,application/json"
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
              </div>
              <Button size="sm" disabled={importMutation.isPending || importName.trim().length < 2 || !importFile} onClick={() => importMutation.mutate()}>
                {importMutation.isPending ? "Importing…" : "Import"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">
          {!detail ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Select a flow from the left to open the canvas.
              </CardContent>
            </Card>
          ) : (
            <>
              <FlowCanvas flowId={detail.id} detail={detail} />

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{detail.name}</CardTitle>
                  <CardDescription>Click any node on the canvas to edit it inline. Use the form below to add new nodes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                  {/* Status */}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" type="button" onClick={() => statusMutation.mutate("DRAFT")} disabled={statusMutation.isPending}>
                      Set Draft
                    </Button>
                    <Button size="sm" type="button" onClick={() => statusMutation.mutate("ACTIVE")} disabled={statusMutation.isPending}>
                      Activate
                    </Button>
                    <Badge variant={detail.status === "ACTIVE" ? "default" : "secondary"} className="self-center">{detail.status}</Badge>
                  </div>

                  {/* Entry node */}
                  <div className="space-y-2">
                    <Label>Entry node (starting point)</Label>
                    {detail.nodes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Add a node first, then set the entry.</p>
                    ) : (
                      <Select value={detail.entryNodeId ?? undefined} onValueChange={(v) => { if (v) entryMutation.mutate(v); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick entry node" />
                        </SelectTrigger>
                        <SelectContent>
                          {detail.nodes.map((n) => {
                            const content = n.content as Record<string, unknown>;
                            const label = (content.text ?? content.prompt ?? content.systemPrompt ?? n.type) as string;
                            return (
                              <SelectItem key={n.id} value={n.id}>
                                {n.type} · {String(label).slice(0, 30)}{String(label).length > 30 ? "…" : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Add node */}
                  <div className="space-y-3 border-t pt-4">
                    <h3 className="text-sm font-semibold">Add node</h3>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Node type</Label>
                      <Select
                        value={nodeType}
                        onValueChange={(v) => { setNodeType(v as ChatbotNodeType); setNodeConfig({}); }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NODE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedNodeDef && (
                        <p className="text-[10px] text-muted-foreground leading-relaxed">{selectedNodeDef.desc}</p>
                      )}
                    </div>

                    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                      <NodeConfigForm nodeType={nodeType} config={nodeConfig} onChange={updateConfig} />
                    </div>

                    <Button
                      size="sm"
                      type="button"
                      className="w-full"
                      onClick={() => addNodeMutation.mutate()}
                      disabled={addNodeMutation.isPending}
                    >
                      {addNodeMutation.isPending ? "Adding…" : "Add node to canvas"}
                    </Button>
                  </div>

                  {/* Node list */}
                  {detail.nodes.length > 0 && (
                    <div className="border-t pt-4 space-y-1.5">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nodes in this flow</h3>
                      {detail.nodes.map((n) => {
                        const content = n.content as Record<string, unknown>;
                        const preview = String(content.text ?? content.prompt ?? content.systemPrompt ?? content.tagName ?? "").slice(0, 40);
                        return (
                          <div key={n.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5">
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">{n.type}</span>
                              {preview && <p className="text-xs text-foreground/80 truncate">{preview}</p>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {detail.entryNodeId === n.id && (
                                <Badge variant="default" className="text-[9px] py-0 h-4 px-1.5">Entry</Badge>
                              )}
                              <span className="text-[9px] text-muted-foreground font-mono">{n.id.slice(0, 6)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
