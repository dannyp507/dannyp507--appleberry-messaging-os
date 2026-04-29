"use client";

import { useUiStore } from "@/stores/ui-store";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AppleberryIcon } from "@/components/ui/appleberry-icon";
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
  UserCheck,
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
  ChevronRight,
} from "lucide-react";

// ─── Nav definitions ──────────────────────────────────────────────────────────

const mainNav = [
  { href: "/",             label: "Dashboard",   icon: LayoutDashboard },
  { href: "/inbox",        label: "Inbox",       icon: Inbox           },
  { href: "/contacts",     label: "Contacts",    icon: Users           },
  { href: "/subscribers",  label: "Subscribers", icon: UserCheck       },
  { href: "/campaigns",    label: "Campaigns",   icon: Megaphone       },
  { href: "/templates",    label: "Templates",   icon: FileText        },
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
  { href: "/settings",                  label: "Settings",      icon: Settings   },
  { href: "/settings/integrations",     label: "Integrations",  icon: Share2     },
  { href: "/settings/ai",               label: "AI Providers",  icon: Sparkles   },
  { href: "/settings/billing",          label: "Billing",       icon: CreditCard },
  { href: "/settings/api-keys",         label: "API Keys",      icon: Key        },
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
          ? "bg-[#EEF2FF] dark:bg-[rgba(99,102,241,0.15)] text-[#4338CA] dark:text-[#a5b4fc] after:absolute after:left-0 after:top-1/2 after:-translate-y-1/2 after:h-5 after:w-0.5 after:rounded-r-full after:bg-gradient-to-b after:from-[#6366F1] after:to-[#EC4899]"
          : "text-[#6B7280] dark:text-[#8b92a8] hover:bg-[#F3F4F6] dark:hover:bg-[#1e2433] hover:text-[#111827] dark:hover:text-[#f3f4f6]",
      )}
    >
      <Icon
        className={cn(
          "size-[17px] shrink-0 transition-colors",
          active ? "text-[#6366F1]" : "text-[#9CA3AF] dark:text-[#4b5563]",
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
    <p className="mb-0.5 mt-4 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9CA3AF] dark:text-[#4b5563]">
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
        active ? "text-[#6366F1]" : "text-[#9CA3AF] dark:text-[#4b5563] hover:text-[#6B7280] dark:hover:text-[#8b92a8]",
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
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-[#1a1f2e] shadow-[0_1px_4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)]">
            <AppleberryIcon size={22} />
          </div>
          <div>
            <h1 className="text-[15px] font-bold leading-none tracking-tight stitch-text">
              Appleberry
            </h1>
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9CA3AF] dark:text-[#4b5563]">
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
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white stitch-gradient shadow-[0_2px_8px_rgba(99,102,241,0.25)] transition-opacity hover:opacity-90"
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
      <div className="border-t border-[#E5E7EB] dark:border-[#1e2433] px-2.5 py-3">
        <NavItem
          href="/help"
          label="Help & Support"
          icon={HelpCircle}
          active={isActive("/help")}
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
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[#E5E7EB] dark:border-[#1e2433] bg-white/90 dark:bg-[#111420]/95 backdrop-blur-sm md:flex">
        <SidebarContent />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-60 border-[#E5E7EB] dark:border-[#1e2433] bg-white dark:bg-[#111420] p-0"
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
      className="md:hidden text-[#9CA3AF] dark:text-[#8b92a8] hover:text-[#111827] dark:hover:text-[#f3f4f6] hover:bg-[#F3F4F6] dark:hover:bg-[#1e2433]"
      onClick={() => setOpen(true)}
      aria-label="Open menu"
    >
      <Menu className="size-5" />
    </Button>
  );
}
