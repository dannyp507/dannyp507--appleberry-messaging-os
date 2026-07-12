"use client";

import { useState } from "react";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    slug: "whatsapp-starter",
    name: "Starter",
    price: "R399",
    period: "/ month",
    badge: null,
    description: "Perfect for small businesses getting started with WhatsApp automation.",
    features: [
      "1 WhatsApp account",
      "Unlimited outbound messages",
      "Unlimited broadcast campaigns",
      "AI chatbot & autoresponders",
      "Keyword triggers",
      "Contact management",
      "5 team members",
    ],
  },
  {
    slug: "whatsapp-growth",
    name: "Growth",
    price: "R699",
    period: "/ month",
    badge: "Most Popular",
    description: "For growing businesses managing multiple WhatsApp lines.",
    features: [
      "2 WhatsApp accounts",
      "Unlimited outbound messages",
      "Unlimited broadcast campaigns",
      "AI chatbot & autoresponders",
      "Keyword triggers",
      "Contact management",
      "Facebook & Instagram channels",
      "10 team members",
    ],
  },
  {
    slug: "whatsapp-unlimited",
    name: "Unlimited",
    price: "R1 200",
    period: "/ month",
    badge: null,
    description: "Full power for agencies and enterprises with no restrictions.",
    features: [
      "Unlimited WhatsApp accounts",
      "Unlimited outbound messages",
      "Unlimited broadcast campaigns",
      "AI chatbot & autoresponders",
      "Keyword triggers",
      "Contact management",
      "Facebook & Instagram channels",
      "Unlimited team members",
      "White-label ready",
    ],
  },
];

export default function SubscribePage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePay(slug: string) {
    setLoading(slug);
    setError(null);
    try {
      const { data } = await api.get<{ action: string; fields: Record<string, string> }>(
        `/payfast/payment-form?plan=${slug}`,
      );
      // Build a hidden form and POST it — avoids GET URL encoding issues with PayFast
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.action;
      Object.entries(data.fields).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch {
      setError("Could not generate payment link. Please try again.");
      setLoading(null);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] px-4 py-12">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Choose Your Plan</h1>
          <p className="mt-2 text-muted-foreground">
            All plans include unlimited campaigns, AI automation, and chatbot flows.
            Cancel anytime.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isPopular = plan.badge === "Most Popular";
            const isLoading = loading === plan.slug;

            return (
              <Card
                key={plan.slug}
                className={cn(
                  "relative flex flex-col transition-shadow",
                  isPopular
                    ? "border-2 border-[#6366F1] shadow-[0_4px_24px_rgba(99,102,241,0.2)]"
                    : "border border-border",
                )}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-[#6366F1] px-3 py-0.5 text-xs font-semibold text-white shadow">
                      Most Popular
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-4 pt-6">
                  <CardTitle className="text-lg font-semibold">{plan.name}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">{plan.description}</p>
                  <div className="mt-3 flex items-end gap-1">
                    <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                    <span className="mb-1 text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-4">
                  <ul className="flex-1 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#6366F1]" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handlePay(plan.slug)}
                    disabled={loading !== null}
                    className={cn(
                      "mt-2 flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60",
                      isPopular
                        ? "stitch-gradient shadow-[0_2px_8px_rgba(99,102,241,0.35)] hover:opacity-90"
                        : "bg-[#374151] hover:opacity-90 dark:bg-[#1e2433]",
                    )}
                  >
                    {isLoading ? "Redirecting to PayFast…" : `Subscribe — ${plan.price}/mo`}
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {error && (
          <p className="mt-6 rounded-md bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
            {error}
          </p>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Secure recurring billing via PayFast · Cancel anytime · All prices include VAT
        </p>
      </div>
    </div>
  );
}
