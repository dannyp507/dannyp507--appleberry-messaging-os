"use client";

import { cn } from "@/lib/utils";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type ChatbotNodeData = {
  label: string;
  kind: string;
};

const NODE_COLORS: Record<string, { border: string; badge: string; dot: string }> = {
  TEXT:           { border: "border-indigo-300 dark:border-indigo-700",   badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",   dot: "bg-indigo-400" },
  QUESTION:       { border: "border-amber-300 dark:border-amber-700",     badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",       dot: "bg-amber-400" },
  CONDITION:      { border: "border-orange-300 dark:border-orange-700",   badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",   dot: "bg-orange-400" },
  AI_REPLY:       { border: "border-violet-300 dark:border-violet-700",   badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",   dot: "bg-violet-400" },
  SAVE_TO_SHEET:  { border: "border-emerald-300 dark:border-emerald-700", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-400" },
  CHECK_CALENDAR: { border: "border-blue-300 dark:border-blue-700",       badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",           dot: "bg-blue-400" },
  CREATE_BOOKING: { border: "border-pink-300 dark:border-pink-700",       badge: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",           dot: "bg-pink-400" },
  WEBHOOK:        { border: "border-gray-300 dark:border-gray-700",       badge: "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300",           dot: "bg-gray-400" },
  ACTION:         { border: "border-gray-300 dark:border-gray-700",       badge: "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300",           dot: "bg-gray-400" },
};

const NODE_LABELS: Record<string, string> = {
  TEXT:           "💬 Text",
  QUESTION:       "❓ Question",
  CONDITION:      "🔀 Condition",
  AI_REPLY:       "✨ AI Reply",
  SAVE_TO_SHEET:  "📊 Save to Sheet",
  CHECK_CALENDAR: "📅 Check Calendar",
  CREATE_BOOKING: "🗓️ Create Booking",
  WEBHOOK:        "🔗 Webhook",
  ACTION:         "⚡ Action",
};

export function ChatbotFlowNode(props: NodeProps) {
  const { data, selected } = props;
  const d = data as ChatbotNodeData;
  const colors = NODE_COLORS[d.kind] ?? NODE_COLORS.ACTION;
  const kindLabel = NODE_LABELS[d.kind] ?? d.kind;

  return (
    <div
      className={cn(
        "min-w-[168px] rounded-xl border-2 bg-card px-3 py-2.5 shadow-md transition-all duration-200 ease-out",
        selected
          ? "scale-[1.02] border-primary shadow-lg ring-2 ring-primary/25"
          : `${colors.border} hover:shadow-lg`,
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !border-2 !border-background !bg-muted-foreground/50"
      />
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn("inline-block size-1.5 rounded-full shrink-0", colors.dot)} />
        <p className={cn("text-[9px] font-bold uppercase tracking-wider rounded px-1 py-0.5", colors.badge)}>
          {kindLabel}
        </p>
      </div>
      <p className="text-sm font-medium leading-snug text-foreground line-clamp-2">
        {d.label}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !border-2 !border-background !bg-muted-foreground/50"
      />
    </div>
  );
}
