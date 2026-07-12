"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { DashboardSkeleton } from "@/components/shell/page-skeletons";

// Paths that don't require a paid subscription
const EXEMPT_PATHS = ["/subscribe", "/settings/billing", "/help"];

export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const exempt = EXEMPT_PATHS.some((p) => pathname.startsWith(p));

  const { data, isLoading } = useQuery({
    queryKey: ["billing", "usage"],
    queryFn: async () => {
      const { data } = await api.get("/billing/usage");
      return data as { plan: { slug: string; name: string; status: string } };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !exempt,
  });

  const needsSubscription =
    !isLoading &&
    data &&
    (data.plan.slug === "free" || data.plan.status === "CANCELED");

  useEffect(() => {
    if (exempt) return;
    if (needsSubscription) router.replace("/subscribe");
  }, [exempt, needsSubscription, router]);

  // On exempt pages (subscribe, billing, help) always render
  if (exempt) return <>{children}</>;

  // While checking plan, show skeleton
  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-muted/25">
        <DashboardSkeleton />
      </div>
    );
  }

  // Not subscribed → redirect happening, don't flash content
  if (needsSubscription) return null;

  return <>{children}</>;
}
