"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default function SubscribeSuccessPage() {
  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="size-8 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Received!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Thank you for subscribing to WhatsApp Starter. Your account will be
            activated within 1 business day once your payment is confirmed.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          You will receive an email confirmation once your workspace is live.
          If you have any questions, contact{" "}
          <a
            href="mailto:support@appleberry.app"
            className="font-medium text-[#6366F1] hover:underline"
          >
            support@appleberry.app
          </a>
          .
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-[#F3F4F6] dark:bg-[#1e2433] px-5 py-2.5 text-sm font-medium text-[#374151] dark:text-[#d1d5db] transition-colors hover:bg-[#E5E7EB] dark:hover:bg-[#252b3b]"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
