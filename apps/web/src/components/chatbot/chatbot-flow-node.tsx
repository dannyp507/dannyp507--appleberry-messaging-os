"use client";

import { cn } from "@/lib/utils";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type ChatbotNodeData = {
  label: string;
  kind: string;
  content?: Record<string, unknown>;
};

const NODE_BORDER: Record<string, string> = {
  TEXT:         "border-sky-400/70",
  QUESTION:     "border-violet-400/70",
  CONDITION:    "border-amber-400/70",
  BUTTONS:      "border-emerald-400/70",
  LIST:         "border-teal-400/70",
  MEDIA:        "border-pink-400/70",
  DELAY:        "border-orange-400/70",
  END:          "border-red-400/70",
  AI_REPLY:     "border-purple-500/70",
  WEBHOOK:      "border-slate-400/70",
};

const NODE_DOT: Record<string, string> = {
  TEXT:         "bg-sky-400",
  QUESTION:     "bg-violet-400",
  CONDITION:    "bg-amber-400",
  BUTTONS:      "bg-emerald-400",
  LIST:         "bg-teal-400",
  MEDIA:        "bg-pink-400",
  DELAY:        "bg-orange-400",
  END:          "bg-red-400",
  AI_REPLY:     "bg-purple-500",
  WEBHOOK:      "bg-slate-400",
};

export function ChatbotFlowNode(props: NodeProps) {
  const { data, selected } = props;
  const d = data as ChatbotNodeData;
  const c = d.content ?? {};
  const isEnd = d.kind === "END";

  const border = NODE_BORDER[d.kind] ?? "border-border/70";
  const dot    = NODE_DOT[d.kind]    ?? "bg-muted-foreground/60";

  return (
    <div
      className={cn(
        "min-w-[180px] max-w-[220px] rounded-xl border-2 bg-card px-3 py-2.5 shadow-md transition-all duration-200 ease-out",
        border,
        selected
          ? "scale-[1.02] shadow-lg ring-2 ring-primary/25"
          : "hover:shadow-lg",
      )}
    >
      {!isEnd && (
        <Handle
          type="target"
          position={Position.Top}
          className="!size-3 !border-2 !border-background !bg-muted-foreground/50"
        />
      )}

      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={cn("inline-block size-1.5 rounded-full flex-shrink-0", dot)} />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {d.kind}
        </p>
      </div>

      <p className="text-sm font-medium leading-snug text-foreground">
        {d.label}
      </p>

      {/* Button chips for BUTTONS nodes */}
      {d.kind === "BUTTONS" && Array.isArray(c.buttons) && (c.buttons as Array<{ id: string; title: string }>).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(c.buttons as Array<{ id: string; title: string }>).slice(0, 3).map((b) => (
            <span
              key={b.id}
              className="inline-flex items-center rounded-full border border-emerald-300/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
            >
              {b.title || b.id}
            </span>
          ))}
        </div>
      )}

      {/* Row count for LIST nodes */}
      {d.kind === "LIST" && Array.isArray(c.sections) && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {(c.sections as Array<{ rows: unknown[] }>).reduce((acc, s) => acc + (s.rows?.length ?? 0), 0)} rows
        </p>
      )}

      {/* Filename for MEDIA nodes */}
      {d.kind === "MEDIA" && typeof c.url === "string" && c.url && (
        <p className="mt-1 text-[10px] text-muted-foreground truncate">
          {c.url.split("/").pop()?.slice(0, 28) ?? "media"}
        </p>
      )}

      {/* Duration for DELAY nodes */}
      {d.kind === "DELAY" && typeof c.seconds === "number" && (
        <p className="mt-1 text-xs text-muted-foreground">{c.seconds}s</p>
      )}

      {!isEnd && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!size-3 !border-2 !border-background !bg-muted-foreground/50"
        />
      )}
    </div>
  );
}
