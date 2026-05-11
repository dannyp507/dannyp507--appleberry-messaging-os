"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { toast } from "@/lib/toast";
import type { BrandSettings } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Save } from "lucide-react";

// ─── Field config ─────────────────────────────────────────────────────────────

interface FieldDef {
  key: keyof BrandSettings;
  label: string;
  placeholder: string;
  multiline?: boolean;
  hint?: string;
}

const FIELDS: FieldDef[] = [
  {
    key: "businessName",
    label: "Business Name",
    placeholder: "e.g. Coastal Repair Co.",
  },
  {
    key: "industry",
    label: "Industry",
    placeholder: "e.g. Mobile Phone Repairs, E-commerce, Automotive",
  },
  {
    key: "toneOfVoice",
    label: "Tone of Voice",
    placeholder: "e.g. Friendly and professional. Casual but knowledgeable. Avoid jargon.",
    multiline: true,
  },
  {
    key: "productsServices",
    label: "Products & Services",
    placeholder: "e.g. Screen repairs, battery replacements, water damage recovery, accessories",
    multiline: true,
  },
  {
    key: "faqs",
    label: "FAQs",
    placeholder: "Q: How long does a screen repair take? A: Same-day repairs available.\nQ: Do you offer warranty? A: Yes, 90 days on all repairs.",
    multiline: true,
    hint: "Common questions & answers the AI can reference",
  },
  {
    key: "businessHours",
    label: "Business Hours",
    placeholder: "e.g. Mon–Fri 8am–6pm, Sat 9am–3pm, Closed Sundays",
  },
  {
    key: "contactDetails",
    label: "Contact Details",
    placeholder: "Phone: +27 82 555 1234 | Email: hello@business.com | Address: 12 Main St",
    multiline: true,
  },
  {
    key: "websiteUrl",
    label: "Website / Booking Link",
    placeholder: "https://www.yourbusiness.com",
  },
  {
    key: "wordsToUse",
    label: "Words / Phrases to Use",
    placeholder: "e.g. 'Same-day', 'quality guarantee', 'certified technician', 'quick turnaround'",
  },
  {
    key: "wordsToAvoid",
    label: "Words / Phrases to Avoid",
    placeholder: "e.g. 'cheap', 'problem', 'broken', competitor names",
  },
  {
    key: "escalationInstructions",
    label: "Escalation Instructions",
    placeholder: "If the customer is angry or the issue is complex, ask them to call us directly on +27 82 555 1234.",
    multiline: true,
    hint: "Tell the AI when and how to escalate to a human",
  },
  {
    key: "customInstructions",
    label: "Custom AI Instructions",
    placeholder: "Always end replies with a call to action. Never promise specific prices in public replies. Always invite the customer to DM for a quote.",
    multiline: true,
    hint: "Any extra rules for how the AI should behave",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrandSettingsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: qk.brandSettings,
    queryFn: async () => {
      const { data } = await api.get<BrandSettings>("/brand-settings");
      return data;
    },
  });

  const [form, setForm] = useState<BrandSettings>({
    businessName: null,
    industry: null,
    toneOfVoice: null,
    productsServices: null,
    faqs: null,
    businessHours: null,
    contactDetails: null,
    websiteUrl: null,
    wordsToUse: null,
    wordsToAvoid: null,
    escalationInstructions: null,
    customInstructions: null,
  });

  // Sync form when data arrives
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put("/brand-settings", form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.brandSettings });
      toast.success("Brand settings saved");
    },
    onError: () => toast.error("Failed to save brand settings"),
  });

  const setField = (key: keyof BrandSettings, value: string) =>
    setForm((f) => ({ ...f, [key]: value || null }));

  if (isLoading) {
    return (
      <div className="page-container flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-[#9CA3AF]" />
      </div>
    );
  }

  return (
    <div className="page-container max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="size-5 text-violet-400" />
            <h2 className="text-2xl font-bold text-[#111827] dark:text-[#f3f4f6]">
              Brand AI Settings
            </h2>
          </div>
          <p className="text-sm text-[#6B7280]">
            Teach the AI about your business so it can generate on-brand replies to Facebook
            comments. These settings apply to all AI-enabled automations in this workspace.
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="stitch-gradient text-white border-0 text-sm shrink-0"
        >
          {saveMutation.isPending ? (
            <><Loader2 className="size-3.5 mr-2 animate-spin" />Saving…</>
          ) : (
            <><Save className="size-3.5 mr-2" />Save Settings</>
          )}
        </Button>
      </div>

      {/* How it works */}
      <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3 text-sm text-violet-600 dark:text-violet-300 space-y-1">
        <p className="font-semibold">How AI replies work</p>
        <p className="text-xs opacity-80">
          When a comment automation has AI replies enabled, the AI uses these brand settings to
          generate a contextual reply. Individual automations can override this with their own
          system prompt. Replies use your workspace&rsquo;s configured AI provider (Settings → AI Providers).
        </p>
      </div>

      {/* Fields */}
      <div className="space-y-6">
        {FIELDS.map(({ key, label, placeholder, multiline, hint }) => (
          <div key={key} className="space-y-1.5">
            <Label className="text-sm font-semibold text-[#374151] dark:text-[#d1d5db]">
              {label}
            </Label>
            {hint && <p className="text-xs text-[#9CA3AF]">{hint}</p>}
            {multiline ? (
              <Textarea
                value={form[key] ?? ""}
                onChange={(e) => setField(key, e.target.value)}
                placeholder={placeholder}
                rows={3}
                className="text-sm"
              />
            ) : (
              <Input
                value={form[key] ?? ""}
                onChange={(e) => setField(key, e.target.value)}
                placeholder={placeholder}
                className="text-sm"
              />
            )}
          </div>
        ))}
      </div>

      {/* Save bottom */}
      <div className="flex justify-end pb-6">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="stitch-gradient text-white border-0 text-sm"
        >
          {saveMutation.isPending ? (
            <><Loader2 className="size-3.5 mr-2 animate-spin" />Saving…</>
          ) : (
            <><Save className="size-3.5 mr-2" />Save Brand Settings</>
          )}
        </Button>
      </div>
    </div>
  );
}
