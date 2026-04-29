"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { qk } from "@/lib/query-keys";
import type { ContactGroup, Template, WhatsAppAccount } from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Moon,
  Play,
  Save,
  Sun,
  Timer,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── helpers ─────────────────────────────────────────────────────────────────

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type SendWindow = "anytime" | "daytime" | "nighttime" | "custom";
type ScheduleMode = "now" | "later";

const WINDOW_OPTIONS: { id: SendWindow; label: string; sub: string; icon: React.ReactNode }[] = [
  { id: "anytime",   label: "Any time",   sub: "No restriction",    icon: <Zap className="size-4" /> },
  { id: "daytime",   label: "Daytime",    sub: "8 am – 6 pm",       icon: <Sun className="size-4" /> },
  { id: "nighttime", label: "Nighttime",  sub: "6 pm – 11 pm",      icon: <Moon className="size-4" /> },
  { id: "custom",    label: "Custom",     sub: "Set your own hours", icon: <Clock className="size-4" /> },
];

function windowTimes(w: SendWindow, customStart: string, customEnd: string) {
  if (w === "daytime")   return { start: "08:00", end: "18:00" };
  if (w === "nighttime") return { start: "18:00", end: "23:00" };
  if (w === "custom")    return { start: customStart, end: customEnd };
  return { start: null, end: null };
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function NewCampaignPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // form state
  const [name, setName]         = useState("");
  const [waId, setWaId]         = useState("");
  const [groupId, setGroupId]   = useState("");
  const [templateId, setTemplateId] = useState("");
  const [minDelaySec, setMinDelaySec] = useState(1);
  const [maxDelaySec, setMaxDelaySec] = useState(5);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sendWindow, setSendWindow] = useState<SendWindow>("anytime");
  const [customStart, setCustomStart] = useState("08:00");
  const [customEnd, setCustomEnd]     = useState("18:00");

  // data
  const { data: accounts = [] } = useQuery({
    queryKey: qk.whatsappAccounts,
    queryFn: async () => { const { data } = await api.get<WhatsAppAccount[]>("/whatsapp/accounts"); return data; },
  });
  const { data: groups = [] } = useQuery({
    queryKey: qk.contactGroups,
    queryFn: async () => { const { data } = await api.get<ContactGroup[]>("/contact-groups"); return data; },
  });
  const { data: templates = [] } = useQuery({
    queryKey: qk.templates,
    queryFn: async () => { const { data } = await api.get<Template[]>("/templates"); return data; },
  });

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const selectedAccount  = accounts.find((a) => a.id === waId);
  const selectedGroup    = groups.find((g) => g.id === groupId);
  const { start: wStart, end: wEnd } = windowTimes(sendWindow, customStart, customEnd);

  const isValid = name.trim().length >= 2 && templateId && groupId;

  function buildPayload(startNow: boolean) {
    return {
      name: name.trim(),
      templateId,
      contactGroupId: groupId,
      whatsappAccountId: waId || undefined,
      minDelayMs: minDelaySec * 1000,
      maxDelayMs: maxDelaySec * 1000,
      scheduledAt: scheduleMode === "later" && scheduledAt ? scheduledAt : undefined,
      sendWindowStart: wStart ?? undefined,
      sendWindowEnd: wEnd ?? undefined,
      _startNow: startNow,
    };
  }

  const saveMutation = useMutation({
    mutationFn: async (startNow: boolean) => {
      const { _startNow, ...dto } = buildPayload(startNow);
      const { data: created } = await api.post<{ id: string }>("/campaigns", dto);
      if (_startNow) {
        await api.post(`/campaigns/${created.id}/start`, {});
      }
      return { id: created.id, startNow: _startNow };
    },
    onSuccess: ({ id, startNow }) => {
      void queryClient.invalidateQueries({ queryKey: qk.campaigns });
      toast.success(startNow ? "Campaign started!" : "Campaign saved as draft");
      router.push("/campaigns");
    },
    onError: (e) => toast.error("Could not save campaign", getApiErrorMessage(e)),
  });

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-container max-w-3xl space-y-8 pb-16">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/campaigns">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Campaign</h1>
          <p className="text-sm text-muted-foreground">Broadcast a message to a contact group</p>
        </div>
      </div>

      {/* Section 1 — Send From */}
      <Section icon={<MessageSquare className="size-4" />} title="Send From" subtitle="Which WhatsApp number sends this campaign">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No WhatsApp accounts connected. <Link href="/channels" className="text-primary underline">Connect one first</Link>.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Auto-select option */}
            <AccountCard
              selected={waId === ""}
              onSelect={() => setWaId("")}
              name="Auto-select"
              phone="First available account"
              status={null}
            />
            {accounts.map((a) => (
              <AccountCard
                key={a.id}
                selected={waId === a.id}
                onSelect={() => setWaId(a.id)}
                name={a.name}
                phone={a.phone ?? a.providerType}
                status={a.session?.status ?? null}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Section 2 — Audience */}
      <Section icon={<Users className="size-4" />} title="Audience" subtitle="Name this campaign and pick who receives it">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Campaign name</Label>
            <Input
              className="rounded-xl"
              placeholder="e.g. April Promo Blast"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Contact group</Label>
            <Select value={groupId} onValueChange={(v) => setGroupId(v ?? "")}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      {/* Section 3 — Message */}
      <Section icon={<MessageSquare className="size-4" />} title="Message" subtitle="Choose the template to send">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTemplate && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview</span>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                  {selectedTemplate.type}
                </span>
              </div>
              {selectedTemplate.header && (
                <p className="text-sm font-semibold">{selectedTemplate.header}</p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{selectedTemplate.content}</p>
              {selectedTemplate.footer && (
                <p className="text-xs text-muted-foreground italic">{selectedTemplate.footer}</p>
              )}
              {Object.keys(selectedTemplate.variables ?? {}).length > 0 && (
                <p className="text-xs text-amber-400">
                  ⚡ Variables will be personalised from each contact&apos;s data
                </p>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* Section 4 — Delivery Timing */}
      <Section icon={<Timer className="size-4" />} title="Message Delay" subtitle="Random pause between each message to avoid spam filters">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Min delay (seconds)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={600}
                className="rounded-xl w-28"
                value={minDelaySec}
                onChange={(e) => setMinDelaySec(Math.max(0, Number(e.target.value)))}
              />
              <input
                type="range"
                min={0}
                max={60}
                value={minDelaySec}
                onChange={(e) => setMinDelaySec(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Max delay (seconds)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                max={600}
                className="rounded-xl w-28"
                value={maxDelaySec}
                onChange={(e) => setMaxDelaySec(Math.max(0, Number(e.target.value)))}
              />
              <input
                type="range"
                min={0}
                max={60}
                value={maxDelaySec}
                onChange={(e) => setMaxDelaySec(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Each message will be sent after a random {minDelaySec}–{maxDelaySec} second pause.
          {selectedGroup ? ` Estimated time for this group: ${formatEstimate(minDelaySec, maxDelaySec)}.` : ""}
        </p>
      </Section>

      {/* Section 5 — Schedule */}
      <Section icon={<Calendar className="size-4" />} title="Schedule" subtitle="Send immediately or at a specific date and time">
        <div className="grid gap-3">
          {(["now", "later"] as ScheduleMode[]).map((mode) => (
            <label
              key={mode}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors",
                scheduleMode === mode
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/60 hover:bg-muted/30"
              )}
            >
              <input
                type="radio"
                name="schedule"
                value={mode}
                checked={scheduleMode === mode}
                onChange={() => setScheduleMode(mode)}
                className="accent-primary"
              />
              <div>
                <p className="text-sm font-medium">
                  {mode === "now" ? "Send immediately" : "Schedule for later"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {mode === "now" ? "Campaign starts as soon as you click Start" : "Pick a date and time"}
                </p>
              </div>
            </label>
          ))}
          {scheduleMode === "later" && (
            <Input
              type="datetime-local"
              className="rounded-xl"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          )}
        </div>
      </Section>

      {/* Section 6 — Send Window */}
      <Section icon={<Clock className="size-4" />} title="Send Window" subtitle="Restrict what hours of the day messages are allowed to go out">
        <div className="grid gap-3 sm:grid-cols-2">
          {WINDOW_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors",
                sendWindow === opt.id
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/60 hover:bg-muted/30"
              )}
            >
              <input
                type="radio"
                name="window"
                value={opt.id}
                checked={sendWindow === opt.id}
                onChange={() => setSendWindow(opt.id)}
                className="accent-primary"
              />
              <span className="text-muted-foreground">{opt.icon}</span>
              <div>
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.sub}</p>
              </div>
            </label>
          ))}
        </div>
        {sendWindow === "custom" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Start time</Label>
              <Input type="time" className="rounded-xl" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>End time</Label>
              <Input type="time" className="rounded-xl" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          </div>
        )}
      </Section>

      {/* Summary bar + actions */}
      <div className="sticky bottom-6 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-sm shadow-xl px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground space-y-0.5">
          {selectedAccount
            ? <p>📱 <span className="font-medium text-foreground">{selectedAccount.name}</span></p>
            : <p>📱 Auto-select account</p>}
          {selectedGroup
            ? <p>👥 <span className="font-medium text-foreground">{selectedGroup.name}</span></p>
            : <p className="text-destructive">No group selected</p>}
          {selectedTemplate
            ? <p>💬 <span className="font-medium text-foreground">{selectedTemplate.name}</span></p>
            : <p className="text-destructive">No template selected</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={!isValid || saveMutation.isPending}
            onClick={() => saveMutation.mutate(false)}
          >
            {saveMutation.isPending && !saveMutation.variables ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Save draft
          </Button>
          <Button
            className="rounded-xl"
            disabled={!isValid || saveMutation.isPending || scheduleMode === "later"}
            onClick={() => saveMutation.mutate(true)}
            title={scheduleMode === "later" ? "Save as draft first — scheduling is not yet automated" : undefined}
          >
            {saveMutation.isPending && saveMutation.variables ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Play className="mr-2 size-4" />
            )}
            Start now
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── sub-components ────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border/60 px-6 py-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function AccountCard({
  selected,
  onSelect,
  name,
  phone,
  status,
}: {
  selected: boolean;
  onSelect: () => void;
  name: string;
  phone: string;
  status: string | null;
}) {
  const isConnected = status === "CONNECTED";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 text-left transition-all w-full",
        selected
          ? "border-primary/60 bg-primary/5 shadow-sm"
          : "border-border/60 hover:bg-muted/30"
      )}
    >
      {selected ? (
        <CheckCircle2 className="size-5 text-primary shrink-0" />
      ) : (
        <div className="size-5 rounded-full border-2 border-border shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{phone}</p>
      </div>
      {status !== null && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
            isConnected
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400"
          )}
        >
          {isConnected ? "Live" : status?.toLowerCase()}
        </span>
      )}
    </button>
  );
}

function formatEstimate(minSec: number, maxSec: number): string {
  const avgSec = (minSec + maxSec) / 2;
  if (avgSec < 60) return `~${Math.round(avgSec)}s per message`;
  const mins = Math.round(avgSec / 60);
  return `~${mins} min per message`;
}
