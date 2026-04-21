"use client";

import { api, getApiErrorMessage } from "@/lib/api/client";
import type { SessionUser } from "@/stores/auth-store";
import { useAuthStore } from "@/stores/auth-store";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface OAuthSessionResponse {
  accessToken: string;
  refreshToken: string;
  workspaceId: string;
  organizationId: string;
  user: SessionUser;
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionToken = searchParams.get("sessionToken");
    if (!sessionToken) {
      setError("Missing Google session token.");
      return;
    }

    let cancelled = false;

    async function exchangeSession() {
      try {
        const { data } = await api.post<OAuthSessionResponse>(
          "/auth/oauth-session",
          { sessionToken },
        );
        if (cancelled) return;
        setSession({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          workspaceId: data.workspaceId,
          organizationId: data.organizationId,
          user: data.user,
        });
        router.replace("/");
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err));
        }
      }
    }

    void exchangeSession();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams, setSession]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Signing you in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ?? "Finishing Google authentication..."}
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold">Signing you in</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Finishing Google authentication...
            </p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
