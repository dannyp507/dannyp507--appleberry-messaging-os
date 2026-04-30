"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ChatbotNodeType } from "@/lib/api/types";

export function NodeConfigForm({
  nodeType,
  config,
  onChange,
}: {
  nodeType: ChatbotNodeType;
  config: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const field = (key: string, label: string, placeholder: string, textarea = false) => (
    <div className="grid gap-1.5" key={key}>
      <Label className="text-xs">{label}</Label>
      {textarea ? (
        <Textarea
          rows={3}
          className="text-xs resize-none"
          value={config[key] ?? ""}
          onChange={(e) => onChange(key, e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <Input
          className="text-xs h-8"
          value={config[key] ?? ""}
          onChange={(e) => onChange(key, e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );

  switch (nodeType) {
    case "TEXT":
      return (
        <div className="space-y-2">
          {field("text", "Message text", "Hello {{name}}, how can we help today?", true)}
          <p className="text-[10px] text-muted-foreground">Use {"{{variable}}"} to insert captured answers.</p>
        </div>
      );

    case "BUTTONS": {
      const b1 = config.btn1?.trim() ?? "";
      const b2 = config.btn2?.trim() ?? "";
      const b3 = config.btn3?.trim() ?? "";
      const toId = (l: string) => l ? `btn_${l.toLowerCase().replace(/\s+/g, "_")}` : "";
      const ids = [b1, b2, b3].map(toId).filter(Boolean);
      return (
        <div className="space-y-2">
          {field("prompt", "Message / question", "How can we help you today?")}
          {field("btn1", "Button 1 (required, max 20 chars)", "Support")}
          {field("btn2", "Button 2 (optional)", "Sales")}
          {field("btn3", "Button 3 (optional)", "Other")}
          {ids.length > 0 && (
            <div className="rounded-md bg-muted/60 border px-2.5 py-2 space-y-0.5">
              <p className="text-[10px] font-semibold text-muted-foreground">Button IDs (use in CONDITION node):</p>
              {ids.map((id) => (
                <p key={id} className="text-[10px] font-mono text-primary">{id}</p>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Add a <strong>CONDITION</strong> node after this checking <code>lastInput</code>.
          </p>
        </div>
      );
    }

    case "LIST": {
      const rows = [1,2,3,4,5,6,7,8,9,10].map((i) => ({
        title: config[`row${i}title`]?.trim() ?? "",
        desc:  config[`row${i}desc`]?.trim() ?? "",
      }));
      const filledIds = rows.map((r, i) => r.title ? `row_${i+1}` : "").filter(Boolean);
      return (
        <div className="space-y-2">
          {field("prompt", "Message prompt", "Please select an option:")}
          {field("buttonText", "Button label", "See Options")}
          {field("sectionTitle", "Section heading (optional)", "Options")}
          <p className="text-[10px] font-semibold text-muted-foreground pt-1">Rows (up to 10):</p>
          {[1,2,3,4,5,6,7,8,9,10].map((i) => (
            <div key={i} className="grid grid-cols-2 gap-1">
              {field(`row${i}title`, `Row ${i} title`, `Option ${i}`)}
              {field(`row${i}desc`,  `Row ${i} subtitle`, "")}
            </div>
          ))}
          {filledIds.length > 0 && (
            <div className="rounded-md bg-muted/60 border px-2.5 py-2 space-y-0.5">
              <p className="text-[10px] font-semibold text-muted-foreground">Row IDs (use in CONDITION after this):</p>
              {filledIds.map((id) => (
                <p key={id} className="text-[10px] font-mono text-primary">{id}</p>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Add a <strong>CONDITION</strong> node after this checking <code>lastInput</code>.
          </p>
        </div>
      );
    }

    case "QUESTION":
      return (
        <div className="space-y-2">
          {field("prompt", "Question to ask", "What is your name?")}
          {field("variableKey", "Save answer as variable", "name")}
          <p className="text-[10px] text-muted-foreground">The reply will be saved as {"{{variableKey}}"} for later nodes.</p>
        </div>
      );

    case "CONDITION":
      return (
        <div className="space-y-2">
          {field("variableKey", "Variable to check", "lastInput")}
          <p className="text-[10px] text-muted-foreground">Connect multiple outgoing edges — set the condition value on each edge. Leave blank for the fallback branch.</p>
        </div>
      );

    case "AI_REPLY":
      return (
        <div className="space-y-2">
          {field("systemPrompt", "AI system prompt", "You are a helpful assistant for [Business Name]. Answer questions politely and keep replies under 200 characters.", true)}
          <p className="text-[10px] text-muted-foreground">Uses your configured AI provider (Gemini or OpenAI). The customer&apos;s last message is sent as the user prompt.</p>
        </div>
      );

    case "SAVE_TO_SHEET":
      return (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Auto-saves: <strong>firstName, lastName, phone, email, timestamp</strong>. Add extra fields below.
          </p>
          {field("fields.service", "Extra field: service", "{{service}}")}
          {field("fields.notes",   "Extra field: notes",   "{{notes}}")}
          <p className="text-[10px] text-muted-foreground">Leave extra fields blank to skip. Google Sheets must be connected in Settings → Integrations.</p>
        </div>
      );

    case "CHECK_CALENDAR":
      return (
        <div className="space-y-2">
          {field("dateVariable", "Variable holding the date (YYYY-MM-DD)", "date")}
          {field("hourVariable", "Variable holding the hour (0–23)", "hour")}
          {field("resultVariable", "Save result to variable", "availability")}
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            After this: <code>{"{{availabilityMessage}}"}</code> = human-readable reply,
            <code>{"{{availableDate}}"}</code> and <code>{"{{availableHour}}"}</code> = confirmed slot.
          </p>
        </div>
      );

    case "CREATE_BOOKING":
      return (
        <div className="space-y-2">
          {field("nameVariable",    "Customer name variable",     "name")}
          {field("emailVariable",   "Customer email variable",    "email")}
          {field("serviceVariable", "Service/reason variable",    "service")}
          {field("dateVariable",    "Date variable (YYYY-MM-DD)", "availableDate")}
          {field("hourVariable",    "Hour variable (0–23)",        "availableHour")}
          {field("resultVariable",  "Save booking link to",        "bookingLink")}
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Sends a Google Calendar invite. Google Calendar must be connected in Settings → Integrations.
          </p>
        </div>
      );

    case "MEDIA":
      return (
        <div className="space-y-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Media type</Label>
            <select
              value={config.mediaType ?? "image"}
              onChange={(e) => onChange("mediaType", e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="image">🖼️ Image</option>
              <option value="video">🎬 Video</option>
              <option value="audio">🎵 Audio</option>
              <option value="document">📎 Document / File</option>
            </select>
          </div>
          {field("url", "Media URL (publicly accessible)", "https://example.com/image.jpg")}
          {field("caption", "Caption (optional)", "Here's our menu! Use {{name}} to personalise.", true)}
          <p className="text-[10px] text-muted-foreground">URL must be publicly accessible. Images: .jpg/.png, video: .mp4.</p>
        </div>
      );

    case "TAG_CONTACT":
    case "WEBHOOK":
      return (
        <div className="space-y-2">
          {field("tagName", "Tag name to apply", "booked")}
          <p className="text-[10px] text-muted-foreground">Creates the tag if it doesn&apos;t exist. Flow continues to the next node.</p>
        </div>
      );

    case "HUMAN_HANDOFF":
      return (
        <div className="space-y-2">
          {field("message", "Message to send before handoff", "👤 Connecting you with a team member. Please hold on!", true)}
          <p className="text-[10px] text-muted-foreground">
            The chatbot stops and the inbox thread is marked <strong>Open</strong>. Leave blank to hand off silently.
          </p>
        </div>
      );

    case "END":
      return (
        <div className="space-y-2">
          {field("message", "Goodbye message (optional)", "Thanks for chatting! Have a great day 👋", true)}
          <p className="text-[10px] text-muted-foreground">
            Ends the flow. Message is sent before closing. Leave blank to end silently.
          </p>
        </div>
      );

    default:
      return (
        <p className="text-xs text-muted-foreground">No configuration needed for this node type.</p>
      );
  }
}
