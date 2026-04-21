import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service – Appleberry",
};

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-[#0f1117] text-[#e2e4e9] flex items-start justify-center px-4 py-16">
      <article className="w-full max-w-2xl">
        {/* Logo */}
        <div className="mb-8 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#6366F1] to-[#EC4899] flex items-center justify-center shadow-lg shrink-0">
            <span className="material-symbols-outlined text-white text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white leading-none">Appleberry</h1>
            <p className="text-[10px] text-[#73757d] tracking-widest font-bold mt-0.5">MESSAGING OS</p>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">Terms of Service</h2>
        <p className="text-sm text-[#73757d] mb-10">Last updated: April 2026</p>

        <div className="space-y-8 text-[#a9abb3] text-sm leading-relaxed">
          <section>
            <h3 className="text-base font-semibold text-white mb-3">1. Acceptance of Terms</h3>
            <p>
              By accessing or using Appleberry Messaging OS (&quot;Appleberry&quot;, &quot;the Service&quot;), you
              agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree, do not
              use the Service.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">2. Description of Service</h3>
            <p>
              Appleberry is a multi-channel business messaging platform that enables users to send
              campaigns, manage inboxes, and automate conversations across WhatsApp, Facebook
              Messenger, Telegram, and other supported channels.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">3. Eligibility</h3>
            <p>
              You must be at least 18 years old and have the legal authority to enter into these
              Terms on behalf of yourself or your organization. By using Appleberry, you represent
              that you meet these requirements.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">4. Acceptable Use</h3>
            <p>You agree <strong className="text-[#e2e4e9]">not</strong> to use Appleberry to:</p>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li>Send spam, unsolicited messages, or bulk messages to people who have not opted in.</li>
              <li>Violate Meta&apos;s Messenger Platform Policy, WhatsApp Business Policy, or Telegram&apos;s Terms of Service.</li>
              <li>Distribute malware, phishing content, or any harmful material.</li>
              <li>Harass, threaten, or deceive recipients.</li>
              <li>Violate any applicable local, national, or international law or regulation.</li>
            </ul>
            <p className="mt-3">
              We reserve the right to suspend or terminate accounts that violate these terms without
              prior notice.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">5. Third-Party Platform Compliance</h3>
            <p>
              When using channel integrations (Facebook Messenger, WhatsApp, Telegram), you are
              solely responsible for complying with the terms and policies of those platforms.
              Appleberry provides technical access to these APIs but does not control their policies
              or availability.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">6. Account Responsibilities</h3>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials
              and for all activities that occur under your account. Notify us immediately at{" "}
              <a href="mailto:daniel.perumal@me.com" className="text-[#6366F1] hover:underline">
                daniel.perumal@me.com
              </a>{" "}
              if you suspect unauthorized access.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">7. Intellectual Property</h3>
            <p>
              All rights, title, and interest in Appleberry (including software, design, and
              trademarks) remain with Appleberry. You are granted a limited, non-exclusive,
              non-transferable license to use the Service for its intended purpose. You retain
              ownership of the content and data you bring to the platform.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">8. Limitation of Liability</h3>
            <p>
              To the maximum extent permitted by law, Appleberry shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages, including loss of
              profits, data, or business opportunities, arising from your use of or inability to
              use the Service.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">9. Disclaimers</h3>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind.
              We do not guarantee uninterrupted access, message delivery, or that the Service will
              be error-free.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">10. Termination</h3>
            <p>
              We may suspend or terminate your access at any time for violation of these Terms or
              for any other reason with reasonable notice. You may terminate your account at any
              time by contacting us.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">11. Changes to Terms</h3>
            <p>
              We reserve the right to modify these Terms at any time. We will notify users of
              material changes via email or in-app notice. Continued use of the Service after
              changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">12. Governing Law</h3>
            <p>
              These Terms are governed by applicable law. Any disputes shall be resolved through
              good-faith negotiation before pursuing formal legal proceedings.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">13. Contact</h3>
            <p>
              Questions about these Terms? Contact us at{" "}
              <a href="mailto:daniel.perumal@me.com" className="text-[#6366F1] hover:underline">
                daniel.perumal@me.com
              </a>.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-[#262B33]/40 text-xs text-[#73757d]">
          &copy; {new Date().getFullYear()} Appleberry Messaging OS
        </div>
      </article>
    </main>
  );
}
