"use client";

import "@xyflow/react/dist/style.css";

import { ChatbotFlowNode } from "@/components/chatbot/chatbot-flow-node";
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
  useReactFlow,
} from "@xyflow/react";
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

// ─── Picker overlay (portal-rendered) ────────────────────────────────────────

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

  // Clamp to viewport
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
  onNodeSelect,
}: {
  flowId: string;
  detail: ChatbotFlowDetail;
  onNodeSelect?: (nodeId: string) => void;
}) {
  const queryClient = useQueryClient();
  const rf = useReactFlow();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Picker state: shown after dragging from a handle to empty space, or clicking "+"
  const [picker, setPicker] = useState<{
    screenX: number; screenY: number;
    flowX: number; flowY: number;
    sourceNodeId: string;
  } | null>(null);

  // ── Callbacks passed into node data ──────────────────────────────────────
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
    onNodeSelect?.(nodeId);
  }, [onNodeSelect]);

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
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
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

  // ── Create node from picker selection ────────────────────────────────────
  const handlePickerSelect = useCallback(async (type: ChatbotNodeType) => {
    if (!picker) return;
    try {
      const { data: newNode } = await api.post<{ id: string }>(`/chatbot/flows/${flowId}/nodes`, {
        type,
        content: defaultContent(type),
        position: { x: picker.flowX - 90, y: picker.flowY },
      });
      // Connect source → new node
      const { data: newEdge } = await api.post<{ id: string; fromNodeId: string; toNodeId: string }>(
        `/chatbot/flows/${flowId}/edges`,
        { fromNodeId: picker.sourceNodeId, toNodeId: newNode.id },
      );
      setEdges((eds) => addEdge({
        id: newEdge.id, source: newEdge.fromNodeId, target: newEdge.toNodeId,
        animated: true, style: { strokeWidth: 2 },
      }, eds));
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      // Select the new node so the user can configure it
      onNodeSelect?.(newNode.id);
      toast.success(`${defaultLabel(type)} node added`);
    } catch (e) {
      toast.error("Could not add node", getApiErrorMessage(e));
    }
  }, [picker, flowId, queryClient, setEdges, onNodeSelect]);

  // ── Delete handlers ───────────────────────────────────────────────────────
  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    for (const e of deleted) {
      try { await api.delete(`/chatbot/flows/${flowId}/edges/${e.id}`); }
      catch (err) { toast.error("Could not remove edge", getApiErrorMessage(err)); }
    }
    void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
    void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
  }, [flowId, queryClient]);

  const onNodesDelete = useCallback(async (deleted: Node[]) => {
    for (const n of deleted) {
      try { await api.delete(`/chatbot/flows/${flowId}/nodes/${n.id}`); }
      catch (err) { toast.error("Could not remove node", getApiErrorMessage(err)); }
    }
    void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
    void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
  }, [flowId, queryClient]);

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
    </>
  );
}

export function FlowCanvas(props: {
  flowId: string;
  detail: ChatbotFlowDetail;
  onNodeSelect?: (nodeId: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
