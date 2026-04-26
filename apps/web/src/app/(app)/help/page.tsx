"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import {
  Bot,
  ChevronDown,
  ExternalLink,
  GitBranch,
  HelpCircle,
  Inbox,
  Key,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageSquare,
  Phone,
  QrCode,
  Send,
  Settings,
  Share2,
  Smartphone,
  Sparkles,
  Tag,
  Users,
  FileText,
} from "lucide-react";
import { useState } from "react";

// ─── Feature guides data ──────────────────────────────────────────────────────

const guides = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    color: "text-indigo-500",
    bg: "bg-indigo-50 dark:bg-indigo-950/40",
    summary: "Your real-time overview of messages, campaigns, and activity.",
    steps: [
      "The Dashboard loads automatically when you log in.",
      "View total messages sent, active campaigns, inbox threads, and billing usage at a glance.",
      "All stats update in real time — refresh any time to see the latest numbers.",
      "Use the dashboard to quickly spot if anything looks off (e.g. failed messages or a paused campaign).",
    ],
  },
  {
    icon: Inbox,
    title: "Inbox",
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    summary: "Live two-way chat threads from all connected channels.",
    steps: [
      "All inbound messages from WhatsApp, Telegram, and Facebook land here.",
      "Click any thread to open the conversation and read the full history.",
      "Type a reply in the text box at the bottom and press Send (or Enter).",
      "Change the thread status using the dropdown: Open → Pending → Resolved.",
      "Use the status tabs at the top to filter by Open, Pending, or Resolved threads.",
      "Assign a thread to a team member by clicking the assign button inside the thread.",
    ],
  },
  {
    icon: Users,
    title: "Contacts",
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    summary: "Your CRM — manage every customer in one place.",
    steps: [
      'Click "Add Contact" and fill in First Name, Last Name, Phone (international format e.g. +27821234567), and Email.',
      "Use the search bar to find contacts by name, phone, or email.",
      "Click a contact to view their full profile and conversation history.",
      'Go to Contacts → Groups to create "Contact Groups" — used when sending campaigns.',
      'Click "New Group", name it, then add contacts to the group.',
      "Groups can be reused across multiple campaigns.",
    ],
  },
  {
    icon: Megaphone,
    title: "Campaigns",
    color: "text-pink-500",
    bg: "bg-pink-50 dark:bg-pink-950/40",
    summary: "Bulk message blasts to a contact group using a template.",
    steps: [
      'Click "New Campaign" and fill in: campaign name, which WhatsApp number to send from, the contact group to message, and the message template.',
      "Set the delay between messages (e.g. 2–5 seconds) to avoid WhatsApp spam detection.",
      "Optionally schedule the campaign for a future date/time or set a send window (e.g. daytime only).",
      'Save as Draft first — this does NOT send anything yet.',
      'Press "Start" on the campaign row when you\'re ready to begin sending.',
      'Pause a running campaign at any time by clicking "Pause".',
      'Click "Report" to see how many were sent, failed, or skipped for each campaign.',
      "⚠️ Never run a campaign without a connected WhatsApp number.",
    ],
  },
  {
    icon: FileText,
    title: "Templates",
    color: "text-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    summary: "Reusable message templates with variable placeholders.",
    steps: [
      'Click "New Template" and choose a type: Text, Media (image/video), or Document.',
      'Write your message body. Use {{name}}, {{company}}, etc. as placeholders — these get replaced with real contact data when sending.',
      "For Media templates, upload an image or video file. This will be attached when the template is used in a campaign.",
      "Save the template — it will appear in the list and be available when creating campaigns.",
      "You can edit or delete templates that haven't been used in a running campaign.",
    ],
  },
  {
    icon: Bot,
    title: "Autoresponders (Chatbot Items)",
    color: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    summary: "Keyword-triggered automatic replies — the core of your chatbot.",
    steps: [
      'Go to Autoresponders and click "Add item".',
      "Give it a name (e.g. \"Welcome\"), set keywords (e.g. hi, hello, hey), and choose the match type: EXACT (exact word only) or CONTAINS (anywhere in the message).",
      "Write the response message the bot will send back.",
      'Enable "AI Reply" (violet toggle) to let AI generate a dynamic reply using your system prompt instead of a fixed response.',
      'Enable "Default fallback" (amber toggle) to catch ALL messages that don\'t match any other keyword — perfect for an AI assistant that handles anything.',
      "Only ONE default fallback should exist per WhatsApp account.",
      "Click the power icon on any item to enable/disable it without deleting it.",
      'Use "Import JSON" to bulk-import items from a downloaded starter template.',
    ],
  },
  {
    icon: GitBranch,
    title: "Chatbot Flows",
    color: "text-cyan-500",
    bg: "bg-cyan-50 dark:bg-cyan-950/40",
    summary: "Visual drag-and-drop multi-step conversation builder.",
    steps: [
      'Click "New Flow" and give it a name.',
      "Use the canvas to drag in nodes: Text (sends a message), Question (asks something and waits for a reply), Condition (branches based on the reply), Action (triggers an integration like a webhook or Google Sheet).",
      "Connect nodes by dragging from the output handle of one node to the input of the next.",
      'Click "Save" to keep your changes.',
      'Set the flow status to "Active" when it\'s ready to use.',
      "Link a flow to a Keyword Trigger so it runs automatically when a customer sends the trigger word.",
    ],
  },
  {
    icon: Tag,
    title: "Keyword Triggers",
    color: "text-yellow-500",
    bg: "bg-yellow-50 dark:bg-yellow-950/40",
    summary: "Keywords that launch a Chatbot Flow automatically.",
    steps: [
      'Click "New Trigger" and set the keyword (e.g. "start" or "menu").',
      "Choose the match type: EXACT matches only that word; CONTAINS matches if that word appears anywhere in the message.",
      "Select the action: Start Flow (launches a chatbot flow) or Send Template (sends a message template).",
      "Select which flow or template to trigger.",
      "Save — the trigger is now active for any message received on connected accounts.",
    ],
  },
  {
    icon: Smartphone,
    title: "WhatsApp Accounts",
    color: "text-green-500",
    bg: "bg-green-50 dark:bg-green-950/40",
    summary: "Connect a WhatsApp number via QR code scan.",
    steps: [
      'Go to Channels → WhatsApp and click "Connect via QR".',
      "A QR code will appear on screen.",
      "Open WhatsApp on your phone → tap the three dots (⋮) → Linked Devices → Link a Device.",
      "Scan the QR code with your phone camera.",
      "Once connected, the status turns green and the number appears in the account list.",
      "If the connection drops, the system will try to reconnect automatically. If it can't, return here to re-scan.",
      "⚠️ Use a dedicated WhatsApp number — using a personal number risks getting it banned.",
    ],
  },
  {
    icon: Share2,
    title: "Facebook Pages",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    summary: "Connect a Facebook Page to receive and reply to Messenger messages.",
    steps: [
      'Go to Channels → Facebook Pages and click "Connect Page".',
      "Log in with your Facebook account and grant the required permissions.",
      "Select the Facebook Page you want to connect.",
      "Once connected, Messenger messages from that Page will appear in the Inbox.",
    ],
  },
  {
    icon: Send,
    title: "Telegram Bots",
    color: "text-sky-500",
    bg: "bg-sky-50 dark:bg-sky-950/40",
    summary: "Connect a Telegram bot via BotFather token.",
    steps: [
      "Open Telegram and search for @BotFather.",
      "Send /newbot and follow the prompts to create a bot. You'll receive an API token.",
      'Go to Channels → Telegram and click "Add Telegram Bot".',
      "Paste your API token and click Save.",
      "Once connected, messages sent to your Telegram bot appear in the Inbox.",
    ],
  },
  {
    icon: QrCode,
    title: "Link Generator",
    color: "text-teal-500",
    bg: "bg-teal-50 dark:bg-teal-950/40",
    summary: "Create WhatsApp click-to-chat links and downloadable QR codes.",
    steps: [
      "Enter the WhatsApp phone number (with country code, e.g. +27821234567).",
      "Optionally add a pre-filled message that opens in the chat.",
      'Click "Generate" — a link and QR code will appear.',
      'Use "Copy Link" to share via email, social media, or your website.',
      'Click "Download QR" to save the QR code image for print materials or digital use.',
    ],
  },
  {
    icon: Sparkles,
    title: "AI Providers",
    color: "text-purple-500",
    bg: "bg-purple-50 dark:bg-purple-950/40",
    summary: "Connect OpenAI or Google Gemini to power AI replies.",
    steps: [
      'Go to Settings → AI Providers.',
      "Choose your provider: OpenAI (GPT-4) or Google Gemini.",
      "Paste your API key from the provider's dashboard.",
      "Click Save — a green success toast confirms it was saved.",
      "The AI key is used by Autoresponder items that have \"AI Reply\" enabled.",
      "If the key is invalid, AI replies will fail silently — double-check the key if AI isn't responding.",
    ],
  },
  {
    icon: Key,
    title: "API Keys",
    color: "text-gray-500",
    bg: "bg-gray-50 dark:bg-gray-900/40",
    summary: "Generate keys to integrate Appleberry with external systems.",
    steps: [
      'Go to Settings → API Keys and click "Generate New Key".',
      "Give the key a name (e.g. \"Zapier integration\" or \"Website webhook\").",
      "Copy the key immediately — it won't be shown again in full after you leave the page.",
      "Use this key in the Authorization header of your API requests: Authorization: Bearer YOUR_KEY.",
      "Revoke a key at any time from this page if it's compromised.",
    ],
  },
  {
    icon: Settings,
    title: "Billing & Usage",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    summary: "Track your message usage and plan limits.",
    steps: [
      'Go to Settings → Billing to view your current plan and usage.',
      "The usage bar shows how many messages you've sent this billing period vs. your limit.",
      "If you're approaching your limit, contact support to upgrade your plan.",
      "Campaign sends, AI replies, and manual inbox replies all count toward usage.",
    ],
  },
];

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const faqs = [
  {
    q: "Why is my WhatsApp number showing as disconnected?",
    a: "WhatsApp connections can drop due to phone restarts, app updates, or inactivity. Go to Channels → WhatsApp and click Re-connect to scan a new QR code. Make sure WhatsApp is open on your phone during the scan.",
  },
  {
    q: "My autoresponder isn't replying — what's wrong?",
    a: "Check three things: (1) The chatbot item is Active (green power icon). (2) The WhatsApp account it's assigned to is Connected. (3) The keyword match type — EXACT means the entire message must be that word. Try switching to CONTAINS if you're unsure.",
  },
  {
    q: "Can I use the same WhatsApp number for multiple workspaces?",
    a: "No — a WhatsApp number can only be linked to one active session at a time. Using it in two places will disconnect the first one.",
  },
  {
    q: "Why are my campaign messages not delivering?",
    a: "You need a connected WhatsApp number before starting a campaign. Also check that your contact group has valid phone numbers (international format, e.g. +27821234567) and that your template doesn't contain prohibited content.",
  },
  {
    q: "How does the Default Fallback autoresponder work?",
    a: "It catches any inbound message that doesn't match any other keyword rule. If you enable AI Reply on it with a business system prompt, it becomes your always-on AI assistant. Only one default fallback should exist per account.",
  },
  {
    q: "What AI providers are supported?",
    a: "OpenAI (GPT-4o, GPT-4, GPT-3.5) and Google Gemini. Add your API key under Settings → AI Providers. You're billed directly by the AI provider based on usage.",
  },
  {
    q: "How do I add variables like {{name}} to a template?",
    a: 'In the template body, type {{name}}, {{company}}, or any custom field name in double curly braces. When the template is sent in a campaign, those placeholders are replaced with the contact\'s actual data.',
  },
  {
    q: "Is there a limit on how many messages I can send?",
    a: "Yes — limits depend on your plan. Check Settings → Billing to see your current usage. WhatsApp also enforces its own messaging policies, so very high volumes may require a WhatsApp Business API account.",
  },
];

