"use client";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { WhatsAppAccount, WhatsAppAccountAiSettings } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  BrainCircuit,
  Cloud,
  Key,
  Loader2,
  MessageCircle,
  Smartphone,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "ai-training" | "dm-bot";

export default function WhatsAppAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("ai-training");

  const { data: accounts = [] } = useQuery({
    queryKey: qk.whatsappAccounts,
    queryFn: async () => {
      const { data } = await api.get<WhatsAppAccount[]>("/whatsapp/accounts");
      return data;
    },
  });

  const account = accounts.find((a) => a.id === id);

  // ── AI settings ────────────────────────────────────────────────────────────
  const { data: aiSettings } = useQuery<WhatsAppAccountAiSettings>({
    queryKey: qk.waAccountAiSettings(id),
    queryFn: async () => {
      const { data } = await api.get(`/whatsapp/accounts/${id}/ai-settings`);
      return data;
    },
    enabled: !!id,
  });

  // ── AI Training state ──────────────────────────────────────────────────────
  const [aiProvider, setAiProvider] = useState<"gemini" | "openai">("gemini");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [systemPrompt, setSystemPrompt] = useState("");

  // ── DM Bot state ───────────────────────────────────────────────────────────
  const [dmAiEnabled, setDmAiEnabled] = useState(false);
  const [dmAiFallbackOnly, setDmAiFallbackOnly] = useState(true);
  const [dmWelcomeEnabled, setDmWelcomeEnabled] = useState(false);
  const [dmWelcomeText, setDmWelcomeText] = useState("");
  const [dmDefaultReply, setDmDefaultReply] = useState("");
  const [dmTypingEnabled, setDmTypingEnabled] = useState(false);
  const [aiOffKeyword, setAiOffKeyword] = useState("");
  const [aiOffReply, setAiOffReply] = useState("");
  const [aiOnKeyword, setAiOnKeyword] = useState("");
  const [aiOnReply, setAiOnReply] = useState("");

  useEffect(() => {
    if (!aiSettings) return;
    setAiProvider((aiSettings.aiProvider as "gemini" | "openai") ?? "gemini");
    setGeminiApiKey(aiSettings.geminiKeySet ? "••••••••••••••••" : "");
    setGeminiModel(aiSettings.geminiModel ?? "gemini-2.5-flash");
    setOpenaiApiKey(aiSettings.openaiKeySet ? "••••••••••••••••" : "");
    setOpenaiModel(aiSettings.openaiModel ?? "gpt-4o-mini");
    setSystemPrompt(aiSettings.systemPrompt ?? "");
    setDmAiEnabled(aiSettings.dmAiEnabled ?? false);
    setDmAiFallbackOnly(aiSettings.dmAiFallbackOnly ?? true);
    setDmWelcomeEnabled(aiSettings.dmWelcomeEnabled ?? false);
    setDmWelcomeText(aiSettings.dmWelcomeText ?? "");
    setDmDefaultReply(aiSettings.dmDefaultReply ?? "");
    setDmTypingEnabled(aiSettings.dmTypingEnabled ?? false);
    setAiOffKeyword(aiSettings.aiOffKeyword ?? "");
    setAiOffReply(aiSettings.aiOffReply ?? "");
    setAiOnKeyword(aiSettings.aiOnKeyword ?? "");
    setAiOnReply(aiSettings.aiOnReply ?? "");
  }, [aiSettings]);

  // ── Save AI Training ───────────────────────────────────────────────────────
  const saveAiMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/whatsapp/accounts/${id}/ai-settings`, {
        aiProvider,
        geminiApiKey: geminiApiKey === "••••••••••••••••" ? undefined : (geminiApiKey || null),
        geminiModel: geminiModel || null,
        openaiApiKey: openaiApiKey === "••••••••••••••••" ? undefined : (openaiApiKey || null),
        openaiModel: openaiModel || null,
        systemPrompt: systemPrompt || null,
      });
    },
    onSuccess: () => {
      toast.success("AI training saved");
      void queryClient.invalidateQueries({ queryKey: qk.waAccountAiSettings(id) });
    },
    onError: () => toast.error("Failed to save AI training"),
  });

  // ── Save DM Bot ────────────────────────────────────────────────────────────
  const saveDmMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/whatsapp/accounts/${id}/ai-settings`, {
        dmAiEnabled,
        dmAiFallbackOnly,
        dmWelcomeEnabled,
        dmWelcomeText: dmWelcomeText || null,
        dmDefaultReply: dmDefaultReply || null,
        dmTypingEnabled,
        aiOffKeyword: aiOffKeyword || null,
        aiOffReply: aiOffReply || null,
        aiOnKeyword: aiOnKeyword || null,
        aiOnReply: aiOnReply || null,
      });
    },
    onSuccess: () => {
      toast.success("DM Bot settings saved");
      void queryClient.invalidateQueries({ queryKey: qk.waAccountAiSettings(id) });
    },
    onError: () => toast.error("Failed to save DM Bot settings"),
  });

  const isConnected =
    account?.session?.status === "CONNECTED" ||
    account?.sessionStatus === "CONNECTED";
  const isCloud = account?.providerType === "CLOUD";

  const tabs: { key: Tab; label: string }[] = [
    { key: "ai-training", label: "AI Training" },
    { key: "dm-bot", label: "DM Bot" },
  ];

  return (
    <div className="page-container space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-4">
        <Link href="/whatsapp-accounts">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            isConnected ? "bg-emerald-500/15" : "bg-muted/30",
          )}>
            {isCloud
              ? <Cloud className={cn("size-5", isConnected ? "text-emerald-500" : "text-muted-foreground")} />
              : <Smartphone className={cn("size-5", isConnected ? "text-emerald-500" : "text-muted-foreground")} />
            }
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">
              {account?.name ?? "WhatsApp Account"}
            </h1>
            {account?.phone && (
              <p className="text-xs font-mono text-muted-foreground">{account.phone}</p>
            )}
          </div>
        </div>
        <div className={cn(
          "ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
          isConnected
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
            : "border-border text-muted-foreground",
        )}>
          {isConnected
            ? <Wifi className="size-3" />
            : <WifiOff className="size-3" />
          }
          {isConnected ? "Connected" : "Offline"}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-border/60 bg-muted/20 p-1 w-fit">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-all",
              tab === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── AI Training tab ────────────────────────────────────────────────────── */}
      {tab === "ai-training" && (
        <div className="grid gap-4 max-w-2xl">

          {/* Isolation notice */}
          <div className="flex items-start gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-5 py-4 text-sm">
            <BrainCircuit className="mt-0.5 size-4 shrink-0 text-violet-400" />
            <div>
              <p className="font-medium text-violet-300">Account-only training</p>
              <p className="mt-0.5 text-muted-foreground">
                Everything you configure here applies <strong>only to {account?.name ?? "this number"}</strong>.
                It overrides the workspace-level AI settings for this WhatsApp number only.
                Other accounts and channels are not affected.
              </p>
            </div>
          </div>

          {/* Provider + API key */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <Key className="size-4 text-violet-400" />
              <span className="text-sm font-semibold">AI Provider</span>
            </div>

            {/* Provider selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Provider
              </label>
              <div className="flex gap-2">
                {(["gemini", "openai"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAiProvider(p)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm font-medium transition-all",
                      aiProvider === p
                        ? "border-violet-500 bg-violet-500/15 text-violet-300"
                        : "border-border/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p === "gemini" ? "Google Gemini" : "OpenAI"}
                  </button>
                ))}
              </div>
            </div>

            {/* Gemini fields */}
            {aiProvider === "gemini" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Gemini API Key
                  </label>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="AIza..."
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                  />
                  {aiSettings?.geminiKeySet && (
                    <p className="text-xs text-emerald-500">✓ Key saved — leave masked to keep current key</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Model
                  </label>
                  <input
                    className="w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="gemini-2.5-flash"
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* OpenAI fields */}
            {aiProvider === "openai" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    OpenAI API Key
                  </label>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="sk-..."
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                  />
                  {aiSettings?.openaiKeySet && (
                    <p className="text-xs text-emerald-500">✓ Key saved — leave masked to keep current key</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Model
                  </label>
                  <input
                    className="w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="gpt-4o-mini"
                    value={openaiModel}
                    onChange={(e) => setOpenaiModel(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* System prompt */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-violet-400" />
              <span className="text-sm font-semibold">Bot Training</span>
              <span className="ml-auto text-xs text-muted-foreground">System prompt</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Write everything the AI needs to know about this business — name, services, prices, hours, tone, rules.
              This prompt applies only to messages received on this WhatsApp number.
            </p>
            <textarea
              className="w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono leading-relaxed"
              rows={16}
              placeholder={`You are the AI assistant for [Business Name].

Services: [list what you do]
Prices: [your pricing]
Hours: Mon-Fri 8am-5pm, Sat 8am-1pm
Location: [your city]
Contact: [phone/WhatsApp]

Rules:
- Be friendly and professional
- Answer questions directly
- Never give false information`}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {systemPrompt.length} characters
            </p>
          </div>

          <Button
            className="rounded-xl w-fit"
            disabled={saveAiMutation.isPending}
            onClick={() => saveAiMutation.mutate()}
          >
            {saveAiMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Save AI Training
          </Button>
        </div>
      )}

      {/* ── DM Bot tab ─────────────────────────────────────────────────────────── */}
      {tab === "dm-bot" && (
        <div className="grid gap-4 max-w-xl">

          {/* Link to AI Training */}
          <div className="flex items-start gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm">
            <BrainCircuit className="mt-0.5 size-4 shrink-0 text-violet-400" />
            <p className="text-muted-foreground">
              The AI uses the training from the{" "}
              <button
                type="button"
                onClick={() => setTab("ai-training")}
                className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
              >
                AI Training tab
              </button>
              {" "}for all DM replies on this number.
            </p>
          </div>

          {/* Welcome message */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="size-4 text-blue-400" />
              <span className="text-sm font-semibold">Welcome Message</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Sent automatically the <strong>first time</strong> someone messages this number.
            </p>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Enable welcome message</span>
              <button
                type="button"
                onClick={() => setDmWelcomeEnabled((v) => !v)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  dmWelcomeEnabled ? "bg-blue-500" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-md transition-transform",
                    dmWelcomeEnabled ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
            </label>
            {dmWelcomeEnabled && (
              <textarea
                className="w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={3}
                placeholder="Hi! Thanks for messaging us. How can we help you today?"
                value={dmWelcomeText}
                onChange={(e) => setDmWelcomeText(e.target.value)}
              />
            )}
          </div>

          {/* AI Reply */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-violet-400" />
              <span className="text-sm font-semibold">AI Reply</span>
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, the AI generates a dynamic reply using your bot training and conversation history.
            </p>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Enable AI replies for DMs</span>
              <button
                type="button"
                onClick={() => setDmAiEnabled((v) => !v)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  dmAiEnabled ? "bg-violet-500" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-md transition-transform",
                    dmAiEnabled ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
            </label>
            {dmAiEnabled && (
              <label className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">AI fallback only</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When on, AI only fires if no keyword / autoresponder rule matched. Recommended.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDmAiFallbackOnly((v) => !v)}
                  className={cn(
                    "mt-0.5 relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    dmAiFallbackOnly ? "bg-violet-500" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-md transition-transform",
                      dmAiFallbackOnly ? "translate-x-4" : "translate-x-0",
                    )}
                  />
                </button>
              </label>
            )}
          </div>

          {/* Default reply */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-amber-400" />
              <span className="text-sm font-semibold">Default Reply</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Sent when no keyword rule matches <em>and</em> AI is off (or returns nothing).
              Leave blank for no automatic reply.
            </p>
            <textarea
              className="w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500"
              rows={3}
              placeholder="Thanks for your message! A team member will get back to you shortly."
              value={dmDefaultReply}
              onChange={(e) => setDmDefaultReply(e.target.value)}
            />
          </div>

          {/* Typing indicator */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="size-4 text-emerald-400" />
              <span className="text-sm font-semibold">Typing Indicator</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Shows a short delay before bot replies to make responses feel more natural.
            </p>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Enable typing delay</span>
              <button
                type="button"
                onClick={() => setDmTypingEnabled((v) => !v)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  dmTypingEnabled ? "bg-emerald-500" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-md transition-transform",
                    dmTypingEnabled ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
            </label>
          </div>

          {/* Human Takeover */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-orange-400" />
              <span className="text-sm font-semibold">Human Takeover</span>
            </div>
            <p className="text-xs text-muted-foreground">
              When a customer sends the <strong>OFF keyword</strong>, the AI stops replying in that conversation only — a human agent can then take over from the Inbox. The customer sends the <strong>ON keyword</strong> to bring the AI back.
            </p>

            {/* OFF keyword */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI OFF keyword</label>
              <input
                type="text"
                className="w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                placeholder='e.g. "agent" or "human"'
                value={aiOffKeyword}
                onChange={(e) => setAiOffKeyword(e.target.value)}
              />
              <textarea
                className="w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-orange-500"
                rows={2}
                placeholder="Reply when AI is paused, e.g. &quot;You&apos;re now connected to a human agent.&quot;"
                value={aiOffReply}
                onChange={(e) => setAiOffReply(e.target.value)}
              />
            </div>

            {/* ON keyword */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI ON keyword</label>
              <input
                type="text"
                className="w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder='e.g. "bot" or "resume"'
                value={aiOnKeyword}
                onChange={(e) => setAiOnKeyword(e.target.value)}
              />
              <textarea
                className="w-full rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
                rows={2}
                placeholder="Reply when AI resumes, e.g. &quot;AI assistant is back online. How can I help?&quot;"
                value={aiOnReply}
                onChange={(e) => setAiOnReply(e.target.value)}
              />
            </div>

            {(aiOffKeyword || aiOnKeyword) && (
              <p className="text-xs text-orange-400/80">
                Keywords are case-insensitive exact matches. Make sure they don&apos;t clash with your autoresponder keywords.
              </p>
            )}
          </div>

          <Button
            className="rounded-xl w-fit"
            disabled={saveDmMutation.isPending}
            onClick={() => saveDmMutation.mutate()}
          >
            {saveDmMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Save DM Bot settings
          </Button>
        </div>
      )}
    </div>
  );
}
