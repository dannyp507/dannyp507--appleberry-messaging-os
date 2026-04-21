import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy – Appleberry",
};

export default function PrivacyPolicyPage() {
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

        <h2 className="text-2xl font-bold text-white mb-2">Privacy Policy</h2>
        <p className="text-sm text-[#73757d] mb-10">Last updated: April 2026</p>

        <div className="space-y-8 text-[#a9abb3] text-sm leading-relaxed">
          <section>
            <h3 className="text-base font-semibold text-white mb-3">1. Introduction</h3>
            <p>
              Appleberry Messaging OS (&quot;Appleberry&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates a
              multi-channel business messaging platform. This Privacy Policy explains how we collect,
              use, and protect information when you use our services, including integrations with
              Facebook Messenger, WhatsApp, Telegram, and other messaging channels.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">2. Information We Collect</h3>
            <ul className="list-disc list-inside space-y-2">
              <li><strong className="text-[#e2e4e9]">Account information:</strong> name, email address, and password when you register.</li>
              <li><strong className="text-[#e2e4e9]">Contact data:</strong> names, phone numbers, and email addresses of contacts you import or interact with through the platform.</li>
              <li><strong className="text-[#e2e4e9]">Message content:</strong> messages sent and received through connected channels for the purpose of delivering your campaigns and inbox conversations.</li>
              <li><strong className="text-[#e2e4e9]">Facebook data:</strong> when you connect a Facebook Page, we receive your Page access token, Page name, Page ID, and messages exchanged via Messenger.</li>
              <li><strong className="text-[#e2e4e9]">Usage data:</strong> log data, IP addresses, browser type, and pages visited for analytics and security purposes.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">3. How We Use Your Information</h3>
            <ul className="list-disc list-inside space-y-2">
              <li>To deliver, maintain, and improve the Appleberry platform.</li>
              <li>To send messages on your behalf through connected channels (WhatsApp, Messenger, Telegram).</li>
              <li>To provide customer support and respond to inquiries.</li>
              <li>To detect fraud, abuse, and security incidents.</li>
              <li>To comply with legal obligations.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">4. Sharing of Information</h3>
            <p>
              We do not sell your personal information. We may share data with:
            </p>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li><strong className="text-[#e2e4e9]">Service providers:</strong> hosting, database, and infrastructure partners who process data on our behalf under confidentiality agreements.</li>
              <li><strong className="text-[#e2e4e9]">Platform partners:</strong> Meta (Facebook/Instagram), WhatsApp, and Telegram as required to deliver messages through their APIs.</li>
              <li><strong className="text-[#e2e4e9]">Legal authorities:</strong> when required by law or to protect our rights.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">5. Facebook Messenger Data</h3>
            <p>
              When you connect a Facebook Page, Appleberry receives and stores messages exchanged
              between your Page and its users via the Messenger Platform. This data is used solely
              to power your inbox and automated responses. We adhere to Meta&apos;s Platform Terms
              and only request permissions necessary to provide the service.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">6. Data Retention</h3>
            <p>
              We retain your data for as long as your account is active or as needed to provide
              services. You may request deletion of your data at any time (see Section 8).
              Message logs and contact records are deleted within 30 days of a verified deletion
              request, unless retention is required by law.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">7. Security</h3>
            <p>
              We implement industry-standard security measures including TLS encryption in transit,
              encrypted storage, access controls, and regular security reviews. No method of
              transmission over the internet is 100% secure; we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">8. Your Rights &amp; Data Deletion</h3>
            <p>
              You have the right to access, correct, or delete your personal data. To submit a
              data deletion request, please email{" "}
              <a href="mailto:daniel.perumal@me.com" className="text-[#6366F1] hover:underline">
                daniel.perumal@me.com
              </a>{" "}
              with the subject line <strong className="text-[#e2e4e9]">Data Deletion Request</strong>.
              Include your account email or Facebook profile name and we will process your request
              within a reasonable period.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">9. Cookies</h3>
            <p>
              Appleberry uses session cookies required for authentication and platform functionality.
              We do not use third-party advertising cookies.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">10. Changes to This Policy</h3>
            <p>
              We may update this Privacy Policy from time to time. We will notify registered users
              of material changes via email or an in-app notice. Continued use of Appleberry after
              changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-white mb-3">11. Contact</h3>
            <p>
              For privacy-related questions, contact us at{" "}
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
