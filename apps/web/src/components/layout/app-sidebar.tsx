"use client";

import { useUiStore } from "@/stores/ui-store";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/contacts", label: "Contacts", icon: "group" },
  { href: "/campaigns", label: "Campaigns", icon: "send" },
  { href: "/templates", label: "Templates", icon: "layers" },
  { href: "/chatbot", label: "Chatbot", icon: "account_tree" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/whatsapp-accounts", label: "WhatsApp", icon: "cell_tower" },
];

const settingsNav = [
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/settings/billing", label: "Billing", icon: "credit_card" },
  { href: "/settings/api-keys", label: "API Keys", icon: "key" },
];

function NavItem({
  href,
  label,
  icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
        active
          ? "text-white bg-[#262B33]/40 after:absolute after:left-0 after:top-0 after:h-full after:w-0.5 after:rounded-r after:bg-gradient-to-b after:from-[#6366F1] after:to-[#EC4899]"
          : "text-[#a9abb3] hover:text-white hover:bg-[#262B33]/30"
      )}
    >
      <span
        className="material-symbols-outlined text-[20px]"
        style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg stitch-gradient flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.4)] shrink-0">
            <span
              className="material-symbols-outlined text-white text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              bolt
            </span>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight stitch-text leading-none">
              Appleberry
            </h1>
            <p className="text-[10px] text-[#73757d] tracking-widest font-bold mt-0.5">
              MESSAGING OS
            </p>
          </div>
        </Link>
      </div>

      {/* CTA */}
      <div className="px-4 mb-6">
        <Link
          href="/campaigns"
          className="w-full py-2.5 rounded-xl stitch-gradient text-white text-sm font-semibold shadow-lg hover:opacity-90 transition-all flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          New Campaign
        </Link>
      </div>

      {/* Main nav */}
      <ScrollArea className="flex-1 px-3">
        <nav className="flex flex-col gap-0.5">
          {nav.map(({ href, label, icon }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={isActive(href)}
              onClick={onNavigate}
            />
          ))}

          <div className="my-3 border-t border-[#262B33]/30" />

          <p className="px-4 py-1 text-[10px] font-bold text-[#73757d] uppercase tracking-widest">
            Account
          </p>

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

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-[#262B33]/20">
        <NavItem href="/help" label="Help" icon="help" active={false} onClick={onNavigate} />
      </div>
    </div>
  );
}

export function AppSidebar() {
  const { mobileNavOpen, setMobileNavOpen } = useUiStore();

  return (
    <>
      <aside className="hidden md:flex w-64 shrink-0 flex-col h-screen sticky top-0 border-r border-[#262B33]/20 bg-[#151921]/80 backdrop-blur-md">
        <SidebarContent />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-[#151921] border-[#262B33]/20">
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
      className="md:hidden text-[#a9abb3] hover:text-white hover:bg-[#262B33]/30"
      onClick={() => setOpen(true)}
      aria-label="Open menu"
    >
      <Menu className="size-5" />
    </Button>
  );
}
