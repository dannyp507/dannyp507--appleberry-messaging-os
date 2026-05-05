"use client";

import { NodeConfigForm } from "@/components/chatbot/node-config-form";
import { buildContent, flattenContent } from "@/components/chatbot/node-config";
import { api, getApiErrorMessage } from "@/lib/api/client";
import type { ChatbotFlowDetail, ChatbotNodeType } from "@/lib/api/types";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";

// ─── Node type display info ───────────────────────────────────────────────────

const NODE_INFO: Record<string, { emoji: string; label: string }> = {
  TEXT:           { emoji: "💬", label: "Send message"       },
  MEDIA:          { emoji: "🖼️", label: "Send media"         },
  BUTTONS:        { emoji: "🔘", label: "Show buttons"       },
  LIST:           { emoji: "📋", label: "Show list"          },
  QUESTION:       { emoji: "❓", label: "Ask question"       },
  CONDITION:      { emoji: "🔀", label: "Check condition"    },
  AI_REPLY:       { emoji: "✨", label: "AI reply"           },
  TAG_CONTACT:    { emoji: "🏷️", label: "Tag contact"       },
  SAVE_TO_SHEET:  { emoji: "📊", label: "Save to sheet"      },
  HUMAN_HANDOFF:  { emoji: "👤", label: "Handoff to human"  },
  END:            { emoji: "🔴", label: "End flow"           },
  CHECK_CALENDAR: { emoji: "📅", label: "Check availability" },
  CREATE_BOOKING: { emoji: "🗓️", label: "Create booking"    },
  WEBHOOK:        { emoji: "🔗", label: "Webhook"            },
};

// ─── Step types for the "Add step" picker ────────────────────────────────────

