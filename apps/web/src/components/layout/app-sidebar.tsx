"use client";

import { useUiStore } from "@/stores/ui-store";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Inbox,
  Users,
  Megaphone,
  FileText,
  GitBranch,
  Tag,
  Bot,
  Smartphone,
  Share2,
  Send,
  QrCode,
  Settings,
  Sparkles,
  CreditCard,
  Key,
  HelpCircle,
  Menu,
  Radio,
  ChevronRight,
} from "lucide-react";

// ─── Nav definitions ──────────────────────────────────────────────────────────

const mainNav = [
  { href: "/",            label: "Dashboard",  icon: LayoutDashboard },
  { href: "/inbox",       label: "Inbox",      icon: Inbox           },
  { href: "/contacts",    label: "Contacts",   icon: Users           },
  { href: "/campaigns",   label: "Campaigns",  icon: Megaphone       },
  { href: "/templates",   label: "Templates",  icon: FileText        },
] satisfies NavEntry[];

const automationNav = [
  { href: "/chatbot",           label: "Chatbot Flows",     icon: GitBranch },
  { href: "/keyword-triggers",  label: "Keyword Triggers",  icon: Tag       },
  { href: "/autoresponder",     label: "Autoresponders",    icon: Bot       },
] satisfies NavEntry[];

const channelsNav = [
  { href: "/whatsapp-accounts",  label: "WhatsApp",         icon: Smartphone },
  { href: "/facebook-pages",     label: "Facebook Pages",   icon: Share2     },
  { href: "/telegram-accounts",  label: "Telegram",         icon: Send       },
  { href: "/link-generator",     label: "Links & QR Codes", icon: QrCode     },
] satisfies NavEntry[];

const settingsNav = [
  { href: "/settings",          label: "Settings",      icon: Settings  },
  { href: "/settings/ai",       label: "AI Providers",  icon: Sparkles  },
  { href: "/settings/billing",  label: "Billing",       icon: CreditCard },
  { href: "/settings/api-keys", label: "API Keys",      icon: Key       },
] satisfies NavEntry[];

// ─── Types ────────────────────────────────────────────────────────────────────

type NavEntry = { href: string; label: string; icon: LucideIcon };

// ─── NavItem ──────────────────────────────────────────────────────────────────

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: NavEntry & { active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
        active
          ? "bg-[#1e2330] text-white after:absolute after:left-0 after:top-1/2 after:-translate-y-1/2 after:h-5 after:w-0.5 after:rounded-r-full after:bg-gradient-to-b after:from-[#6366F1] after:to-[#EC4899]"
          : "text-[#7a7d87] hover:bg-[#1e2330]/70 hover:text-[#d1d3db]",
      )}
    >
      <Icon
        className={cn(
          "size-[17px] shrink-0 transition-colors",
          active ? "text-[#818cf8]" : "text-[#5a5d68]",
        )}
        strokeWidth={active ? 2.25 : 1.75}
      />
      {label}
    </Link>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="mb-0.5 mt-4 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#3e4148]">
      {label}
    </p>
  );
}

// ─── Section label that links to a hub page ───────────────────────────────────

function SectionLinkLabel({
  label,
  href,
  active,
  onClick,
}: {
  label: string;
  href: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group mb-0.5 mt-4 flex items-center justify-between px-3 transition-colors",
        active ? "text-[#6366F1]" : "text-[#3e4148] hover:text-[#5a5d68]",
      )}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.12em]">
        {label}
      </span>
      <ChevronRight
        className={cn(
          "size-3 transition-all duration-150 group-hover:translate-x-0.5",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-60",
        )}
      />
    </Link>
  );
}

// ─── Sidebar content ──────────────────────────────────────────────────────────

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-3" onClick={onNavigate}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg stitch-gradient shadow-[0_0_14px_rgba(99,102,241,0.35)]">
            <span
              className="material-symbols-outlined text-[18px] text-white"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              bolt
            </span>
          </div>
          <div>
            <h1 className="text-[15px] font-bold leading-none tracking-tight stitch-text">
              Appleberry
            </h1>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#3e4148]">
              Messaging OS
            </p>
          </div>
        </Link>
      </div>

      {/* New Campaign CTA */}
      <div className="px-4 pb-2">
        <Link
          href="/campaigns"
          onClick={onNavigate}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white stitch-gradient shadow-[0_4px_14px_-3px_rgba(99,102,241,0.4)] transition-opacity hover:opacity-90"
        >
          <Megaphone className="size-3.5" />
          New Campaign
        </Link>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2.5">
        <nav className="flex flex-col pb-4">
          {/* Main */}
          {mainNav.map(({ href, label, icon }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={isActive(href)}
              onClick={onNavigate}
            />
          ))}

          {/* Automation */}
          <SectionLabel label="Automation" />
          {automationNav.map(({ href, label, icon }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={isActive(href)}
              onClick={onNavigate}
            />
          ))}

          {/* Channels — header links to /channels hub */}
          <SectionLinkLabel
            label="Channels"
            href="/channels"
            active={pathname === "/channels"}
            onClick={onNavigate}
          />
          {channelsNav.map(({ href, label, icon }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={isActive(href)}
              onClick={onNavigate}
            />
          ))}

          {/* Settings */}
          <SectionLabel label="Settings" />
          {settingsNav.map(({ href, label, icon }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={isActive(href)}
              onClick={onNavigate}
            />
          ))}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-[#1e2330] px-2.5 py-3">
        <NavItem
          href="/help"
          label="Help & Support"
          icon={HelpCircle}
          active={false}
          onClick={onNavigate}
        />
      </div>
    </div>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { mobileNavOpen, setMobileNavOpen } = useUiStore();

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[#1a1f2a] bg-[#0f1219] md:flex">
        <SidebarContent />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-60 border-[#1a1f2a] bg-[#0f1219] p-0"
        >
          <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function MobileMenuButton() {
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="md:hidden text-[#7a7d87] hover:text-white hover:bg-[#1e2330]"
      onClick={() => setOpen(true)}
      aria-label="Open menu"
    >
      <Menu className="size-5" />
    </Button>
  );
}
