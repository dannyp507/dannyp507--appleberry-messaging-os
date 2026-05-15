"use client";

import "@xyflow/react/dist/style.css";

import { FbFlowNode, type FbFlowNodeData } from "@/components/fb-flow/fb-flow-node";
import { NodeConfigForm } from "@/components/chatbot/node-config-form";
import { buildContent, flattenContent } from "@/components/chatbot/node-config";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { ChatbotFlowDetail, ChatbotNodeType } from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import {
  addEdge as rfAddEdge,
  Background,
  BackgroundVariant,
  Controls,
  type Connection,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import {
  MessageCircle,
  Image as ImageIcon,
  MousePointerClick,
  Zap,
  GitBranch,
  Sparkles,
  UserCheck,
  CircleStop,
  HelpCircle,
  X,
  ChevronRight,
  Loader2,
  Check,
  Play,
  Pause,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// ─── Sidebar block types ──────────────────────────────────────────────────────

const SIDEBAR_BLOCKS: {
  type: ChatbotNodeType;
  icon: React.ElementType;
  label: string;
  desc: string;
  color: string;
  iconColor: string;
}[] = [
  {
    type: "TEXT",
    icon: MessageCircle,
    label: "Text Message",
    desc: "Send a text reply",
    color: "hover:bg-indigo-50 border-indigo-100",
    iconColor: "text-indigo-500 bg-indigo-50",
  },
  {
    type: "MEDIA",
    icon: ImageIcon,
    label: "Image / Media",
    desc: "Send image or video",
    color: "hover:bg-sky-50 border-sky-100",
    iconColor: "text-sky-500 bg-sky-50",
  },
  {
    type: "BUTTONS",
    icon: MousePointerClick,
    label: "Button Template",
    desc: "Tappable reply buttons",
    color: "hover:bg-purple-50 border-purple-100",
    iconColor: "text-purple-500 bg-purple-50",
  },
  {
    type: "QUESTION",
    icon: HelpCircle,
    label: "Ask Question",
    desc: "Capture user input",
    color: "hover:bg-amber-50 border-amber-100",
    iconColor: "text-amber-500 bg-amber-50",
  },
  {
    type: "CONDITION",
    icon: GitBranch,
    label: "Condition",
    desc: "Branch on a variable",
    color: "hover:bg-orange-50 border-orange-100",
    iconColor: "text-orange-500 bg-orange-50",
  },
  {
    type: "AI_REPLY",
    icon: Sparkles,
    label: "AI Reply",
    desc: "AI-generated response",
    color: "hover:bg-violet-50 border-violet-100",
    iconColor: "text-violet-500 bg-violet-50",
  },
  {
    type: "HUMAN_HANDOFF",
    icon: UserCheck,
    label: "Human Handoff",
    desc: "Transfer to an agent",
    color: "hover:bg-teal-50 border-teal-100",
    iconColor: "text-teal-500 bg-teal-50",
  },
  {
    type: "END",
    icon: CircleStop,
    label: "End Flow",
    desc: "Terminate the conversation",
    color: "hover:bg-red-50 border-red-100",
    iconColor: "text-red-500 bg-red-50",
  },
];

const NODE_TYPES = { fbFlowNode: FbFlowNode };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nodeLabel(type: ChatbotNodeType, content: Record<string, unknown>): string {
  switch (type) {
    case "TEXT":        return (content.text as string) || "";
    case "MEDIA":       return (content.caption as string) || (content.url as string) || "";
    case "BUTTONS":     return (content.prompt as string) || "";
    case "QUESTION":    return (content.prompt as string) || "";
    case "CONDITION":   return (content.variableKey as string) || "lastInput";
    case "AI_REPLY":    return (content.systemPrompt as string) || "AI generates reply";
    case "HUMAN_HANDOFF": return (content.message as string) || "Transferring to agent…";
    case "END":         return (content.message as string) || "Conversation ended";
    default:            return "";
  }
}

function nodeButtons(
  type: ChatbotNodeType,
  content: Record<string, unknown>,
): Array<{ id: string; label: string }> | undefined {
  if (type !== "BUTTONS") return undefined;
  const btns = (content.buttons ?? []) as Array<{ id: string; label: string }>;
  return btns.length > 0 ? btns : undefined;
}

// ─── Inner builder (needs ReactFlow context) ──────────────────────────────────

function FbFlowBuilderInner({
  flow,
  facebookPageId,
}: {
  flow: ChatbotFlowDetail;
  facebookPageId: string;
}) {
  const queryClient = useQueryClient();
  const { screenToFlowPosition } = useReactFlow();

  // ── Node / edge state ────────────────────────────────────────────────────
  const initialNodes = useMemo<Node[]>(
    () =>
      flow.nodes.map((n) => ({
        id: n.id,
        type: "fbFlowNode",
        position: n.position as { x: number; y: number },
        data: {
          kind: n.type,
          label: nodeLabel(n.type, n.content as Record<string, unknown>),
          isEntry: n.id === flow.entryNodeId,
          buttons: nodeButtons(n.type, n.content as Record<string, unknown>),
          content: n.content as Record<string, unknown>,
        } satisfies FbFlowNodeData,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const initialEdges = useMemo<Edge[]>(
    () =>
      flow.edges.map((e) => ({
        id: e.id,
        source: e.fromNodeId,
        target: e.toNodeId,
        sourceHandle: (e.condition as { handleId?: string } | null)?.handleId ?? undefined,
        label:
          (e.condition as { handleId?: string; label?: string } | null)?.label ?? undefined,
        style: { stroke: "#94a3b8", strokeWidth: 2 },
        labelStyle: { fill: "#94a3b8", fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "#1e293b", fillOpacity: 0.9 },
        labelBgPadding: [4, 3],
        labelBgBorderRadius: 4,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // ── Selected node edit panel ─────────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editConfig, setEditConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  // Derive type+content from local node data — works for both existing and newly added nodes
  const selectedNodeData = selectedNode?.data as FbFlowNodeData | undefined;

  // Populate edit config whenever selection changes
  useEffect(() => {
    if (!selectedNodeData) { setEditConfig({}); return; }
    setEditConfig(
      flattenContent(
        selectedNodeData.kind as ChatbotNodeType,
        selectedNodeData.content ?? {},
      ),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  // Inject onSelect callback into every node's data
  const nodesWithCallback = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onSelect: (nid: string) => setSelectedNodeId((prev) => (prev === nid ? null : nid)),
        },
      })),
    [nodes],
  );

  // ── Connect handler ──────────────────────────────────────────────────────
  const onConnect = useCallback(
    async (connection: Connection) => {
      const handleId = connection.sourceHandle ?? null;
      // Determine label for condition handles
      let label: string | undefined;
      if (handleId === "yes") label = "YES";
      if (handleId === "no")  label = "NO";
      const srcNode = nodes.find((n) => n.id === connection.source);
      if (srcNode?.data.kind === "BUTTONS" && handleId) {
        const btns = (srcNode.data as FbFlowNodeData).buttons ?? [];
        const btn = btns.find((b) => b.id === handleId);
        if (btn) label = btn.label;
      }

      try {
        const { data: edge } = await api.post(
          `/chatbot/flows/${flow.id}/edges`,
          {
            fromNodeId: connection.source,
            toNodeId: connection.target,
            condition: handleId
              ? { handleId, ...(label ? { label } : {}) }
              : undefined,
          },
        );
        setEdges((eds) =>
          rfAddEdge(
            {
              id: edge.id,
              source: connection.source!,
              target: connection.target!,
              sourceHandle: handleId ?? undefined,
              label,
              style: { stroke: "#94a3b8", strokeWidth: 2 },
              labelStyle: { fill: "#94a3b8", fontSize: 10, fontWeight: 600 },
              labelBgStyle: { fill: "#1e293b", fillOpacity: 0.9 },
              labelBgPadding: [4, 3],
              labelBgBorderRadius: 4,
            },
            eds,
          ),
        );
        queryClient.invalidateQueries({ queryKey: qk.fbPageFlows(facebookPageId) });
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      }
    },
    [flow.id, facebookPageId, nodes, queryClient, setEdges],
  );

  // ── Delete edge on click ─────────────────────────────────────────────────
  const onEdgeClick = useCallback(
    async (_: React.MouseEvent, edge: Edge) => {
      if (!confirm("Remove this connection?")) return;
      try {
        await api.delete(`/chatbot/flows/${flow.id}/edges/${edge.id}`);
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
        queryClient.invalidateQueries({ queryKey: qk.fbPageFlows(facebookPageId) });
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      }
    },
    [flow.id, facebookPageId, queryClient, setEdges],
  );

  // ── Delete node on keyboard ──────────────────────────────────────────────
  const onKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
        const activeTag = (document.activeElement as HTMLElement)?.tagName;
        if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;
        if (!confirm("Delete this node?")) return;
        try {
          await api.delete(`/chatbot/flows/${flow.id}/nodes/${selectedNodeId}`);
          setNodes((ns) => ns.filter((n) => n.id !== selectedNodeId));
          setEdges((es) =>
            es.filter(
              (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
            ),
          );
          setSelectedNodeId(null);
          queryClient.invalidateQueries({ queryKey: qk.fbPageFlows(facebookPageId) });
        } catch (err) {
          toast.error(getApiErrorMessage(err));
        }
      }
    },
    [selectedNodeId, flow.id, facebookPageId, queryClient, setNodes, setEdges],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  // ── Save geometry on node drag stop ─────────────────────────────────────
  const onNodeDragStop = useCallback(
    async (_: React.MouseEvent, _node: Node, ns: Node[]) => {
      try {
        await api.put(`/chatbot/flows/${flow.id}/geometry`, {
          nodes: ns.map((n) => ({ id: n.id, position: n.position })),
        });
      } catch {
        // silent — geometry save is best-effort
      }
    },
    [flow.id],
  );

  // ── Add node from sidebar ────────────────────────────────────────────────
  const addNode = useCallback(
    async (type: ChatbotNodeType, position?: { x: number; y: number }) => {
      const pos = position ?? { x: 300 + Math.random() * 100, y: 200 + Math.random() * 80 };
      try {
        const { data: node } = await api.post(`/chatbot/flows/${flow.id}/nodes`, {
          type,
          content: {},
          position: pos,
        });
        setNodes((ns) => [
          ...ns,
          {
            id: node.id,
            type: "fbFlowNode",
            position: pos,
            data: {
              kind: type,
              label: "",
              isEntry: false,
              content: {},
            } satisfies FbFlowNodeData,
          },
        ]);
        setSelectedNodeId(node.id);
        queryClient.invalidateQueries({ queryKey: qk.fbPageFlows(facebookPageId) });
        // Auto-set entry node if this is the first node
        if (nodes.length === 0) {
          await api.patch(`/chatbot/flows/${flow.id}/entry`, { entryNodeId: node.id });
        }
      } catch (err) {
        toast.error(getApiErrorMessage(err));
      }
    },
    [flow.id, facebookPageId, nodes.length, queryClient, setNodes],
  );

  // ── Drag from sidebar → drop on canvas ──────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("nodeType") as ChatbotNodeType;
      if (!type) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(type, pos);
    },
    [addNode, screenToFlowPosition],
  );

  // ── Save node content ────────────────────────────────────────────────────
  const saveNodeContent = useCallback(async () => {
    if (!selectedNodeId || !selectedNodeData) return;
    setSaving(true);
    try {
      const nodeType = selectedNodeData.kind as ChatbotNodeType;
      const content = buildContent(nodeType, editConfig);
      await api.patch(`/chatbot/flows/${flow.id}/nodes/${selectedNodeId}`, { content });

      // Update node visually + store content locally so re-selecting still works
      const buttons = nodeButtons(nodeType, content);
      setNodes((ns) =>
        ns.map((n) =>
          n.id === selectedNodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  label: nodeLabel(nodeType, content),
                  buttons,
                  content,
                },
              }
            : n,
        ),
      );
      queryClient.invalidateQueries({ queryKey: qk.fbPageFlows(facebookPageId) });
      toast.success("Node saved");
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [selectedNodeId, selectedNodeData, editConfig, flow.id, facebookPageId, queryClient, setNodes]);

  // ── Set entry node ───────────────────────────────────────────────────────
  const setEntryNode = useCallback(async (nodeId: string) => {
    try {
      await api.patch(`/chatbot/flows/${flow.id}/entry`, { entryNodeId: nodeId });
      setNodes((ns) =>
        ns.map((n) => ({ ...n, data: { ...n.data, isEntry: n.id === nodeId } })),
      );
      queryClient.invalidateQueries({ queryKey: qk.fbPageFlows(facebookPageId) });
      toast.success("Entry node set");
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  }, [flow.id, facebookPageId, queryClient, setNodes]);

  // ── Toggle flow status ───────────────────────────────────────────────────
  const toggleStatus = useCallback(async () => {
    setActivating(true);
    const newStatus = flow.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    try {
      await api.patch(`/chatbot/flows/${flow.id}/status`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: qk.fbPageFlows(facebookPageId) });
      toast.success(newStatus === "ACTIVE" ? "Flow activated!" : "Flow deactivated");
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setActivating(false);
    }
  }, [flow.id, flow.status, facebookPageId, queryClient]);

  return (
    <div className="flex h-full">
      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 bg-white border-r border-zinc-200 flex flex-col overflow-y-auto">
        <div className="px-3 py-3 border-b border-zinc-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            Blocks
          </p>
          <p className="text-[10px] text-zinc-400 mt-0.5">Click or drag onto canvas</p>
        </div>
        <div className="p-2 flex flex-col gap-1.5">
          {SIDEBAR_BLOCKS.map((block) => {
            const Icon = block.icon;
            return (
              <button
                key={block.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("nodeType", block.type);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => addNode(block.type)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-2 text-left border transition-all cursor-grab active:cursor-grabbing",
                  "hover:shadow-sm",
                  block.color,
                )}
              >
                <span className={cn("p-1 rounded-md shrink-0", block.iconColor)}>
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-800 leading-tight">
                    {block.label}
                  </p>
                  <p className="text-[10px] text-zinc-400 leading-tight truncate">{block.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Status toggle at bottom */}
        <div className="mt-auto p-3 border-t border-zinc-100">
          <button
            onClick={toggleStatus}
            disabled={activating}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all",
              flow.status === "ACTIVE"
                ? "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100",
            )}
          >
            {activating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : flow.status === "ACTIVE" ? (
              <Pause className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
            {flow.status === "ACTIVE" ? "Deactivate" : "Activate Flow"}
          </button>
          <p className="text-center text-[10px] text-zinc-400 mt-1">
            Status:{" "}
            <span
              className={
                flow.status === "ACTIVE" ? "text-emerald-600 font-semibold" : "text-zinc-500"
              }
            >
              {flow.status}
            </span>
          </p>
        </div>
      </aside>

      {/* ── Canvas ────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative bg-[#0f1117]" onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodesWithCallback}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          deleteKeyCode={null}
          className="!bg-transparent"
          defaultEdgeOptions={{
            style: { stroke: "#94a3b8", strokeWidth: 2 },
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="#2a2f3a"
            gap={20}
            size={1.5}
          />
          <Controls
            className="!bg-zinc-800 !border-zinc-700 [&_button]:!bg-zinc-800 [&_button]:!border-zinc-700 [&_button]:!text-zinc-300 [&_button:hover]:!bg-zinc-700"
          />
        </ReactFlow>

        {/* Empty state hint */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-zinc-500 text-sm font-medium">Canvas is empty</p>
              <p className="text-zinc-600 text-xs mt-1">
                Click a block in the sidebar or drag it here to start
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Right node edit panel ──────────────────────────────────────────── */}
      {selectedNode && selectedNodeData && (
        <aside className="w-72 shrink-0 bg-white border-l border-zinc-200 flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
            <div>
              <p className="text-xs font-bold text-zinc-800">Edit Node</p>
              <p className="text-[10px] text-zinc-400 mt-0.5 capitalize">
                {selectedNodeData.kind.replace(/_/g, " ").toLowerCase()}
              </p>
            </div>
            <button
              onClick={() => setSelectedNodeId(null)}
              className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Form */}
          <div className="flex-1 p-4 overflow-y-auto">
            <NodeConfigForm
              nodeType={selectedNodeData.kind as ChatbotNodeType}
              config={editConfig}
              onChange={(key, value) =>
                setEditConfig((prev) => ({ ...prev, [key]: value }))
              }
            />
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-zinc-100 space-y-2">
            <button
              onClick={saveNodeContent}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Save Node
            </button>

            {selectedNode.id !== flow.entryNodeId && (
              <button
                onClick={() => setEntryNode(selectedNode.id)}
                className="w-full flex items-center justify-center gap-2 border border-zinc-200 hover:bg-zinc-50 text-zinc-600 rounded-lg px-4 py-2 text-xs font-medium transition-all"
              >
                <ChevronRight className="size-3.5" />
                Set as Entry Node
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

// ─── Public wrapper (provides ReactFlow context) ──────────────────────────────

export function FbFlowBuilder({
  flow,
  facebookPageId,
}: {
  flow: ChatbotFlowDetail;
  facebookPageId: string;
}) {
  return (
    <ReactFlowProvider>
      <FbFlowBuilderInner flow={flow} facebookPageId={facebookPageId} />
    </ReactFlowProvider>
  );
}