const STEP_TYPES: { type: ChatbotNodeType; emoji: string; label: string }[] = [
  { type: "TEXT",          emoji: "💬", label: "Send message"     },
  { type: "MEDIA",         emoji: "🖼️", label: "Send media"       },
  { type: "BUTTONS",       emoji: "🔘", label: "Show buttons"     },
  { type: "LIST",          emoji: "📋", label: "Show list"        },
  { type: "QUESTION",      emoji: "❓", label: "Ask question"     },
  { type: "CONDITION",     emoji: "🔀", label: "Check condition"  },
  { type: "AI_REPLY",      emoji: "✨", label: "AI reply"         },
  { type: "TAG_CONTACT",   emoji: "🏷️", label: "Tag contact"     },
  { type: "HUMAN_HANDOFF", emoji: "👤", label: "Handoff to human"},
  { type: "END",           emoji: "🔴", label: "End flow"         },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPreview(nodeType: string, content: Record<string, unknown>): string {
  const main = content.text ?? content.prompt ?? content.message ?? content.systemPrompt ?? content.tagName ?? content.url;
  if (typeof main === "string" && main.trim()) {
    const t = main.trim();
    return t.length > 64 ? `${t.slice(0, 64)}…` : t;
  }
  if (nodeType === "BUTTONS") {
    const btns = content.buttons as { label: string }[] | undefined;
    if (btns?.length) return btns.map((b) => b.label).join("  ·  ");
  }
  if (nodeType === "LIST") {
    const secs = content.sections as { rows?: { title: string }[] }[] | undefined;
    const rows = secs?.[0]?.rows ?? [];
    if (rows.length) return rows.map((r) => r.title).join("  ·  ");
  }
  return "";
}

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

// ─── Step list component ──────────────────────────────────────────────────────

export function StepList({
  flowId,
  detail,
}: {
  flowId: string;
  detail: ChatbotFlowDetail;
}) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.chatbotFlow(flowId) });
    void queryClient.invalidateQueries({ queryKey: qk.chatbotFlows });
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [adding, setAdding] = useState(false);

  // Sort nodes by position.y to determine display / execution order
  const steps = [...detail.nodes].sort((a, b) => {
    const ay = (a.position as { y?: number })?.y ?? 0;
    const by = (b.position as { y?: number })?.y ?? 0;
    return ay - by;
  });

  // ── Edit ────────────────────────────────────────────────────────────────────
  const openEdit = (nodeId: string, nodeType: string, content: Record<string, unknown>) => {
    // Always re-initialise from server content when opening
    setConfigs((prev) => ({
      ...prev,
      [nodeId]: flattenContent(nodeType as ChatbotNodeType, content),
    }));
    setEditingId(nodeId);
  };

  const closeEdit = () => setEditingId(null);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async (nodeId: string, nodeType: string) => {
    setSaving(nodeId);
    try {
      await api.patch(`/chatbot/flows/${flowId}/nodes/${nodeId}`, {
        content: buildContent(nodeType as ChatbotNodeType, configs[nodeId] ?? {}),
      });
      refresh();
      setEditingId(null);
      toast.success("Step saved");
    } catch (e) {
      toast.error("Could not save", getApiErrorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (nodeId: string) => {
    setDeleting(nodeId);
    try {
      await api.delete(`/chatbot/flows/${flowId}/nodes/${nodeId}`);
      refresh();
      if (editingId === nodeId) setEditingId(null);
      toast.success("Step removed");
    } catch (e) {
      toast.error("Could not remove step", getApiErrorMessage(e));
    } finally {
      setDeleting(null);
    }
  };

  // ── Reorder (swap position.y) ────────────────────────────────────────────────
  const swapPositions = async (indexA: number, indexB: number) => {
    const a = steps[indexA];
    const b = steps[indexB];
    const ap = a.position as { x: number; y: number };
    const bp = b.position as { x: number; y: number };
    try {
      await api.put(`/chatbot/flows/${flowId}/geometry`, {
        nodes: [
          { id: a.id, position: { x: ap.x ?? 80, y: bp.y ?? 0 } },
          { id: b.id, position: { x: bp.x ?? 80, y: ap.y ?? 0 } },
        ],
      });
      // Keep entry node = first step after swap
      const newFirst = indexA < indexB ? b.id : a.id;
      if (newFirst !== detail.entryNodeId) {
        // whichever ends up at index 0
        const firstAfterSwap = Math.min(indexA, indexB) === 0
          ? (indexA === 0 ? b.id : a.id)
          : null;
        if (firstAfterSwap) {
          await api.patch(`/chatbot/flows/${flowId}/entry`, { entryNodeId: firstAfterSwap }).catch(() => {});
        }
      }
      refresh();
    } catch (e) {
      toast.error("Could not reorder", getApiErrorMessage(e));
    }
  };

  // ── Add step ─────────────────────────────────────────────────────────────────
  const handleAddStep = async (type: ChatbotNodeType) => {
    setAdding(true);
    setShowPicker(false);
    try {
      const lastStep = steps[steps.length - 1];
      const lastY = lastStep ? ((lastStep.position as { y?: number })?.y ?? 0) : -150;

      const { data: newNode } = await api.post<{ id: string }>(`/chatbot/flows/${flowId}/nodes`, {
        type,
        content: defaultContent(type),
        position: { x: 80, y: lastY + 150 },
      });

      // Auto-connect from last step if it has no outgoing edges yet
      if (lastStep) {
        const hasOutgoing = detail.edges.some((e) => e.fromNodeId === lastStep.id);
        if (!hasOutgoing) {
          await api.post(`/chatbot/flows/${flowId}/edges`, {
            fromNodeId: lastStep.id,
            toNodeId: newNode.id,
          }).catch(() => {});
        }
      }

      // If first node ever, set as entry
      if (steps.length === 0) {
        await api.patch(`/chatbot/flows/${flowId}/entry`, { entryNodeId: newNode.id }).catch(() => {});
      }

      refresh();

      // Open the new step for editing immediately
      setConfigs((prev) => ({ ...prev, [newNode.id]: {} }));
      setEditingId(newNode.id);
    } catch (e) {
      toast.error("Could not add step", getApiErrorMessage(e));
    } finally {
      setAdding(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-1.5">

      {/* Empty state */}
      {steps.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border py-16 text-center">
          <p className="text-3xl mb-3">👋</p>
          <p className="text-sm font-semibold text-foreground">Your bot has no steps yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click <strong>Add step</strong> below to write your first message
          </p>
        </div>
      )}

      {/* Step cards */}
      {steps.map((node, index) => {
        const info = NODE_INFO[node.type] ?? { emoji: "🔧", label: node.type };
        const content = (node.content ?? {}) as Record<string, unknown>;
        const preview = getPreview(node.type, content);
        const isEditing = editingId === node.id;
        const isEntry = detail.entryNodeId === node.id;
        const isFirst = index === 0;
        const isLast = index === steps.length - 1;

        return (
          <div key={node.id}>
            <div
              className={`rounded-2xl border transition-all duration-150 ${
                isEditing
                  ? "border-primary/50 shadow-sm bg-card"
                  : "border-border/70 bg-card hover:border-border hover:shadow-sm"
              }`}
            >
              {/* ── Header row ── */}
              <div
                className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
                onClick={() => (isEditing ? closeEdit() : openEdit(node.id, node.type, content))}
              >
                {/* Step number badge */}
                <div
                  className={`shrink-0 size-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isEntry
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isEntry ? <Zap className="size-3.5" /> : index + 1}
                </div>

                {/* Emoji + label + preview */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{info.emoji}</span>
                    <span className="text-sm font-semibold text-foreground">{info.label}</span>
                  </div>
                  {preview && !isEditing && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate pl-[1.625rem]">
                      {preview}
                    </p>
                  )}
                </div>

                {/* Up / Down buttons */}
                <div
                  className="flex items-center gap-0.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    disabled={isFirst}
                    onClick={() => void swapPositions(index, index - 1)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 transition-colors"
                    title="Move up"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    disabled={isLast}
                    onClick={() => void swapPositions(index, index + 1)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-20 transition-colors"
                    title="Move down"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* ── Expanded edit body ── */}
              {isEditing && (
                <div className="border-t border-border/50 px-4 pt-4 pb-4 space-y-4">
                  <NodeConfigForm
                    nodeType={node.type as ChatbotNodeType}
                    config={configs[node.id] ?? {}}
                    onChange={(key, value) =>
                      setConfigs((prev) => ({
                        ...prev,
                        [node.id]: { ...(prev[node.id] ?? {}), [key]: value },
                      }))
                    }
                  />
                  <div className="flex items-center justify-between pt-1">
                    <button
                      disabled={deleting === node.id}
                      onClick={() => void handleDelete(node.id)}
                      className="flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/40 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="size-3" />
                      {deleting === node.id ? "Removing…" : "Remove step"}
                    </button>
                    <button
                      disabled={saving === node.id}
                      onClick={() => void handleSave(node.id, node.type)}
                      className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <Check className="size-3" />
                      {saving === node.id ? "Saving…" : "Save step"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Connector dot between steps */}
            {!isLast && (
              <div className="flex justify-center py-0.5">
                <div className="w-px h-4 bg-border/60" />
              </div>
            )}
          </div>
        );
      })}

      {/* ── Add step ── */}
      <div className={steps.length > 0 ? "pt-2" : ""}>
        {showPicker ? (
          <div className="rounded-2xl border border-border bg-card shadow-md overflow-hidden">
            {/* Picker header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                What should the bot do next?
              </p>
              <button
                onClick={() => setShowPicker(false)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* 2-column grid of step types */}
            <div className="grid grid-cols-2 p-3 gap-2">
              {STEP_TYPES.map((item) => (
                <button
                  key={item.type}
                  onClick={() => void handleAddStep(item.type)}
                  disabled={adding}
                  className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-left hover:bg-muted hover:border-border transition-colors disabled:opacity-50"
                >
                  <span className="text-xl leading-none shrink-0">{item.emoji}</span>
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowPicker(true)}
            disabled={adding}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/70 py-3.5 text-sm font-semibold text-muted-foreground hover:border-primary/60 hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-50"
          >
            <Plus className="size-4" />
            {adding ? "Adding…" : "Add step"}
          </button>
        )}
      </div>
    </div>
  );
}
