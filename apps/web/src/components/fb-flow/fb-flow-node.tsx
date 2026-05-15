"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

// ─── Node type config ─────────────────────────────────────────────────────────

const NODE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; headerBg: string; border: string; dot: string }
> = {
  TEXT: {
    label: "Text Message",
    icon: MessageCircle,
    headerBg: "bg-indigo-500",
    border: "border-indigo-300",
    dot: "bg-indigo-400",
  },
  MEDIA: {
    label: "Image / Media",
    icon: ImageIcon,
    headerBg: "bg-sky-500",
    border: "border-sky-300",
    dot: "bg-sky-400",
  },
  BUTTONS: {
    label: "Button Template",
    icon: MousePointerClick,
    headerBg: "bg-purple-500",
    border: "border-purple-300",
    dot: "bg-purple-400",
  },
  QUESTION: {
    label: "Ask Question",
    icon: HelpCircle,
    headerBg: "bg-amber-500",
    border: "border-amber-300",
    dot: "bg-amber-400",
  },
  CONDITION: {
    label: "Condition",
    icon: GitBranch,
    headerBg: "bg-orange-500",
    border: "border-orange-300",
    dot: "bg-orange-400",
  },
  AI_REPLY: {
    label: "AI Reply",
    icon: Sparkles,
    headerBg: "bg-violet-500",
    border: "border-violet-300",
    dot: "bg-violet-400",
  },
  HUMAN_HANDOFF: {
    label: "Human Handoff",
    icon: UserCheck,
    headerBg: "bg-teal-500",
    border: "border-teal-300",
    dot: "bg-teal-400",
  },
  END: {
    label: "End Flow",
    icon: CircleStop,
    headerBg: "bg-red-500",
    border: "border-red-300",
    dot: "bg-red-400",
  },
  TAG_CONTACT: {
    label: "Tag Contact",
    icon: Zap,
    headerBg: "bg-lime-500",
    border: "border-lime-300",
    dot: "bg-lime-400",
  },
};

const FALLBACK_NODE_CONFIG = NODE_CONFIG.TEXT;

// ─── Button row height constants (must match rendered JSX) ────────────────────
const HEADER_H = 38;       // px — colored header bar height
const BTN_SECTION_PT = 8;  // px — padding-top of button section
const BTN_ROW_H = 34;      // px — height of each button row incl gap

// ─── Main node component ──────────────────────────────────────────────────────

export type FbFlowNodeData = {
  kind: string;
  label: string;       // preview text
  isEntry?: boolean;
  buttons?: Array<{ id: string; label: string }>;
  content?: Record<string, unknown>; // stored locally so edit panel works on new nodes
  onSelect?: (nodeId: string) => void;
};

export function FbFlowNode(props: NodeProps) {
  const { id, data, selected } = props;
  const d = data as FbFlowNodeData;
  const cfg = NODE_CONFIG[d.kind] ?? FALLBACK_NODE_CONFIG;
  const Icon = cfg.icon;

  const isTerminal = d.kind === "END" || d.kind === "HUMAN_HANDOFF";
  const isButtons = d.kind === "BUTTONS";
  const isCondition = d.kind === "CONDITION";
  const buttons = d.buttons ?? [];

  return (
    <div
      className="group relative select-none"
      style={{ overflow: "visible" }}
      onClick={() => d.onSelect?.(id)}
    >
      {/* ── Incoming handle ──────────────────────────────────────────────── */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2 !border-white !bg-zinc-400 !rounded-full"
      />

      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "w-56 rounded-xl overflow-hidden shadow-xl border-2 transition-all duration-150",
          "bg-white text-zinc-900",
          selected
            ? `${cfg.border} ring-2 ring-offset-1 ring-offset-transparent scale-[1.02]`
            : `border-zinc-200 hover:border-zinc-300 hover:shadow-2xl`,
          d.isEntry && "ring-2 ring-yellow-400 ring-offset-1",
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center gap-2 px-3 text-white font-semibold text-xs",
            cfg.headerBg,
          )}
          style={{ height: HEADER_H }}
        >
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{cfg.label}</span>
          {d.isEntry && (
            <span className="ml-auto text-[9px] font-bold bg-white/20 rounded px-1 py-0.5 shrink-0">
              START
            </span>
          )}
        </div>

        {/* Body */}
        {!isButtons && !isCondition && (
          <div className="px-3 py-2.5 min-h-[40px]">
            <p className="text-[11px] text-zinc-600 leading-snug line-clamp-3 whitespace-pre-wrap">
              {d.label || <span className="italic text-zinc-400">No content yet…</span>}
            </p>
          </div>
        )}

        {/* Condition branches */}
        {isCondition && (
          <div className="px-3 py-2.5">
            <p className="text-[11px] text-zinc-500 mb-2">Branch on variable:</p>
            <p className="text-[11px] text-zinc-700 font-mono bg-zinc-50 rounded px-2 py-1 truncate">
              {d.label || "{{lastInput}}"}
            </p>
            <div className="flex justify-between mt-3 gap-2">
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                ✓ YES
              </span>
              <span className="text-[10px] font-semibold text-red-500 bg-red-50 rounded-full px-2 py-0.5">
                ✗ NO
              </span>
            </div>
          </div>
        )}

        {/* Button template rows */}
        {isButtons && (
          <>
            <div className="px-3 pt-2 pb-1">
              <p className="text-[11px] text-zinc-600 leading-snug line-clamp-2">
                {d.label || <span className="italic text-zinc-400">No message yet…</span>}
              </p>
            </div>
            {/* Button rows — fixed height for handle calculation */}
            <div
              className="px-3 pb-2.5 flex flex-col gap-1"
              style={{ paddingTop: BTN_SECTION_PT }}
            >
              {buttons.length === 0 ? (
                <div
                  className="flex items-center text-[10px] text-zinc-400 italic bg-zinc-50 rounded px-2"
                  style={{ height: BTN_ROW_H }}
                >
                  No buttons yet…
                </div>
              ) : (
                buttons.map((btn) => (
                  <div
                    key={btn.id}
                    className="flex items-center justify-between bg-zinc-50 rounded-lg px-2.5 text-[11px] font-medium text-zinc-700 border border-zinc-200"
                    style={{ height: BTN_ROW_H }}
                  >
                    <span className="truncate">{btn.label}</span>
                    <span className="ml-2 shrink-0 size-2 rounded-full bg-purple-400" />
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Per-button source handles (right side, vertically aligned) ──── */}
      {isButtons &&
        buttons.map((btn, i) => (
          <Handle
            key={btn.id}
            type="source"
            position={Position.Right}
            id={btn.id}
            style={{
              top: HEADER_H + 24 + BTN_SECTION_PT + i * BTN_ROW_H + BTN_ROW_H / 2,
              right: -6,
            }}
            className="!w-3 !h-3 !border-2 !border-white !bg-purple-400 !rounded-full"
          />
        ))}

      {/* ── Condition YES / NO handles ───────────────────────────────────── */}
      {isCondition && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="yes"
            style={{ left: "28%" }}
            className="!w-3 !h-3 !border-2 !border-white !bg-emerald-500 !rounded-full"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="no"
            style={{ left: "72%" }}
            className="!w-3 !h-3 !border-2 !border-white !bg-red-500 !rounded-full"
          />
        </>
      )}

      {/* ── Default outgoing handle ───────────────────────────────────────── */}
      {!isTerminal && !isCondition && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !border-2 !border-white !bg-zinc-400 !rounded-full"
        />
      )}
    </div>
  );
}
