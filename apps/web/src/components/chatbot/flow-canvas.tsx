"use client";

import "@xyflow/react/dist/style.css";

import { ChatbotFlowNode } from "@/components/chatbot/chatbot-flow-node";
import { NodeConfigForm } from "@/components/chatbot/node-config-form";
import { buildContent, flattenContent } from "@/components/chatbot/node-config";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { ChatbotFlowDetail, ChatbotNodeType } from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import {
  addEdge,
  Background,
  Controls,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type Node,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useOnViewportChange,
  useReactFlow,
} from "@xyflow/react";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ─── Node type picker items ───────────────────────────────────────────────────

const PICKER_ITEMS: { type: ChatbotNodeType; emoji: string; label: string; desc: string; color: string }[] = [
  { type: "TEXT",           emoji: "💬", label: "Text",          desc: "Send a message",                color: "hover:bg-indigo-50 dark:hover:bg-indigo-950/40"  },
  { type: "MEDIA",          emoji: "🖼️", label: "Media",         desc: "Image, video, audio or file",   color: "hover:bg-sky-50 dark:hover:bg-sky-950/40"        },
  { type: "BUTTONS",        emoji: "🔘", label: "Buttons",       desc: "Tappable choice buttons",        color: "hover:bg-purple-50 dark:hover:bg-purple-950/40"  },
  { type: "LIST",           emoji: "📋", label: "List Picker",   desc: "Scrollable list of options",    color: "hover:bg-cyan-50 dark:hover:bg-cyan-950/40"      },
  { type: "QUESTION",       emoji: "❓", label: "Question",      desc: "Ask & save the reply",          color: "hover:bg-amber-50 dark:hover:bg-amber-950/40"    },
  { type: "CONDITION",      emoji: "🔀", label: "Condition",     desc: "Branch on a variable",          color: "hover:bg-orange-50 dark:hover:bg-orange-950/40"  },
  { type: "AI_REPLY",       emoji: "✨", label: "AI Reply",      desc: "Dynamic AI-generated message",  color: "hover:bg-violet-50 dark:hover:bg-violet-950/40"  },
  { type: "TAG_CONTACT",    emoji: "🏷️", label: "Tag Contact",   desc: "Apply a tag to the contact",   color: "hover:bg-lime-50 dark:hover:bg-lime-950/40"      },
  { type: "SAVE_TO_SHEET",  emoji: "📊", label: "Save to Sheet", desc: "Append row to Google Sheets",   color: "hover:bg-emerald-50 dark:hover:bg-emerald-950/40"},
  { type: "HUMAN_HANDOFF",  emoji: "👤", label: "Handoff",       desc: "Transfer to human agent",       color: "hover:bg-teal-50 dark:hover:bg-teal-950/40"      },
  { type: "END",            emoji: "🔴", label: "End Flow",      desc: "Terminate this conversation",   color: "hover:bg-red-50 dark:hover:bg-red-950/40"        },
];

// ─── Node type picker overlay (portal-rendered) ───────────────────────────────

