import { SITE } from "@/lib/constants";

type Props = {
  lastUpdated: string;
  privacyEmail: string | null;
};

/**
 * Standard-style privacy policy draft (website + Chrome extension).
 * Not legal advice; have counsel review before relying on it.
 */
export function PrivacyPolicyDocument({ lastUpdated, privacyEmail }: Props) {
  return (
    <div className="space-y-8 text-[15px] leading-relaxed text-muted">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">1. Introduction</h2>
        <p>
          {SITE.name} (“Promptly,” “we,” “us,” or “our”) respects your privacy. This Privacy Policy explains how
          we collect, use, disclose, and safeguard information when you use our website, web applications, APIs,
          and the Promptly browser extension (collectively, the “Services”). By using the Services, you agree to
          this Privacy Policy. If you do not agree, please do not use the Services.
        </p>
        <p>
          This policy is designed to follow common practices used in public templates (for example, general GDPR-
          style transparency, California notice elements, and plain-language summaries). It is not a substitute for
          legal advice. Laws vary by region; where they conflict, we aim to comply with the requirements that apply
          to us.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">2. Who we are</h2>
        <p>
          Promptly is operated by the entity or individual responsible for the Services and the Chrome Web Store
          listing identified as “Promptly.” The “data controller” for personal data we determine the purposes and
          means of processing is that operator. For contact details, see Section 15 (Contact).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">3. Scope</h2>
        <p>This policy applies to:</p>
        <ul className="list-disc space-y-2 pl-5 marker:text-faint">
          <li>Visitors and users of our website (for example, {SITE.name.toLowerCase()}.com and related subdomains);</li>
          <li>
            Users of the Promptly Chrome extension when it runs on supported third-party AI chat websites; and
          </li>
          <li>API and account interactions tied to your Promptly account.</li>
        </ul>
        <p>
          Third-party services (including AI chat providers and sign-in providers) have their own privacy policies. We
          do not control how they process data on their platforms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">4. Information we collect</h2>
        <p>We may collect the following categories of information:</p>

        <h3 className="pt-2 text-base font-semibold text-ink">4.1 Information you provide</h3>
        <ul className="list-disc space-y-2 pl-5 marker:text-faint">
          <li>
            <strong>Account data.</strong> When you create or access an account, we may collect your name, email
            address, authentication provider, and account identifiers depending on the sign-in method.
          </li>
          <li>
            <strong>Content you submit.</strong> When you use features such as prompt improvement or generation, we
            process the text you submit through the extension or website, including the prompt text read from the
            supported chat interface and any instructions you add in Promptly.
          </li>
          <li>
            <strong>Communications.</strong> If you email us or contact support, we collect the contents of those
            messages and related metadata.
          </li>
        </ul>

        <h3 className="pt-2 text-base font-semibold text-ink">4.2 Information collected automatically</h3>
        <ul className="list-disc space-y-2 pl-5 marker:text-faint">
          <li>
            <strong>Device and log data.</strong> IP address, browser type, operating system, referring URLs, pages
            viewed, date/time stamps, and similar diagnostics.
          </li>
          <li>
            <strong>Usage data.</strong> API calls, approximate token or credit usage, feature usage, and error
            logs needed to run and secure the Services.
          </li>
          <li>
            <strong>Cookies and similar technologies.</strong> On our website, we may use cookies, local storage, or
            similar technologies for session management, preferences, analytics (if enabled), and security. You can
            control cookies through your browser settings where applicable.
          </li>
        </ul>

        <h3 className="pt-2 text-base font-semibold text-ink">4.3 Extension-related data</h3>
        <ul className="list-disc space-y-2 pl-5 marker:text-faint">
          <li>
            <strong>Locally stored settings.</strong> The extension may store preferences (such as API base URL or UI
            options) using browser extension storage APIs on your device.
          </li>
          <li>
            <strong>Authentication tokens.</strong> To call our APIs, the extension may cache short-lived tokens
            needed for Google sign-in flows and Promptly session handling, consistent with the extension’s manifest
            permissions.
          </li>
        </ul>

        <h3 className="pt-2 text-base font-semibold text-ink">4.4 Google user data and OAuth scopes</h3>
        <p>
          Promptly uses Google sign-in and Chrome extension identity features only to authenticate you and connect
          your Google account to your Promptly account. The Google OAuth project associated with Promptly is project
          ID <strong>promptly-prod-976ef</strong> / project number <strong>913040005574</strong>.
        </p>
        <p>When you choose to sign in with Google, Promptly may access, collect, or interact with:</p>
        <ul className="list-disc space-y-2 pl-5 marker:text-faint">
          <li>
            <strong>Your Google email address</strong>, used to identify your account, show your signed-in status,
            link website and extension sessions, and provide account support.
          </li>
          <li>
            <strong>Your Google account profile identifier</strong> (for example, your Google subject ID), used to
            maintain a stable account record and prevent duplicate or mismatched accounts.
          </li>
          <li>
            <strong>Basic profile information</strong> that Google returns for sign-in, such as display name or
            profile metadata, if provided by Google.
          </li>
          <li>
            <strong>Google OAuth access tokens or Firebase authentication tokens</strong>, used to verify your
            identity with Google/Firebase and create a Promptly session. These tokens are used for authentication
            and are not used to access Google services such as Gmail, Drive, Calendar, Contacts, or Photos.
          </li>
        </ul>
        <p>
          Promptly requests only the Google sign-in data needed to authenticate you. We do not request, access, read,
          modify, or delete the contents of your Gmail, Google Drive files, Google Calendar events, Google Contacts,
          Google Photos, or other Google Workspace content.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">5. How we use information</h2>
        <p>We use information to:</p>
        <ul className="list-disc space-y-2 pl-5 marker:text-faint">
          <li>Provide, operate, maintain, and improve the Services;</li>
          <li>Create and manage accounts and authenticate users;</li>
          <li>
            Verify Google sign-in, link your website and browser extension sessions, display your signed-in email,
            and enforce account-specific token limits and billing status;
          </li>
          <li>Process prompts and return improved or generated text;</li>
          <li>Enforce terms, usage limits, credits, or anti-abuse measures;</li>
          <li>Monitor performance, debug issues, and protect security and integrity;</li>
          <li>Comply with legal obligations and respond to lawful requests; and</li>
          <li>Communicate with you about updates, security, or support (where permitted).</li>
        </ul>
        <p>
          <strong>We do not sell your personal information</strong> in the common sense of selling lists to data
          brokers. We may use service providers who process data on our behalf under contract.
        </p>
        <p>
          Promptly’s use and transfer of information received from Google APIs will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-muted underline decoration-faint underline-offset-2 hover:text-ink"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. We do not use Google user data for advertising, sale, or
          unrelated profiling, and we do not use Google user data to train generalized AI or machine learning models.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">6. Legal bases (EEA, UK, and similar regions)</h2>
        <p>Where GDPR-style rules apply, we rely on one or more of the following:</p>
        <ul className="list-disc space-y-2 pl-5 marker:text-faint">
          <li>
            <strong>Contract</strong> — processing needed to provide the Services you request (for example,
            running Improve).
          </li>
          <li>
            <strong>Legitimate interests</strong> — for security, fraud prevention, service improvement, and
            analytics that are not overridden by your rights.
          </li>
          <li>
            <strong>Legal obligation</strong> — where the law requires us to process data.
          </li>
          <li>
            <strong>Consent</strong> — where we ask for it (for example, optional marketing cookies if we use them).
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">7. Sharing and disclosure</h2>
        <p>We may share information with:</p>
        <ul className="list-disc space-y-2 pl-5 marker:text-faint">
          <li>
            <strong>Service providers</strong> who host infrastructure, databases, monitoring, email, analytics, or
            customer support tools;
          </li>
          <li>
            <strong>AI and API providers</strong> when necessary to perform operations you initiate (for example,
            sending prompt text to a model API to return a result);
          </li>
          <li>
            <strong>Professional advisors</strong> (lawyers, accountants) under confidentiality obligations;
          </li>
          <li>
            <strong>Authorities</strong> if we believe disclosure is required by law, subpoena, or to protect rights,
            safety, or security; and
          </li>
          <li>
            <strong>Business transactions</strong> — in connection with a merger, acquisition, financing, or sale of
            assets, subject to standard protections.
          </li>
        </ul>
        <p>
          We require processors to use information only as instructed and to implement appropriate safeguards. We do
          not sell Google user data and do not share Google user data with third parties except as necessary to
          provide or secure the Services, comply with law, or with your direction or consent.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">8. International transfers</h2>
        <p>
          We and our providers may process data in the United States and other countries. Those countries may not
          provide the same level of protection as your home country. Where required, we use appropriate safeguards
          (such as standard contractual clauses) or other lawful transfer mechanisms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">9. Retention</h2>
        <p>
          We retain personal information for as long as necessary to fulfill the purposes described in this policy,
          unless a longer period is required by law. Criteria include whether we have an ongoing relationship with
          you, whether we must meet legal or contractual duties, and whether retention is warranted for security or
          dispute resolution. We may retain de-identified or aggregated information where permitted.
        </p>
        <p>
          Google account identifiers, email addresses, and related Promptly account records are retained while your
          account is active or as needed for security, billing, abuse prevention, and legal compliance. Google OAuth
          access tokens are treated as short-lived authentication credentials. You may revoke Promptly’s Google
          access from your Google Account permissions page or request deletion of your Promptly account data by
          contacting us.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">10. Security</h2>
        <p>
          We implement reasonable technical and organizational measures designed to protect information. No method
          of transmission or storage is completely secure. We cannot guarantee absolute security. You are
          responsible for maintaining the confidentiality of your credentials where applicable.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">11. Your rights and choices</h2>
        <p>
          Depending on your location, you may have rights to access, correct, delete, restrict, or object to certain
          processing, and in some cases to data portability or withdrawal of consent. You may lodge a complaint with
          a supervisory authority. To exercise rights, contact us (Section 15). We may need to verify your identity.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">12. California residents (summary)</h2>
        <p>
          If California law applies, you may have additional rights under the CCPA/CPRA, such as requesting access
          or deletion of personal information and opting out of certain sharing (we do not “sell” or “share”
          personal information for cross-context behavioral advertising as defined by CPRA if we do not operate
          such programs—adjust this sentence if that changes). You may designate an authorized agent where
          permitted. We will not discriminate for exercising rights.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">13. Children</h2>
        <p>
          The Services are not directed to children under 13 (or the minimum age in your jurisdiction), and we do
          not knowingly collect personal information from children. If you believe we have collected information
          from a child, contact us and we will take appropriate steps.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">14. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. We will post the updated version on this page and update the
          “Last updated” date. For material changes, we may provide additional notice (for example, a notice on the
          website or in-product message) where appropriate.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">15. Contact</h2>
        <p>
          For privacy-related requests or questions, contact us using the email address on our{" "}
          <a
            href={SITE.chromeStoreUrl}
            className="text-muted underline decoration-faint underline-offset-2 hover:text-ink"
          >
            Chrome Web Store
          </a>{" "}
          developer listing.
          {privacyEmail ? (
            <>
              {" "}
              You may also email{" "}
              <a
                href={`mailto:${privacyEmail}`}
                className="text-muted underline decoration-faint underline-offset-2 hover:text-ink"
              >
                {privacyEmail}
              </a>
              .
            </>
          ) : null}
        </p>
        <p className="text-sm text-faint">
          Last updated: {lastUpdated}
        </p>
      </section>
    </div>
  );
}
