"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { Bot, Eye, EyeOff, Save } from "lucide-react";

interface AiSettings {
  defaultProvider: string;
  systemPrompt: string | null;
  openaiApiKey: string | null;
  openaiModel: string;
  geminiApiKey: string | null;
  geminiModel: string;
  openaiKeySet: boolean;
  geminiKeySet: boolean;
}

const OPENAI_MODELS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini (fast)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (budget)" },
];

const GEMINI_MODELS = [
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash (fast)" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];

export default function AiSettingsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<AiSettings>({
    queryKey: ["workspace-ai-settings"],
    queryFn: async () => {
      const { data } = await api.get("/workspace-ai-settings");
      return data;
    },
  });

  const [provider, setProvider] = useState("openai");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-1.5-flash");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showGemini, setShowGemini] = useState(false);

  useEffect(() => {
    if (!data) return;
    setProvider(data.defaultProvider ?? "openai");
    setSystemPrompt(data.systemPrompt ?? "");
    setOpenaiModel(data.openaiModel ?? "gpt-4o-mini");
    setGeminiModel(data.geminiModel ?? "gemini-1.5-flash");
    // Don't pre-fill masked keys
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put("/workspace-ai-settings", {
        defaultProvider: provider,
        systemPrompt: systemPrompt || null,
        openaiApiKey: openaiKey || undefined,
        openaiModel,
        geminiApiKey: geminiKey || undefined,
        geminiModel,
      });
    },
    onSuccess: () => {
      toast.success("AI settings saved");
      setOpenaiKey("");
      setGeminiKey("");
      qc.invalidateQueries({ queryKey: ["workspace-ai-settings"] });
    },
    onError: (e) => toast.error(getApiErrorMessage(e)),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-6">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Providers
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure OpenAI and Google Gemini keys for AI Reply nodes in your
          chatbot flows.
        </p>
      </div>

      {/* Default provider */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Provider</CardTitle>
          <CardDescription>
            Which AI provider chatbot flows use when no override is set on the
            node.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={provider}
            onValueChange={(value) => {
              if (value) setProvider(value);
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
              <SelectItem value="gemini">Google Gemini</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* System prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default System Prompt</CardTitle>
          <CardDescription>
            Defines how the AI behaves in chatbot flows. Individual AI Reply
            nodes can override this.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            placeholder="e.g. You are a friendly customer support agent for Acme Corp. Reply in English. Keep answers under 3 sentences."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* OpenAI */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">OpenAI</CardTitle>
              <CardDescription>
                Used for GPT-4o, GPT-4o Mini, GPT-3.5 Turbo, etc.
              </CardDescription>
            </div>
            {data?.openaiKeySet && (
              <Badge variant="secondary" className="text-xs">
                Key saved
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="openai-key">
              API Key{" "}
              <span className="text-muted-foreground font-normal">
                (leave blank to keep existing)
              </span>
            </Label>
            <div className="relative">
              <Input
                id="openai-key"
                type={showOpenai ? "text" : "password"}
                placeholder={data?.openaiKeySet ? "sk-•••••••••••••••••••••••" : "sk-…"}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowOpenai((v) => !v)}
              >
                {showOpenai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key at{" "}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                platform.openai.com/api-keys
              </a>
            </p>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <Select
              value={openaiModel}
              onValueChange={(value) => {
                if (value) setOpenaiModel(value);
              }}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPENAI_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Gemini */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Google Gemini</CardTitle>
              <CardDescription>
                Used for Gemini 1.5 Flash, Gemini 1.5 Pro, Gemini 2.0, etc.
              </CardDescription>
            </div>
            {data?.geminiKeySet && (
              <Badge variant="secondary" className="text-xs">
                Key saved
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gemini-key">
              API Key{" "}
              <span className="text-muted-foreground font-normal">
                (leave blank to keep existing)
              </span>
            </Label>
            <div className="relative">
              <Input
                id="gemini-key"
                type={showGemini ? "text" : "password"}
                placeholder={data?.geminiKeySet ? "AIza•••••••••••••••••••••" : "AIza…"}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowGemini((v) => !v)}
              >
                {showGemini ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your key at{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                aistudio.google.com/app/apikey
              </a>
            </p>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <Select
              value={geminiModel}
              onValueChange={(value) => {
                if (value) setGeminiModel(value);
              }}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GEMINI_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving…" : "Save AI Settings"}
        </Button>
      </div>
    </div>
  );
}
