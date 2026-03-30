import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { SITE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy | Promptly",
  description: "How Promptly collects, uses, and shares information when you use the Promptly website and Chrome extension."
};

const LAST_UPDATED = "March 30, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-violetDark text-ink">
      <Navbar />
      <article className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:pt-14">
        <p className="text-sm font-medium text-violet-200/70">
          <Link href="/" className="text-violet-200 hover:text-white">
            Home
          </Link>
          <span className="mx-2 opacity-60">/</span>
          Privacy
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-violet-200/75">Last updated: {LAST_UPDATED}</p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-violet-100/90">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Introduction</h2>
            <p>
              This Privacy Policy describes how <strong>{SITE.name}</strong> (“Promptly,” “we,” “us”) handles
              information when you use our website (including pages hosted at our primary domain and
              subdomains) and the Promptly browser extension that works with supported AI chat services. By using
              Promptly, you agree to this policy. If you do not agree, please do not use our services.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">What we collect</h2>
            <p>Depending on how you use Promptly, we may process:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-violet-400">
              <li>
                <strong>Account and authentication information.</strong> If you sign in with Google (or similar
                methods we offer), we receive identifiers and profile details that the provider shares with us
                (for example, email address and a stable account identifier). We use this to operate your
                account, secure access, and enforce usage limits.
              </li>
              <li>
                <strong>Prompt and related text you submit.</strong> When you use features such as “Improve” or
                prompt generation, the extension reads the relevant text from the supported chat page and sends
                it (and any instructions you provide in Promptly) to our servers to produce a response. Do not
                submit information you are not allowed to share or that you consider highly sensitive unless you
                accept the risk of processing it through our service and our providers.
              </li>
              <li>
                <strong>Technical and usage data.</strong> When you call our APIs or visit our website, standard
                server logs and operational data may include information such as IP address, approximate location
                derived from IP, device and browser type, timestamps, and records needed to meter usage (for
                example, token or credit estimates tied to your account).
              </li>
              <li>
                <strong>Settings you store in the extension.</strong> Certain preferences (for example, the
                configured app or API base URL) may be stored locally in your browser using extension storage APIs.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">How we use information</h2>
            <p>We use the information above to:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-violet-400">
              <li>Provide, maintain, and improve Promptly features;</li>
              <li>Authenticate users, prevent abuse, and enforce agreements and limits;</li>
              <li>Operate metering, billing-related limits, or similar usage controls tied to your plan;</li>
              <li>Debug and protect the security and reliability of our services; and</li>
              <li>Comply with applicable law and respond to lawful requests where required.</li>
            </ul>
            <p>
              We do not sell your personal information. We do not use your content to train generic public models
              unless we clearly disclose a separate program and obtain any consent that may be required—but you
              should assume third‑party model providers apply their own terms when we route requests to them.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Sharing</h2>
            <p>
              We share information with <strong>service providers</strong> and infrastructure vendors who help us
              host, secure, and operate Promptly (for example, cloud hosting, databases, and logging). We may also
              share information with <strong>model or API providers</strong> to the extent necessary to fulfill
              your request when you use features that depend on those providers. We may disclose information if we
              believe in good faith that disclosure is required by law or to protect rights, safety, or security.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Retention</h2>
            <p>
              We retain information only as long as reasonably needed for the purposes above, including legal,
              accounting, and operational requirements. Retention periods can vary by data type. We may retain
              aggregated or de‑identified information where permitted.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Security</h2>
            <p>
              We use reasonable administrative, technical, and organizational measures designed to protect
              information. No method of transmission over the Internet or electronic storage is completely
              secure; we cannot guarantee absolute security.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Third-party services</h2>
            <p>
              Promptly interacts with third‑party sites (such as AI chat services) only to the extent you use the
              extension there. Those services have their own privacy policies. Our website and authentication flows
              may also rely on third‑party providers (for example, Google for sign‑in). Their processing is
              governed by their terms and policies.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Children</h2>
            <p>
              Promptly is not directed at children under 13 (or the minimum age required in your jurisdiction), and
              we do not knowingly collect personal information from children. If you believe we have collected
              information from a child, please contact us so we can take appropriate steps.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">International users</h2>
            <p>
              We may process and store information in countries where we or our providers operate. Those countries
              may have different data protection laws than your own. Where required, we rely on appropriate
              safeguards or legal bases for cross‑border transfers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Your choices</h2>
            <p>
              Depending on where you live, you may have rights to access, correct, delete, or restrict certain
              processing, or to object or port data. To exercise rights or ask questions, contact us using the
              email you use for developer or support correspondence. We may need to verify your request.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Changes</h2>
            <p>
              We may update this policy from time to time. We will post the updated version on this page and
              adjust the “Last updated” date. If changes are material, we will take reasonable steps to notify you
              where appropriate.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Contact</h2>
            <p>
              For privacy questions, use the contact email shown on our{" "}
              <a
                href={SITE.chromeStoreUrl}
                className="text-violet-200 underline decoration-violet-400/50 underline-offset-2 hover:text-white"
              >
                Chrome Web Store
              </a>{" "}
              developer listing.
              {process.env.NEXT_PUBLIC_PRIVACY_EMAIL ? (
                <>
                  {" "}
                  You may also email{" "}
                  <a
                    href={`mailto:${process.env.NEXT_PUBLIC_PRIVACY_EMAIL}`}
                    className="text-violet-200 underline decoration-violet-400/50 underline-offset-2 hover:text-white"
                  >
                    {process.env.NEXT_PUBLIC_PRIVACY_EMAIL}
                  </a>
                  .
                </>
              ) : null}
            </p>
          </section>
        </div>
      </article>
      <Footer />
    </main>
  );
}