// ─── Guide card ───────────────────────────────────────────────────────────────

function GuideCard({
  icon: Icon,
  title,
  color,
  bg,
  summary,
  steps,
}: (typeof guides)[number]) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${bg}`}>
          <Icon className={`size-4.5 ${color}`} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{summary}</p>
        </div>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border/60 px-4 pb-4 pt-3">
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="text-muted-foreground leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─── FAQ item ─────────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-medium text-sm">{q}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-border/60 px-4 pb-4 pt-3">
          <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !subject || !message) {
      toast.error("Please fill in all fields");
      return;
    }
    setSending(true);
    try {
      await api.post("/support/contact", { name, email, subject, message });
      toast.success("Message sent! We'll get back to you shortly.");
      setName(""); setEmail(""); setSubject(""); setMessage("");
    } catch {
      toast.error("Couldn't send your message. Please email us directly.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page-container space-y-10">
      <PageHeader
        title="Help & Support"
        description="Guides, FAQs, and direct support for Appleberry Messaging OS."
      />

      {/* ── Contact cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Email */}
        <a
          href="mailto:Appleberrycare246@gmail.com"
          className="group flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/40">
            <Mail className="size-5 text-indigo-500" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email Support</p>
            <p className="text-sm font-medium group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              Appleberrycare246@gmail.com
            </p>
          </div>
          <ExternalLink className="ml-auto size-3.5 text-muted-foreground/40 group-hover:text-indigo-400 transition-colors" />
        </a>

        {/* WhatsApp */}
        <a
          href="https://wa.me/27828979556"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
            <MessageSquare className="size-5 text-emerald-500" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">WhatsApp Support</p>
            <p className="text-sm font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              +27 82 897 9556
            </p>
          </div>
          <ExternalLink className="ml-auto size-3.5 text-muted-foreground/40 group-hover:text-emerald-400 transition-colors" />
        </a>

        {/* Response time */}
        <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
            <Phone className="size-5 text-amber-500" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Response Time</p>
            <p className="text-sm font-medium">Usually within a few hours</p>
            <p className="text-xs text-muted-foreground">Mon–Fri, business hours</p>
          </div>
        </div>
      </div>

      {/* ── Feature guides ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <HelpCircle className="size-5 text-indigo-500" />
          <h2 className="text-lg font-semibold">Feature Guides</h2>
          <Badge variant="secondary" className="rounded-lg">{guides.length} features</Badge>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Click any feature to expand step-by-step instructions.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {guides.map((g) => (
            <GuideCard key={g.title} {...g} />
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <MessageSquare className="size-5 text-indigo-500" />
          <h2 className="text-lg font-semibold">Frequently Asked Questions</h2>
        </div>
        <div className="space-y-2">
          {faqs.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      {/* ── Contact form ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Send className="size-5 text-indigo-500" />
          <h2 className="text-lg font-semibold">Send Us a Message</h2>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Can&apos;t find what you need? Fill in the form below and we&apos;ll get back to you.
        </p>

        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
        >
          <div className="grid gap-5 p-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="help-name">Your name</Label>
              <Input
                id="help-name"
                placeholder="Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="help-email">Email address</Label>
              <Input
                id="help-email"
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl"
                required
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="help-subject">Subject</Label>
              <Input
                id="help-subject"
                placeholder="e.g. Campaign not sending, QR code not loading…"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="rounded-xl"
                required
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="help-message">Message</Label>
              <Textarea
                id="help-message"
                placeholder="Describe what you were doing, what happened, and what you expected to happen. The more detail, the faster we can help."
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="rounded-xl resize-none"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border/60 bg-muted/30 px-6 py-4">
            <p className="text-xs text-muted-foreground">
              Or email us directly at{" "}
              <a
                href="mailto:Appleberrycare246@gmail.com"
                className="text-indigo-500 hover:underline"
              >
                Appleberrycare246@gmail.com
              </a>
            </p>
            <Button
              type="submit"
              disabled={sending}
              className="rounded-xl shadow-sm"
            >
              {sending ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
