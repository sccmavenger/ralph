import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — MSF Companion",
  description:
    "Terms and conditions for using MSF Companion. Read before subscribing.",
};

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 text-sm leading-relaxed text-[var(--color-foreground)]">
      <h1 className="mb-6 text-2xl font-bold">Terms of Service</h1>
      <p className="mb-4 text-xs text-[var(--color-muted)]">
        Last updated: June 2025
      </p>
      <p className="mb-4 italic text-[var(--color-muted)]">
        This document outlines the terms under which you may use MSF Companion.
        It is not legal advice. If you have questions, contact us at{" "}
        <a
          href="mailto:info@themsftoolkit.com"
          className="text-[var(--color-accent)] hover:underline"
        >
          info@themsftoolkit.com
        </a>
        .
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">1. Service Description</h2>
        <p>
          MSF Companion (&ldquo;the App&rdquo;) is a mobile web application that
          helps Marvel Strike Force players view their roster, inventory, and
          progress. It accesses game data through the official Scopely API using
          your authorized OAuth login. MSF Companion is an independent fan
          project and is not affiliated with, endorsed by, or connected to
          Scopely, Marvel, or any related entities.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">2. Eligibility</h2>
        <p>
          You must be at least 13 years old to use MSF Companion. By using the
          App, you represent that you meet this age requirement and have the
          authority to agree to these terms.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">3. Account & Access</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            You log in using your Scopely account through OAuth 2.0. We never
            see or store your Scopely password.
          </li>
          <li>
            You are responsible for maintaining the security of your Scopely
            account credentials.
          </li>
          <li>
            We reserve the right to suspend or terminate access to any account
            that violates these terms or is used for abusive purposes.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">
          4. Subscription & Payment
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            MSF Companion offers a free tier and a Premium subscription at
            $1.99/month.
          </li>
          <li>
            All payments are processed securely by Stripe. We do not store your
            payment information.
          </li>
          <li>Subscriptions renew automatically each month until cancelled.</li>
          <li>
            You can cancel at any time from the Profile page. Access continues
            through the end of your current billing period.
          </li>
          <li>
            Refund requests are handled on a case-by-case basis. Contact{" "}
            <a
              href="mailto:info@themsftoolkit.com"
              className="text-[var(--color-accent)] hover:underline"
            >
              info@themsftoolkit.com
            </a>{" "}
            for assistance.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">5. Cancellation</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Cancel your Premium subscription at any time from your Profile page
            — no questions asked.
          </li>
          <li>
            After cancellation, you retain Premium access until the end of the
            current billing period.
          </li>
          <li>
            Your data (roster snapshots, profile info) is preserved even after
            cancellation — you just lose access to premium features.
          </li>
          <li>
            You can resubscribe at any time to regain Premium access.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">6. Acceptable Use</h2>
        <p className="mb-2">You agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Attempt to reverse engineer, decompile, or disassemble the App
          </li>
          <li>Use the App to exploit, bot, or hack Marvel Strike Force</li>
          <li>
            Scrape, crawl, or programmatically access the App beyond normal use
          </li>
          <li>
            Share, resell, or distribute your account access to others
          </li>
          <li>Use the App for any unlawful purpose</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">
          7. Intellectual Property
        </h2>
        <p>
          MSF Companion&apos;s code, design, and content are the property of the
          MSF Companion team. Marvel Strike Force, character names, and game
          assets are trademarks of their respective owners. This App is an
          independent fan project using publicly available API data.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">8. Disclaimers</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            MSF Companion is provided &ldquo;as is&rdquo; without warranties of
            any kind, express or implied.
          </li>
          <li>
            We do not guarantee that the App will be available at all times or
            that game data will be accurate or up-to-date.
          </li>
          <li>
            If Scopely changes or discontinues their API, some or all features
            may become unavailable.
          </li>
          <li>
            We are not responsible for any actions taken by Scopely regarding
            your game account.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">
          9. Limitation of Liability
        </h2>
        <p>
          To the maximum extent permitted by law, MSF Companion and its
          operators shall not be liable for any indirect, incidental, special, or
          consequential damages arising from your use of the App. Our total
          liability is limited to the amount you have paid for Premium
          subscriptions in the 12 months preceding any claim.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">10. Changes to Terms</h2>
        <p>
          We may update these terms from time to time. Material changes will be
          communicated via in-app notification. Continued use of the App after
          changes constitutes acceptance of the updated terms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">11. Contact</h2>
        <p>
          Questions about these terms? Email us at{" "}
          <a
            href="mailto:info@themsftoolkit.com"
            className="text-[var(--color-accent)] hover:underline"
          >
            info@themsftoolkit.com
          </a>
          .
        </p>
      </section>

      <div className="flex items-center justify-center gap-4 border-t border-[var(--color-surface-light)] pt-4 text-xs text-[var(--color-muted)]">
        <a href="/" className="text-[var(--color-accent)] hover:underline">
          Home
        </a>
        <span>•</span>
        <a
          href="/privacy"
          className="text-[var(--color-accent)] hover:underline"
        >
          Privacy Policy
        </a>
        <span>•</span>
        <a href="/faq" className="text-[var(--color-accent)] hover:underline">
          FAQ
        </a>
      </div>
    </div>
  );
}
