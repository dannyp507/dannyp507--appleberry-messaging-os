"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to the console for debugging; no data is lost — this
    // boundary only catches render-time errors on this page.
    console.error("App render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-background shadow-md ring-1 ring-border/60">
        <AlertTriangle className="size-7 text-amber-500" strokeWidth={1.5} />
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Something went wrong on this page
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        This is a display error — your data is safe and nothing was lost. You
        can retry, or refresh the page.
      </p>
      {error?.digest ? (
        <p className="mt-3 font-mono text-xs text-muted-foreground/70">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={reset} className="gap-2">
          <RotateCcw className="size-4" />
          Try again
        </Button>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
        >
          Refresh page
        </Button>
      </div>
    </div>
  );
}
