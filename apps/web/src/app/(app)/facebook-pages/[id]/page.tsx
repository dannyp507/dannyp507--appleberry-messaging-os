"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import type { FacebookPage, FacebookPageAiSettings } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Share2,
  Globe,
  Info,
  Key,
  Loader2,
  MessageCircle,
  Settings,
  Sparkles,
  Trash2,
  Webhook,
  GitBranch,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Tab = "overview" | "ai-training" | "dm-bot" | "settings";

export default function FacebookPageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  const { data: pages = [] } = useQuery({
    queryKey: qk.facebookPages,
    queryFn: async () => {
      const { data } = await api.get<FacebookPage[]>("/facebook/pages");
      return data;
    },
  });

  const page = pages.find((p) => p.id === id);

  // ── AI settings (shared between AI Training + DM Bot tabs) ────────────────
  const { data: aiSettings } = useQuery<FacebookPageAiSettings>({
    queryKey: qk.fbPageAiSettings(id),
    queryFn: async () => {
      const { data } = await api.get(
        `/fb-comment-automations/pages/${id}/ai-settings`,
      );
      return data;
    },
    enabled: !!id && (tab === "ai-training" || tab === "dm-bot"),
  });

  // ── AI Training state ─────────────────────────────────────────────────────
  const [aiProvider, setAiProvider] = useState<"gemini" | "openai">("gemini");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [systemPrompt, setSystemPrompt] = useState("");

  // ── DM Bot state ──────────────────────────────────────────────────────────
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
    // AI Training fields
    setAiProvider((aiSettings.aiProvider as "gemini" | "openai") ?? "gemini");
    setGeminiApiKey(aiSettings.geminiKeySet ? "••••••••••••••••" : "");
    setGeminiModel(aiSettings.geminiModel ?? "gemini-2.5-flash");
    setOpenaiApiKey(aiSettings.openaiKeySet ? "••••••••••••••••" : "");
    setOpenaiModel(aiSettings.openaiModel ?? "gpt-4o-mini");
    setSystemPrompt(aiSettings.systemPrompt ?? "");
    // DM Bot fields
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

  // ── Save AI Training ──────────────────────────────────────────────────────
  const saveAiMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/fb-comment-automations/pages/${id}/ai-settings`, {
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
      void queryClient.invalidateQueries({ queryKey: qk.fbPageAiSettings(id) });
    },
    onError: () => toast.error("Failed to save AI training"),
  });

  // ── Save DM Bot ───────────────────────────────────────────────────────────
  const saveDmMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/fb-comment-automations/pages/${id}/ai-settings`, {
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
      void queryClient.invalidateQueries({ queryKey: qk.fbPageAiSettings(id) });
    },
    onError: () => toast.error("Failed to save DM Bot settings"),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/facebook/pages/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.facebookPages });
      toast.success("Page disconnected");
      router.push("/facebook-pages");
    },
    onError: () => toast.error("Could not remove page"),
  });

  if (!page) {
    return (
      <div className="page-container flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "ai-training", label: "AI Training" },
    { key: "dm-bot", label: "DM Bot" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="page-container space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-4">
        <Link href="/facebook-pages">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-500/15">
            <Share2 className="size-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">{page.name}</h1>
            {page.category && (
              <p className="text-xs text-muted-foreground">{page.category}</p>
            )}
          </div>
        </div>
        <Badge
          variant="outline"
          className={`ml-auto shrink-0 rounded-lg text-xs font-mono ${
            page.isActive
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          }`}
        >
          {page.isActive ? "Active" : "Inactive"}
        </Badge>
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

      {/* ── Overview tab ────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CheckCircle2 className="size-4" />
              Connection
            </div>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium">Page token active</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Page access tokens do not expire unless the user revokes access.
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Webhook className="size-4" />
              Webhook
            </div>
            <p className="text-sm font-medium">Verify endpoint</p>
            <code className="mt-1.5 block rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all">
              {typeof window !== "undefined"
                ? `${window.location.origin.replace(":3000", ":3001")}/facebook/webhook`
                : "/facebook/webhook"}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              Register this URL in your Meta App Dashboard under Webhooks → Page subscription.
              Subscribe to the <code className="font-mono">messages</code> field.
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <MessageCircle className="size-4" />
              Conversations
            </div>
            <p className="text-3xl font-bold">{page._count?.inboxThreads ?? 0}</p>
            <Link
              href={`/inbox?channel=MESSENGER&pageId=${page.id}`}
              className="mt-3 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
            >
              Open in Inbox
            </Link>
          </div>

          <div className="col-span-full flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-4 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-blue-500" />
            <div>
              <p className="font-medium">24-Hour Messaging Window</p>
              <p className="mt-0.5 text-muted-foreground">
                You can only reply to a Messenger conversation within 24 hours of the last user
                message. After this window expires, replies will fail with a permissions error
                from Meta.
              </p>
            </div>
          </div>

          <div className="col-span-full grid gap-3 sm:grid-cols-2">
            <Link href={`/keyword-triggers`}>
              <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer">
                <Globe className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Keyword Triggers</p>
                  <p className="text-xs text-muted-foreground">
                    All-channel and Messenger-scoped keyword rules apply to this Page.
                  </p>
                </div>
              </div>
            </Link>
            <Link href={`/autoresponder`}>
              <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-5 py-4 hover:bg-muted/30 transition-colors cursor-pointer">
                <MessageCircle className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Autoresponder Rules</p>
                  <p className="text-xs text-muted-foreground">
                    Page-scoped and workspace-wide autoresponders fire for this Page.
                  </p>
                </div>
              </div>
            </Link>

            {/* Flows card */}
            <Link href={`/facebook-pages/${id}/flows`}>
              <div className="flex items-center gap-3 rounded-xl border border-purple-500/20 bg-purple-500/5 px-5 py-4 hover:bg-purple-500/10 transition-colors cursor-pointer">
                <GitBranch className="size-5 text-purple-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-purple-300">Messenger Flows</p>
                  <p className="text-xs text-muted-foreground">
                    Visual drag-and-drop chatbot flows for this Messenger page.
                  </p>
                </div>
                <ExternalLink className="size-4 text-purple-400/60" />
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* ── AI Training tab ──────────────────────────────────────────────────── */}
      {tab === "ai-training" && (
        <div className="grid gap-4 max-w-2xl">

          {/* Isolation notice */}
          <div className="flex items-start gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-5 py-4 text-sm">
            <BrainCircuit className="mt-0.5 size-4 shrink-0 text-violet-400" />
            <div>
              <p className="font-medium text-violet-300">Page-only training</p>
              <p className="mt-0.5 text-muted-foreground">
                Everything you configure here applies <strong>only to {page.name}</strong>.
                It fires for both DM replies and comment automation AI on this page.
                It does not affect WhatsApp, Telegram, or any other Facebook page.
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

          {/* System prompt — the main training area */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-violet-400" />
              <span className="text-sm font-semibold">Bot Training</span>
              <span className="ml-auto text-xs text-muted-foreground">System prompt</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Write everything the AI needs to know about this business — name, services, prices, hours, tone, rules.
              This is the only place you need to train the bot. It applies to DMs and comment replies on this page.
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

      {/* ── DM Bot tab ───────────────────────────────────────────────────────── */}
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
              {" "}for all DM replies on this page.
            </p>
          </div>

          {/* Welcome message */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="size-4 text-blue-400" />
              <span className="text-sm font-semibold">Welcome Message</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Sent automatically the <strong>first time</strong> someone messages this Page.
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
              Shows the &quot;...&quot; typing bubble in Messenger before every bot reply. Makes the bot feel more natural and human-like.
            </p>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Enable typing indicator</span>
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
            {dmTypingEnabled && (
              <p className="text-xs text-emerald-400/80">
                A ~1.2 s delay is added before quick replies so the typing bubble stays visible. AI replies use the natural processing time.
              </p>
            )}
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
                placeholder="Reply when AI is paused, e.g. &quot;You&apos;re now connected to a human agent. We&apos;ll be with you shortly.&quot;"
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
                Keywords are case-insensitive exact matches. Make sure they don&apos;t clash with your other autoresponder keywords.
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

      {/* ── Settings tab ─────────────────────────────────────────────────────── */}
      {tab === "settings" && (
        <div className="grid gap-4 max-w-lg">
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Settings className="size-4" />
              Page details
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Page name</p>
                <p className="font-medium">{page.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Facebook Page ID</p>
                <code className="font-mono text-xs bg-muted px-2 py-1 rounded-lg">{page.pageId}</code>
              </div>
              {page.category && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Category</p>
                  <p>{page.category}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Connected</p>
                <p>{new Date(page.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5">
            <p className="mb-1 text-sm font-medium text-destructive">Danger zone</p>
            <p className="mb-4 text-xs text-muted-foreground">
              Disconnecting this Page will stop all Messenger automation. Existing inbox threads
              are preserved but new messages will not be received.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="rounded-xl"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate()}
            >
              {removeMutation.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 size-4" />
              )}
              Disconnect page
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
