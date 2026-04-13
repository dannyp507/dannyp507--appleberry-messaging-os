"use client";

import { api } from "@/lib/api/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";

interface UsageSummary {
  period: string;
  messages: { used: number; limit: number };
  campaigns: { used: number; limit: number };
  contacts: { used: number; limit: number };
  whatsappAccounts: { used: number; limit: number };
  chatbotFlows: { used: number; limit: number };
  teamMembers: { used: number; limit: number };
  apiRequests: { used: number; limit: number };
  features: {
    hasAdvancedAnalytics: boolean;
    hasAiFeatures: boolean;
    hasApiAccess: boolean;
    hasWhiteLabel: boolean;
    hasBaileysProvider: boolean;
  };
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const unlimited = limit < 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const warn = !unlimited && pct >= 80;
  const over = !unlimited && pct >= 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={`text-xs ${over ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
          {unlimited
            ? `${used.toLocaleString()} / Unlimited`
            : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
          {!unlimited && ` (${pct}%)`}
        </span>
      </div>
      {!unlimited && (
        <Progress
          value={pct}
          className={`h-2 ${over ? "[&>div]:bg-destructive" : warn ? "[&>div]:bg-amber-500" : ""}`}
        />
      )}
    </div>
  );
}

function FeatureRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm">{label}</span>
      {enabled ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}

export default function BillingPage() {
  const { data, isLoading } = useQuery<UsageSummary>({
    queryKey: ["billing", "usage"],
    queryFn: async () => {
      const { data } = await api.get("/billing/usage");
      return data;
    },
  });

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Loading usage…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Billing &amp; Usage</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Current period:{" "}
          <Badge variant="secondary" className="font-mono text-xs">
            {data.period}
          </Badge>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage This Month</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsageBar label="Outbound Messages" used={data.messages.used} limit={data.messages.limit} />
          <UsageBar label="Campaigns Run" used={data.campaigns.used} limit={data.campaigns.limit} />
          <UsageBar label="Contacts" used={data.contacts.used} limit={data.contacts.limit} />
          <UsageBar label="WhatsApp Accounts" used={data.whatsappAccounts.used} limit={data.whatsappAccounts.limit} />
          <UsageBar label="Chatbot Flows" used={data.chatbotFlows.used} limit={data.chatbotFlows.limit} />
          <UsageBar label="Team Members" used={data.teamMembers.used} limit={data.teamMembers.limit} />
          <UsageBar label="API Requests" used={data.apiRequests.used} limit={data.apiRequests.limit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan Features</CardTitle>
        </CardHeader>
        <CardContent>
          <FeatureRow label="Advanced Analytics" enabled={data.features.hasAdvancedAnalytics} />
          <FeatureRow label="AI Features (Campaign assistant, smart replies)" enabled={data.features.hasAiFeatures} />
          <FeatureRow label="API Access" enabled={data.features.hasApiAccess} />
          <FeatureRow label="WhatsApp Unofficial Sessions (Baileys)" enabled={data.features.hasBaileysProvider} />
          <FeatureRow label="White-label Branding" enabled={data.features.hasWhiteLabel} />
        </CardContent>
      </Card>
    </div>
  );
}
