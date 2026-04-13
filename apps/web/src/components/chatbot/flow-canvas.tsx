"use client";

import "@xyflow/react/dist/style.css";

import { ChatbotFlowNode } from "@/components/chatbot/chatbot-flow-node";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { ChatbotFlowDetail } from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import {
  addEdge,
  Background,
  Controls,
  type Connection,
  type Edge,
  type Node,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

const nodeTypes = { chatbot: ChatbotFlowNode };

function nodeLabel(n: ChatbotFlowDetail["nodes"][0]): string {
  const c = n.content as Record<string, unknown>;
  if (typeof c.text === "string" && c.text.trim()) {
    const t = c.text.trim();
    return t.length > 32 ? `${t.slice(0, 32)}…` : t;
  }
  return `${n.type} · ${n.id.slice(0, 8)}`;
}

function toNodes(detail: ChatbotFlowDetail): Node[] {
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
  const [nodes, setNodes, onNodesChange] = useNodesState(toNodes(detail));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toEdges(detail));
  const rf = useReactFlow();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const defaultEdgeOptions = useMemo(
    () => ({
      animated: true,
      style: { strokeWidth: 2 },
    }),
    [],
  );

  useEffect(() => {
    setNodes(toNodes(detail));
    setEdges(toEdges(detail));
  }, [detail, setNodes, setEdges]);

  const flushGeometry = useCallback(async () => {
    const n = rf.getNodes();
    try {
      await api.put(`/chatbot/flows/${flowId}/geometry`, {
        nodes: n.map((node) => ({
          id: node.id,
          position: node.position,
        })),
      });
    } catch (e) {
      toast.error("Could not save layout", getApiErrorMessage(e));
    }
  }, [flowId, rf]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushGeometry();
    }, 450);
  }, [flushGeometry]);

  const onNodeDragStop = useCallback(() => {
    scheduleSave();
  }, [scheduleSave]);

  const onConnect = useCallback(
    async (c: Connection) => {
      if (!c.source || !c.target) return;
      try {
        const { data } = await api.post<{
          id: string;
          fromNodeId: string;
          toNodeId: string;
        }>(`/chatbot/flows/${flowId}/edges`, {
          fromNodeId: c.source,
          toNodeId: c.target,
        });
        setEdges((eds) =>
          addEdge(
            {
              id: data.id,
              source: data.fromNodeId,
              target: data.toNodeId,
              animated: true,
              style: { strokeWidth: 2 },
            },
            eds,
          ),
        );
        void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
        void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
      } catch (e) {
        toast.error("Could not connect nodes", getApiErrorMessage(e));
      }
    },
    [flowId, queryClient, setEdges],
  );

  const onEdgesDelete = useCallback(
    async (deleted: Edge[]) => {
      for (const e of deleted) {
        try {
          await api.delete(`/chatbot/flows/${flowId}/edges/${e.id}`);
        } catch (err) {
          toast.error("Could not remove edge", getApiErrorMessage(err));
        }
      }
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
    },
    [flowId, queryClient],
  );

  const onNodesDelete = useCallback(
    async (deleted: Node[]) => {
      for (const n of deleted) {
        try {
          await api.delete(`/chatbot/flows/${flowId}/nodes/${n.id}`);
        } catch (err) {
          toast.error("Could not remove node", getApiErrorMessage(err));
        }
      }
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
      void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
    },
    [flowId, queryClient],
  );

  return (
    <div className="h-[min(520px,55vh)] w-full min-h-[360px] overflow-hidden rounded-xl border border-border/60 bg-muted/20 shadow-md">
      <ReactFlow
        nodeTypes={nodeTypes}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(c) => void onConnect(c)}
        onNodeDragStop={onNodeDragStop}
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
  );
}

export function FlowCanvas(props: {
  flowId: string;
  detail: ChatbotFlowDetail;
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
