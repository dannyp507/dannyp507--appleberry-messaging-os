"use client";

import { api, apiBaseURL, getApiErrorMessage } from "@/lib/api/client";
import type { SessionUser } from "@/stores/auth-store";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { AppleberryIcon } from "@/components/ui/appleberry-icon";
import { cn } from "@/lib/utils";
import { Bot, Inbox, Megaphone, MessageSquare, Zap } from "lucide-react";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  workspaceId: string;
  organizationId: string;
  user: SessionUser;
}

const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1";

const features = [
  {
    icon: MessageSquare,
    label: "Multi-Channel",
    desc: "WhatsApp, Telegram & Facebook in one unified dashboard",
  },
  {
    icon: Bot,
    label: "AI Chatbots",
    desc: "Smart auto-replies with GPT-4 & Gemini built right in",
  },
  {
    icon: Megaphone,
    label: "Bulk Campaigns",
    desc: "Reach thousands of contacts in a single click",
  },
  {
    icon: Inbox,
    label: "Live Inbox",
    desc: "All conversations in one place — assign, resolve, reply",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.accessToken);
  const [hydrated, setHydrated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  useEffect(() => {
    if (hydrated && token) router.replace("/");
  }, [hydrated, token, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
      });
      setSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        workspaceId: data.workspaceId,
        organizationId: data.organizationId,
        user: data.user,
      });
      router.replace("/");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[#9CA3AF]">
        Loading…
      </div>
    );
  }

  if (token) return null;

  return (
    <div className="flex min-h-screen">
      {/* ─── LEFT: Marketing Panel ────────────────────────────────────────── */}
      <div className="relative hidden lg:flex lg:w-[55%] xl:w-[58%] flex-col overflow-hidden bg-[#07090f]">
        {/* Gradient orbs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-32 h-[600px] w-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 65%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 -right-40 h-[500px] w-[500px] -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(236,72,153,0.22) 0%, transparent 65%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 left-1/3 h-[400px] w-[400px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(168,85,247,0.22) 0%, transparent 65%)",
          }}
        />

        {/* Subtle grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative z-10 flex h-full flex-col px-12 py-10 xl:px-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] shadow-lg backdrop-blur-sm">
              <AppleberryIcon size={26} />
            </div>
            <div>
              <p className="text-[16px] font-bold leading-none tracking-tight stitch-text">
                Appleberry
              </p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/30">
                Messaging OS
              </p>
            </div>
          </div>

          {/* Headline */}
          <div className="mt-14 max-w-lg">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5">
              <Zap className="size-3 text-indigo-400" strokeWidth={2.5} />
              <span className="text-xs font-semibold text-indigo-300">
                AI-Powered Business Messaging
              </span>
            </div>

            <h2 className="text-4xl xl:text-[2.75rem] font-extrabold leading-[1.1] tracking-tight text-white">
              One inbox.
              <br />
              <span className="stitch-text">Every channel.</span>
              <br />
              Powered by AI.
            </h2>

            <p className="mt-5 text-[15px] leading-relaxed text-white/50">
              Manage WhatsApp, Telegram, and Facebook Messenger from a single
              dashboard. Automate replies with AI, run bulk campaigns, and
              never miss a customer message again.
            </p>
          </div>

          {/* Feature grid */}
          <div className="mt-10 grid grid-cols-2 gap-3">
            {features.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.035] p-4 backdrop-blur-sm"
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15">
                  <Icon className="size-4 text-indigo-400" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="mt-0.5 text-xs leading-snug text-white/45">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom social proof */}
          <div className="mt-auto flex items-end gap-3 pt-12">
            {/* Trusted by */}
            <div className="flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-5 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2.5">
                  {(
                    [
                      ["#6366f1", "A"],
                      ["#ec4899", "B"],
                      ["#10b981", "C"],
                      ["#f59e0b", "D"],
                    ] as const
                  ).map(([color, letter]) => (
                    <div
                      key={letter}
                      className="flex size-8 items-center justify-center rounded-full border-2 border-[#07090f] text-[11px] font-bold text-white"
                      style={{ background: color }}
                    >
                      {letter}
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">
                    500+ businesses trust us
                  </p>
                  <div className="mt-0.5 flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <span key={s} className="text-amber-400 text-[13px]">
                        ★
                      </span>
                    ))}
                    <span className="ml-1 text-xs text-white/40">5.0 avg rating</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Uptime badge */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-5 backdrop-blur-sm">
              <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                <span className="text-xs font-semibold text-emerald-400">
                  Live
                </span>
              </div>
              <p className="mt-2 text-3xl font-extrabold text-white">98.9%</p>
              <p className="text-xs text-white/40">Uptime SLA</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── RIGHT: Auth Panel ────────────────────────────────────────────── */}
      <div className="flex w-full flex-col items-center justify-center bg-white dark:bg-[#0f1117] px-6 py-12 sm:px-10 lg:w-[45%] xl:w-[42%]">
        {/* Mobile logo — hidden on lg+ (left panel is visible there) */}
        <div className="mb-8 flex flex-col items-center lg:hidden">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-[#E5E7EB] dark:border-[#1e2433] bg-[#F7F8FA] dark:bg-[#1a1f2e] shadow">
            <AppleberryIcon size={30} />
          </div>
          <p className="mt-3 text-lg font-bold stitch-text">
            Appleberry Messaging OS
          </p>
        </div>

        <div className="w-full max-w-sm">
          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-[#111827] dark:text-[#f3f4f6]">
              Welcome back
            </h2>
            <p className="mt-1 text-sm text-[#6B7280] dark:text-[#8b92a8]">
              Sign in to your workspace to continue
            </p>
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-[#374151] dark:text-[#d1d5db]"
              >
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 border-[#E5E7EB] dark:border-[#1e2433] bg-white dark:bg-[#1a1f2e] text-[#111827] dark:text-[#f3f4f6] placeholder:text-[#9CA3AF] dark:placeholder:text-[#4b5563] focus-visible:ring-[#6366f1] focus-visible:border-[#6366f1]"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-[#374151] dark:text-[#d1d5db]"
              >
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 border-[#E5E7EB] dark:border-[#1e2433] bg-white dark:bg-[#1a1f2e] text-[#111827] dark:text-[#f3f4f6] placeholder:text-[#9CA3AF] dark:placeholder:text-[#4b5563] focus-visible:ring-[#6366f1] focus-visible:border-[#6366f1]"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 px-3.5 py-3">
                <span className="material-symbols-outlined shrink-0 mt-0.5 text-[16px] text-red-500">
                  error
                </span>
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg stitch-gradient text-sm font-semibold text-white shadow-[0_2px_12px_rgba(99,102,241,0.35)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <svg
                    className="size-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {googleAuthEnabled && (
            <>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#E5E7EB] dark:bg-[#1e2433]" />
                <span className="text-xs text-[#9CA3AF] dark:text-[#4b5563]">
                  or
                </span>
                <div className="h-px flex-1 bg-[#E5E7EB] dark:bg-[#1e2433]" />
              </div>
              <a
                href={`${apiBaseURL}/auth/google`}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-11 w-full border-[#E5E7EB] dark:border-[#1e2433] bg-white dark:bg-[#1a1f2e] text-[#374151] dark:text-[#d1d5db] hover:bg-[#F3F4F6] dark:hover:bg-[#1e2433] gap-2 font-medium text-sm",
                )}
              >
                <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Continue with Google
              </a>
            </>
          )}

          {/* Register link */}
          <div className="mt-7 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#E5E7EB] dark:bg-[#1e2433]" />
            <span className="text-xs text-[#9CA3AF] dark:text-[#4b5563]">
              New to Appleberry?
            </span>
            <div className="h-px flex-1 bg-[#E5E7EB] dark:bg-[#1e2433]" />
          </div>
          <Link
            href="/register"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "mt-3 h-11 w-full border-[#E5E7EB] dark:border-[#1e2433] bg-transparent text-[#6366f1] dark:text-[#a5b4fc] hover:bg-[#EEF2FF] dark:hover:bg-[rgba(99,102,241,0.08)] font-semibold text-sm",
            )}
          >
            Create a free account
          </Link>

          {/* Footer */}
          <p className="mt-10 text-center text-xs text-[#D1D5DB] dark:text-[#374151]">
            © 2025 Appleberry · All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
}