function NodePicker({
  x, y,
  onSelect,
  onClose,
}: {
  x: number;
  y: number;
  onSelect: (type: ChatbotNodeType) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 280);
  const top  = Math.min(y, window.innerHeight - 420);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] w-64 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
      style={{ left, top }}
    >
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          Compose next step
        </p>
      </div>
      <div className="py-1 max-h-80 overflow-y-auto">
        {PICKER_ITEMS.map((item) => (
          <button
            key={item.type}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onSelect(item.type); onClose(); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${item.color}`}
          >
            <span className="text-lg leading-none w-5 shrink-0">{item.emoji}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-none">{item.label}</p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-tight">{item.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ─── Inline node edit panel (portal-rendered) ────────────────────────────────

const PANEL_W = 308;

function NodeEditPanel({
  node,
  flowId,
  entryNodeId,
  x,
  y,
  onClose,
  onUpdated,
  onDeleted,
}: {
  node: ChatbotFlowDetail["nodes"][0];
  flowId: string;
  entryNodeId: string | null;
  x: number;
  y: number;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const nodeType = node.type as ChatbotNodeType;

  const [config, setConfig] = useState<Record<string, string>>(() =>
    flattenContent(nodeType, (node.content ?? {}) as Record<string, unknown>),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset form only when switching to a different node
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setConfig(flattenContent(node.type as ChatbotNodeType, (node.content ?? {}) as Record<string, unknown>));
  }, [node.id]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const updateConfig = useCallback(
    (key: string, value: string) => setConfig((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/chatbot/flows/${flowId}/nodes/${node.id}`, {
        content: buildContent(nodeType, config),
      });
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      toast.success("Node updated");
      onUpdated();
    } catch (e) {
      toast.error("Could not update node", getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/chatbot/flows/${flowId}/nodes/${node.id}`);
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      toast.success("Node deleted");
      onDeleted();
    } catch (e) {
      toast.error("Could not delete node", getApiErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const handleSetEntry = async () => {
    try {
      await api.patch(`/chatbot/flows/${flowId}/entry`, { entryNodeId: node.id });
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      toast.success("Set as entry node");
      onUpdated();
    } catch (e) {
      toast.error("Could not set entry", getApiErrorMessage(e));
    }
  };

  const info = PICKER_ITEMS.find((p) => p.type === nodeType);
  const isEntry = entryNodeId === node.id;

  // Clamp to viewport
  const left = Math.min(x, window.innerWidth - PANEL_W - 8);
  const top  = Math.max(8, Math.min(y, window.innerHeight - 400));

  return createPortal(
    <div
      className="fixed z-[9998] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl"
      style={{ left, top, width: PANEL_W, maxHeight: "min(520px, calc(100vh - 24px))" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none">{info?.emoji ?? "🔧"}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-none">
              {info?.label ?? nodeType}
            </p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-mono">
              {node.id.slice(0, 8)}
              {isEntry && (
                <span className="ml-1.5 text-emerald-600 dark:text-emerald-400 font-sans font-medium not-italic">· Entry ⚡</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Scrollable form body */}
      <div className="overflow-y-auto flex-1 px-4 py-3">
        <NodeConfigForm nodeType={nodeType} config={config} onChange={updateConfig} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-1.5">
          {!isEntry && (
            <button
              onClick={() => void handleSetEntry()}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Set entry
            </button>
          )}
          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="rounded-lg border border-red-200 dark:border-red-900/40 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ─── Default content per node type ───────────────────────────────────────────

function defaultContent(type: ChatbotNodeType): Record<string, unknown> {
  switch (type) {
    case "TEXT":          return { text: "" };
    case "MEDIA":         return { url: "", caption: "", mediaType: "image" };
    case "QUESTION":      return { prompt: "", variableKey: "answer" };
    case "CONDITION":     return { variableKey: "lastInput" };
    case "AI_REPLY":      return { systemPrompt: "" };
    case "BUTTONS":       return { prompt: "", buttons: [] };
    case "LIST":          return { prompt: "", buttonText: "See Options", sections: [] };
    case "TAG_CONTACT":   return { type: "TAG", tagName: "" };
    case "HUMAN_HANDOFF": return { message: "👤 Connecting you with a team member. Please hold on!" };
    case "END":           return { message: "" };
    default:              return {};
  }
}

function defaultLabel(type: ChatbotNodeType): string {
  const found = PICKER_ITEMS.find((i) => i.type === type);
  return found ? `${found.emoji} ${found.label}` : type;
}

// ─── Canvas inner ─────────────────────────────────────────────────────────────

const nodeTypes = { chatbot: ChatbotFlowNode };

function nodeLabel(n: ChatbotFlowDetail["nodes"][0]): string {
  const c = n.content as Record<string, unknown>;
  if (typeof c.text === "string" && c.text.trim()) {
    const t = c.text.trim(); return t.length > 36 ? `${t.slice(0, 36)}…` : t;
  }
  if (typeof c.prompt === "string" && c.prompt.trim()) {
    const t = c.prompt.trim(); return t.length > 36 ? `${t.slice(0, 36)}…` : t;
  }
  if (typeof c.url === "string" && c.url.trim()) return c.url.trim().split("/").pop() ?? "media";
  const label = PICKER_ITEMS.find((i) => i.type === n.type);
  return label ? `${label.emoji} ${label.label}` : `${n.type} · ${n.id.slice(0, 8)}`;
}

function toNodes(
  detail: ChatbotFlowDetail,
  callbacks: { onAddNext: (id: string) => void; onSelect: (id: string) => void },
): Node[] {
  return detail.nodes.map((n) => {
    const p = n.position as { x?: unknown; y?: unknown };
    const x = typeof p?.x === "number" ? p.x : 0;
    const y = typeof p?.y === "number" ? p.y : 0;
    return {
      id: n.id,
      type: "chatbot",
      position: { x, y },
      data: {
        kind: n.type,
        label: nodeLabel(n),
        onAddNext: callbacks.onAddNext,
        onSelect: callbacks.onSelect,
      },
    };
  });
}

function toEdges(detail: ChatbotFlowDetail): Edge[] {
  return detail.edges.map((e) => ({
    id: e.id,
    source: e.fromNodeId,
    target: e.toNodeId,
    animated: true,
    style: { strokeWidth: 2 },
  }));
}

function FlowCanvasInner({
  flowId,
  detail,
}: {
  flowId: string;
  detail: ChatbotFlowDetail;
}) {
  const queryClient = useQueryClient();
  const rf = useReactFlow();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Picker state ──────────────────────────────────────────────────────────
  const [picker, setPicker] = useState<{
    screenX: number; screenY: number;
    flowX: number; flowY: number;
    sourceNodeId: string;
  } | null>(null);

  // ── Inline edit panel state ────────────────────────────────────────────────
  const [selectedEditNodeId, setSelectedEditNodeId] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const selectedEditNodeIdRef = useRef<string | null>(null);

  // Keep ref in sync so the viewport-change callback can read the latest value
  useEffect(() => { selectedEditNodeIdRef.current = selectedEditNodeId; }, [selectedEditNodeId]);

  // ── Compute panel screen position from flow position ──────────────────────
  const computePanelPos = useCallback((nodeId: string): { x: number; y: number } | null => {
    const rfNode = rf.getNode(nodeId);
    if (!rfNode) return null;
    const w = rfNode.measured?.width ?? 180;
    const rightEdge = rf.flowToScreenPosition({ x: rfNode.position.x + w, y: rfNode.position.y });
    const GAP = 12;
    let x = rightEdge.x + GAP;
    // If panel would overflow right, place on the left
    if (x + PANEL_W > window.innerWidth - 8) {
      const leftEdge = rf.flowToScreenPosition({ x: rfNode.position.x, y: rfNode.position.y });
      x = Math.max(8, leftEdge.x - PANEL_W - GAP);
    }
    let y = rightEdge.y;
    if (y + 440 > window.innerHeight - 8) y = Math.max(8, window.innerHeight - 448);
    return { x, y };
  }, [rf]);

  // Reposition panel when canvas pans or zooms
  useOnViewportChange({
    onChange: useCallback(() => {
      const nodeId = selectedEditNodeIdRef.current;
      if (!nodeId) return;
      setPanelPos(computePanelPos(nodeId));
    }, [computePanelPos]),
  });

  // Close panel if the selected node is deleted externally
  useEffect(() => {
    if (selectedEditNodeId && !detail.nodes.find((n) => n.id === selectedEditNodeId)) {
      setSelectedEditNodeId(null);
      setPanelPos(null);
    }
  }, [detail.nodes, selectedEditNodeId]);

  // ── Node callbacks ────────────────────────────────────────────────────────
  const handleAddNext = useCallback((sourceNodeId: string) => {
    const sourceNode = rf.getNode(sourceNodeId);
    if (!sourceNode) return;
    const screen = rf.flowToScreenPosition({
      x: sourceNode.position.x + (sourceNode.measured?.width ?? 180) / 2,
      y: sourceNode.position.y + (sourceNode.measured?.height ?? 80) + 12,
    });
    setPicker({
      screenX: screen.x,
      screenY: screen.y + 24,
      flowX: sourceNode.position.x,
      flowY: sourceNode.position.y + (sourceNode.measured?.height ?? 80) + 120,
      sourceNodeId,
    });
  }, [rf]);

  const handleNodeSelect = useCallback((nodeId: string) => {
    const pos = computePanelPos(nodeId);
    setSelectedEditNodeId(nodeId);
    setPanelPos(pos);
  }, [computePanelPos]);

  const closePanelOnPaneClick = useCallback(() => {
    setSelectedEditNodeId(null);
    setPanelPos(null);
  }, []);

  const callbacks = useMemo(
    () => ({ onAddNext: handleAddNext, onSelect: handleNodeSelect }),
    [handleAddNext, handleNodeSelect],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(toNodes(detail, callbacks));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toEdges(detail));

  const defaultEdgeOptions = useMemo(() => ({ animated: true, style: { strokeWidth: 2 } }), []);

  useEffect(() => {
    setNodes(toNodes(detail, callbacks));
    setEdges(toEdges(detail));
  }, [detail, setNodes, setEdges, callbacks]);

  // ── Auto-save geometry on drag ────────────────────────────────────────────
  const flushGeometry = useCallback(async () => {
    const n = rf.getNodes();
    try {
      await api.put(`/chatbot/flows/${flowId}/geometry`, {
        nodes: n.map((node) => ({ id: node.id, position: node.position })),
      });
    } catch (e) { toast.error("Could not save layout", getApiErrorMessage(e)); }
  }, [flowId, rf]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushGeometry(); }, 450);
  }, [flushGeometry]);

  // ── Connect edge ──────────────────────────────────────────────────────────
  const onConnect = useCallback(async (c: Connection) => {
    if (!c.source || !c.target) return;
    try {
      const { data } = await api.post<{ id: string; fromNodeId: string; toNodeId: string }>(
        `/chatbot/flows/${flowId}/edges`,
        { fromNodeId: c.source, toNodeId: c.target },
      );
      setEdges((eds) => addEdge({
        id: data.id, source: data.fromNodeId, target: data.toNodeId,
        animated: true, style: { strokeWidth: 2 },
      }, eds));
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
    } catch (e) { toast.error("Could not connect nodes", getApiErrorMessage(e)); }
  }, [flowId, queryClient, setEdges]);

  // ── Drag-from-handle → release on empty canvas → show picker ─────────────
  const onConnectEnd = useCallback((
    event: MouseEvent | TouchEvent,
    connectionState: FinalConnectionState,
  ) => {
    if (!connectionState.isValid && connectionState.fromNode) {
      const clientX = "clientX" in event ? event.clientX : event.changedTouches[0].clientX;
      const clientY = "clientY" in event ? event.clientY : event.changedTouches[0].clientY;
      const flowPos = rf.screenToFlowPosition({ x: clientX, y: clientY });
      setPicker({
        screenX: clientX,
        screenY: clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
        sourceNodeId: connectionState.fromNode.id,
      });
    }
  }, [rf]);

  // ── Create node from picker selection ─────────────────────────────────────
  const handlePickerSelect = useCallback(async (type: ChatbotNodeType) => {
    if (!picker) return;
    try {
      const { data: newNode } = await api.post<{ id: string }>(`/chatbot/flows/${flowId}/nodes`, {
        type,
        content: defaultContent(type),
        position: { x: picker.flowX - 90, y: picker.flowY },
      });
      const { data: newEdge } = await api.post<{ id: string; fromNodeId: string; toNodeId: string }>(
        `/chatbot/flows/${flowId}/edges`,
        { fromNodeId: picker.sourceNodeId, toNodeId: newNode.id },
      );
      setEdges((eds) => addEdge({
        id: newEdge.id, source: newEdge.fromNodeId, target: newEdge.toNodeId,
        animated: true, style: { strokeWidth: 2 },
      }, eds));
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
      toast.success(`${defaultLabel(type)} node added`);
      // Open the edit panel on the new node (after detail refetches, computed on next render)
      setSelectedEditNodeId(newNode.id);
    } catch (e) {
      toast.error("Could not add node", getApiErrorMessage(e));
    }
  }, [picker, flowId, queryClient, setEdges]);

  // After a new node is created via picker, compute its panel position once detail refreshes
  useEffect(() => {
    if (!selectedEditNodeId) return;
    const pos = computePanelPos(selectedEditNodeId);
    if (pos) setPanelPos(pos);
    // Retry after a tick in case measured size isn't available yet
    const t = setTimeout(() => {
      const p = computePanelPos(selectedEditNodeId);
      if (p) setPanelPos(p);
    }, 120);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEditNodeId, detail.nodes]);

  // ── Delete handlers ───────────────────────────────────────────────────────
  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    for (const e of deleted) {
      try { await api.delete(`/chatbot/flows/${flowId}/edges/${e.id}`); }
      catch (err) { toast.error("Could not remove edge", getApiErrorMessage(err)); }
    }
    void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
  }, [flowId, queryClient]);

  const onNodesDelete = useCallback(async (deleted: Node[]) => {
    for (const n of deleted) {
      try { await api.delete(`/chatbot/flows/${flowId}/nodes/${n.id}`); }
      catch (err) { toast.error("Could not remove node", getApiErrorMessage(err)); }
    }
    void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
  }, [flowId, queryClient]);

  // Resolve edit node from current detail
  const editNode = selectedEditNodeId
    ? detail.nodes.find((n) => n.id === selectedEditNodeId) ?? null
    : null;

  return (
    <>
      <div className="h-[min(520px,55vh)] w-full min-h-[360px] overflow-hidden rounded-xl border border-border/60 bg-muted/20 shadow-md">
        <ReactFlow
          nodeTypes={nodeTypes}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(c) => void onConnect(c)}
          onConnectEnd={(e, s) => void onConnectEnd(e, s as FinalConnectionState)}
          onNodeDragStop={scheduleSave}
          onNodesDelete={(ns) => void onNodesDelete(ns)}
          onEdgesDelete={(es) => void onEdgesDelete(es)}
          onPaneClick={closePanelOnPaneClick}
          defaultEdgeOptions={defaultEdgeOptions}
          snapToGrid
          snapGrid={[16, 16]}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          deleteKeyCode={["Backspace", "Delete"]}
          className="rounded-xl"
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} className="opacity-40" />
          <Controls className="rounded-xl border border-border/60 shadow-md" />
          <MiniMap
            className="!rounded-xl !border !border-border/60 !bg-muted/80 !shadow-md"
            maskColor="rgb(0 0 0 / 10%)"
          />
        </ReactFlow>
      </div>

      {picker && (
        <NodePicker
          x={picker.screenX}
          y={picker.screenY}
          onSelect={(type) => void handlePickerSelect(type)}
          onClose={() => setPicker(null)}
        />
      )}

      {editNode && panelPos && (
        <NodeEditPanel
          node={editNode}
          flowId={flowId}
          entryNodeId={detail.entryNodeId}
          x={panelPos.x}
          y={panelPos.y}
          onClose={() => { setSelectedEditNodeId(null); setPanelPos(null); }}
          onUpdated={() => {
            void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
            void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
          }}
          onDeleted={() => {
            setSelectedEditNodeId(null);
            setPanelPos(null);
            void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
            void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
          }}
        />
      )}
    </>
  );
}

export function FlowCanvas({
  flowId,
  detail,
}: {
  flowId: string;
  detail: ChatbotFlowDetail;
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner flowId={flowId} detail={detail} />
    </ReactFlowProvider>
  );
}
