import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion Instructions – Appleberry",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-[#0f1117] text-[#e2e4e9] flex items-start justify-center px-4 py-16">
      <article className="w-full max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#6366F1] to-[#EC4899] flex items-center justify-center shadow-lg shrink-0">
            <span
              className="material-symbols-outlined text-white text-xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              bolt
            </span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white leading-none">
              Appleberry
            </h1>
            <p className="text-[10px] text-[#73757d] tracking-widest font-bold mt-0.5">
              MESSAGING OS
            </p>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">
          Data Deletion Instructions
        </h2>
        <p className="text-sm text-[#73757d] mb-8">Last updated: April 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-4 text-[#a9abb3] leading-relaxed">
          <p>
            If you want your data deleted from Appleberry, please email{" "}
            <a
              href="mailto:daniel.perumal@me.com"
              className="text-[#6366F1] hover:underline"
            >
              daniel.perumal@me.com
            </a>{" "}
            with the subject line{" "}
            <strong className="text-[#e2e4e9]">Data Deletion Request</strong>{" "}
            and include your Facebook profile name and any relevant contact
            details.
          </p>
          <p>
            We will review your request and delete applicable stored data within
            a reasonable period, subject to legal and operational requirements.
          </p>
          <p>
            If you connected through Facebook Messenger, you may also remove the
            connection and contact us directly to request deletion of associated
            records.
          </p>
        </div>

        <div className="mt-12 pt-8 border-t border-[#262B33]/40 text-xs text-[#73757d]">
          &copy; {new Date().getFullYear()} Appleberry Messaging OS
        </div>
      </article>
    </main>
  );
}
