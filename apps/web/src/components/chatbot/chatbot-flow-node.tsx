"use client";

import { cn } from "@/lib/utils";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type ChatbotNodeData = {
  label: string;
  kind: string;
};

export function ChatbotFlowNode(props: NodeProps) {
  const { data, selected } = props;
  const d = data as ChatbotNodeData;
  return (
    <div
      className={cn(
        "min-w-[156px] rounded-xl border-2 bg-card px-3 py-2.5 shadow-md transition-all duration-200 ease-out",
        selected
          ? "scale-[1.02] border-primary shadow-lg ring-2 ring-primary/25"
          : "border-border/70 hover:border-border hover:shadow-lg",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !border-2 !border-background !bg-muted-foreground/50"
      />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {d.kind}
      </p>
      <p className="mt-1 text-sm font-medium leading-snug text-foreground">
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
