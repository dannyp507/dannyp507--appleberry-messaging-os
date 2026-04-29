"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { toast } from "@/lib/toast";
import type {
  GoogleIntegrationStatus,
  GoogleSpreadsheet,
  GoogleSheetTab,
  GoogleCalendarItem,
} from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Loader2,
  LogOut,
  Sheet,
  Calendar,
  Plug,
  TestTube2,
  Save,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Field options for lead capture ──────────────────────────────────────────

const AVAILABLE_FIELDS = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "source", label: "Source" },
  { key: "service", label: "Service" },
  { key: "notes", label: "Notes" },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ connected, email }: { connected: boolean; email?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
        connected
          ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
          : "bg-[#F3F4F6] dark:bg-[#1e2433] text-[#6B7280] dark:text-[#8b92a8] border border-[#E5E7EB] dark:border-[#2a3147]",
      )}
    >
      <div
        className={cn(
          "size-1.5 rounded-full",
          connected ? "bg-emerald-500" : "bg-[#9CA3AF]",
        )}
      />
      {connected ? `Connected · ${email}` : "Not connected"}
    </div>
  );
}

// ─── Section card wrapper ─────────────────────────────────────────────────────

function IntegrationCard({
  icon: Icon,
  title,
  description,
  children,
  disabled,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[#E5E7EB] dark:border-[#1e2433] bg-white dark:bg-[#1a1f2e] p-6 shadow-sm",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF] dark:bg-[rgba(99,102,241,0.12)]">
          <Icon className="size-5 text-[#6366f1]" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#111827] dark:text-[#f3f4f6]">{title}</h3>
          <p className="mt-0.5 text-xs text-[#6B7280] dark:text-[#8b92a8]">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

// ─── Google Sheets config panel ───────────────────────────────────────────────

function SheetsConfigPanel({ status }: { status: GoogleIntegrationStatus }) {
  const queryClient = useQueryClient();
  const [spreadsheetId, setSpreadsheetId] = useState(status.sheetsConfig?.sheetId ?? "");
  const [sheetName, setSheetName] = useState(status.sheetsConfig?.sheetName ?? "Leads");
  const [selectedFields, setSelectedFields] = useState<string[]>(
    status.sheetsConfig?.fields ?? ["firstName", "lastName", "phone", "email", "source", "notes"],
  );

  const { data: spreadsheets = [], isLoading: loadingSheets } = useQuery<GoogleSpreadsheet[]>({
    queryKey: qk.googleSpreadsheets,
    queryFn: async () => {
      const { data } = await api.get("/integrations/google-sheets/spreadsheets");
      return data;
    },
    enabled: status.connected,
  });

  const { data: tabs = [], isLoading: loadingTabs } = useQuery<GoogleSheetTab[]>({
    queryKey: qk.googleSheetTabs(spreadsheetId),
    queryFn: async () => {
      const { data } = await api.get(`/integrations/google-sheets/spreadsheets/${spreadsheetId}/tabs`);
      return data;
    },
    enabled: !!spreadsheetId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put("/integrations/google-sheets/config", {
        sheetId: spreadsheetId,
        sheetName,
        fields: selectedFields,
      });
    },
    onSuccess: () => {
      toast.success("Sheet config saved", "Lead capture is now active.");
      void queryClient.invalidateQueries({ queryKey: qk.googleIntegrationStatus });
    },
    onError: (e) => toast.error("Save failed", getApiErrorMessage(e)),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      await api.post("/integrations/google-sheets/test");
    },
    onSuccess: () => toast.success("Test row added", "Check your Google Sheet!"),
    onError: (e) => toast.error("Test failed", getApiErrorMessage(e)),
  });

  const toggleField = (key: string) => {
    setSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key],
    );
  };

  return (
    <div className="space-y-4">
      {/* Spreadsheet picker */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-[#374151] dark:text-[#d1d5db]">
          Spreadsheet
        </Label>
        {loadingSheets ? (
          <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
            <Loader2 className="size-3 animate-spin" /> Loading your spreadsheets…
          </div>
        ) : (
          <select
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            className="h-9 w-full rounded-lg border border-[#E5E7EB] dark:border-[#2a3147] bg-white dark:bg-[#111420] px-3 text-sm text-[#111827] dark:text-[#f3f4f6] focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          >
            <option value="">— Select a spreadsheet —</option>
            {spreadsheets.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <p className="text-[11px] text-[#9CA3AF] dark:text-[#4b5563]">
          Don&apos;t see it?{" "}
          <a
            href="https://sheets.google.com"
            target="_blank"
            rel="noreferrer"
            className="text-[#6366f1] hover:underline inline-flex items-center gap-0.5"
          >
            Create a new sheet <ExternalLink className="size-3" />
          </a>
        </p>
      </div>

      {/* Sheet tab picker */}
      {spreadsheetId && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#374151] dark:text-[#d1d5db]">
            Sheet tab
          </Label>
          <select
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            className="h-9 w-full rounded-lg border border-[#E5E7EB] dark:border-[#2a3147] bg-white dark:bg-[#111420] px-3 text-sm text-[#111827] dark:text-[#f3f4f6] focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          >
            {loadingTabs ? (
              <option>Loading…</option>
            ) : (
              tabs.map((t) => (
                <option key={t.id} value={t.title}>{t.title}</option>
              ))
            )}
          </select>
        </div>
      )}

      {/* Field selection */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-[#374151] dark:text-[#d1d5db]">
          Columns to capture
        </Label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_FIELDS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleField(key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selectedFields.includes(key)
                  ? "border-[#6366f1] bg-[#EEF2FF] dark:bg-[rgba(99,102,241,0.15)] text-[#6366f1] dark:text-[#a5b4fc]"
                  : "border-[#E5E7EB] dark:border-[#2a3147] text-[#6B7280] dark:text-[#8b92a8] hover:border-[#6366f1]/50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[#9CA3AF] dark:text-[#4b5563]">
          Headers are created automatically · Timestamp is always included
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={!spreadsheetId || saveMutation.isPending}
          className="gap-1.5 bg-[#6366f1] hover:bg-[#4f46e5] text-white"
        >
          {saveMutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          Save config
        </Button>
        {status.hasSheets && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="gap-1.5 border-[#E5E7EB] dark:border-[#2a3147] text-[#6B7280] dark:text-[#8b92a8]"
          >
            {testMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <TestTube2 className="size-3.5" />
            )}
            Send test row
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Google Calendar config panel ────────────────────────────────────────────

function CalendarConfigPanel({ status }: { status: GoogleIntegrationStatus }) {
  const queryClient = useQueryClient();
  const [calendarId, setCalendarId] = useState(status.calendarConfig?.calendarId ?? "primary");
  const [businessEmail, setBusinessEmail] = useState(status.calendarConfig?.businessEmail ?? status.email ?? "");
  const [slotDuration, setSlotDuration] = useState(status.calendarConfig?.slotDuration ?? 60);
  const [bookingWindow, setBookingWindow] = useState(status.calendarConfig?.bookingWindowDays ?? 14);

  const { data: calendars = [], isLoading: loadingCalendars } = useQuery<GoogleCalendarItem[]>({
    queryKey: qk.googleCalendars,
    queryFn: async () => {
      const { data } = await api.get("/integrations/google-calendar/calendars");
      return data;
    },
    enabled: status.connected,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put("/integrations/google-calendar/config", {
        calendarId,
        businessEmail,
        slotDuration,
        bookingWindowDays: bookingWindow,
      });
    },
    onSuccess: () => {
      toast.success("Calendar config saved", "Booking system is now active.");
      void queryClient.invalidateQueries({ queryKey: qk.googleIntegrationStatus });
    },
    onError: (e) => toast.error("Save failed", getApiErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      {/* Calendar picker */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-[#374151] dark:text-[#d1d5db]">
          Google Calendar
        </Label>
        {loadingCalendars ? (
          <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
            <Loader2 className="size-3 animate-spin" /> Loading your calendars…
          </div>
        ) : (
          <select
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            className="h-9 w-full rounded-lg border border-[#E5E7EB] dark:border-[#2a3147] bg-white dark:bg-[#111420] px-3 text-sm text-[#111827] dark:text-[#f3f4f6] focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          >
            {calendars.map((c) => (
              <option key={c.id} value={c.id!}>
                {c.summary}{c.primary ? " (Primary)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Business email */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-[#374151] dark:text-[#d1d5db]">
          Business email (added as host to every booking)
        </Label>
        <Input
          type="email"
          value={businessEmail}
          onChange={(e) => setBusinessEmail(e.target.value)}
          placeholder="you@business.com"
          className="h-9 border-[#E5E7EB] dark:border-[#2a3147] bg-white dark:bg-[#111420] text-[#111827] dark:text-[#f3f4f6]"
        />
      </div>

      {/* Slot duration + booking window */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#374151] dark:text-[#d1d5db]">
            Slot duration (min)
          </Label>
          <select
            value={slotDuration}
            onChange={(e) => setSlotDuration(Number(e.target.value))}
            className="h-9 w-full rounded-lg border border-[#E5E7EB] dark:border-[#2a3147] bg-white dark:bg-[#111420] px-3 text-sm text-[#111827] dark:text-[#f3f4f6] focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          >
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#374151] dark:text-[#d1d5db]">
            Booking window (days)
          </Label>
          <select
            value={bookingWindow}
            onChange={(e) => setBookingWindow(Number(e.target.value))}
            className="h-9 w-full rounded-lg border border-[#E5E7EB] dark:border-[#2a3147] bg-white dark:bg-[#111420] px-3 text-sm text-[#111827] dark:text-[#f3f4f6] focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          >
            {[7, 14, 21, 30, 60].map((d) => (
              <option key={d} value={d}>{d} days ahead</option>
            ))}
          </select>
        </div>
      </div>

      <Button
        size="sm"
        onClick={() => saveMutation.mutate()}
        disabled={!businessEmail || saveMutation.isPending}
        className="gap-1.5 bg-[#6366f1] hover:bg-[#4f46e5] text-white"
      >
        {saveMutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Save className="size-3.5" />
        )}
        Save config
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery<GoogleIntegrationStatus>({
    queryKey: qk.googleIntegrationStatus,
    queryFn: async () => {
      const { data } = await api.get("/integrations/google/status");
      return data;
    },
  });

  // Show success toast when Google redirects back
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "google") {
      toast.success("Google connected!", "Your Google account is now linked.");
      window.history.replaceState({}, "", window.location.pathname);
      void queryClient.invalidateQueries({ queryKey: qk.googleIntegrationStatus });
    }
    if (params.get("error") === "google_auth_failed") {
      toast.error("Connection failed", "Could not connect your Google account.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [queryClient]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.get<{ url: string }>("/integrations/google/auth-url");
      return data.url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (e) => toast.error("Error", getApiErrorMessage(e)),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await api.delete("/integrations/google");
    },
    onSuccess: () => {
      toast.success("Disconnected", "Google account unlinked.");
      void queryClient.invalidateQueries({ queryKey: qk.googleIntegrationStatus });
    },
    onError: (e) => toast.error("Error", getApiErrorMessage(e)),
  });

  const connected = status?.connected ?? false;

  return (
    <div className="page-container max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#111827] dark:text-[#f3f4f6]">Integrations</h1>
        <p className="mt-1 text-sm text-[#6B7280] dark:text-[#8b92a8]">
          Connect third-party services to automate lead capture and appointment booking.
        </p>
      </div>

      {/* Google connection card */}
      <div className="rounded-2xl border border-[#E5E7EB] dark:border-[#1e2433] bg-white dark:bg-[#1a1f2e] p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {/* Google G logo */}
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] dark:border-[#2a3147] bg-white dark:bg-[#111420] shadow-sm">
              <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#111827] dark:text-[#f3f4f6]">
                Google Account
              </p>
              <p className="text-xs text-[#6B7280] dark:text-[#8b92a8]">
                Required for Google Sheets and Google Calendar
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isLoading ? (
              <Loader2 className="size-4 animate-spin text-[#9CA3AF]" />
            ) : (
              <StatusBadge connected={connected} email={status?.email} />
            )}

            {connected ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="gap-1.5 border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10"
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <LogOut className="size-3.5" />
                )}
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="gap-1.5 stitch-gradient text-white shadow-[0_2px_8px_rgba(99,102,241,0.25)] hover:opacity-90 transition-opacity"
              >
                {connectMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plug className="size-3.5" />
                )}
                Connect Google
              </Button>
            )}
          </div>
        </div>

        {/* Scopes info */}
        {!connected && (
          <div className="mt-4 rounded-xl border border-[#E5E7EB] dark:border-[#2a3147] bg-[#F9FAFB] dark:bg-[#111420] px-4 py-3">
            <p className="text-xs text-[#6B7280] dark:text-[#8b92a8]">
              <span className="font-semibold text-[#374151] dark:text-[#d1d5db]">Permissions requested: </span>
              View your email address · Read &amp; write Google Sheets · Manage Google Calendar events
            </p>
          </div>
        )}
      </div>

      {/* Sub-integrations — only shown when Google is connected */}
      <div className="space-y-4">
        <IntegrationCard
          icon={Sheet}
          title="Google Sheets — Lead Capture"
          description="Automatically add a row to your spreadsheet whenever a new contact is created or a chatbot flow captures a lead."
          disabled={!connected}
        >
          {connected && status ? (
            <SheetsConfigPanel status={status} />
          ) : (
            <p className="text-xs text-[#9CA3AF] dark:text-[#4b5563]">
              Connect your Google account above to configure lead capture.
            </p>
          )}
        </IntegrationCard>

        <IntegrationCard
          icon={Calendar}
          title="Google Calendar — Booking System"
          description="Check availability and create appointments directly from chatbot flows. Customers pick a time, Appleberry books it."
          disabled={!connected}
        >
          {connected && status ? (
            <CalendarConfigPanel status={status} />
          ) : (
            <p className="text-xs text-[#9CA3AF] dark:text-[#4b5563]">
              Connect your Google account above to configure bookings.
            </p>
          )}
        </IntegrationCard>
      </div>

      {/* Setup guide */}
      {connected && (
        <div className="mt-6 rounded-2xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50 dark:bg-[rgba(99,102,241,0.06)] p-5">
          <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 mb-2">
            💡 How to use in chatbot flows
          </p>
          <ol className="space-y-1 text-xs text-indigo-600 dark:text-indigo-400 list-decimal list-inside">
            <li>Go to <strong>Chatbot Flows</strong> and open or create a flow</li>
            <li>Add <strong>Question</strong> nodes to collect name, phone, email, etc.</li>
            <li>Add a <strong>Save to Google Sheets</strong> action node — it maps your variables to sheet columns</li>
            <li>Add a <strong>Check Calendar Availability</strong> node to let users pick a time slot</li>
            <li>Add a <strong>Create Booking</strong> node to confirm the appointment in Google Calendar</li>
          </ol>
        </div>
      )}
    </div>
  );
}
