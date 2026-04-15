import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — MSF Companion",
  description:
    "How MSF Companion collects, uses, and protects your data. Read our privacy policy.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 text-sm leading-relaxed text-[var(--color-foreground)]">
      <h1 className="mb-6 text-2xl font-bold">Privacy Policy</h1>
      <p className="mb-6 text-xs text-[var(--color-muted)]">
        Last updated: June 2025
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">
          1. What We Collect &amp; Why
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Authentication:</strong> You log in through Scopely&apos;s
            official OAuth system. We never see or store your password.
          </li>
          <li>
            <strong>Game Data:</strong> Your commander profile, roster, and
            inventory are pulled from the official read-only MSF API so you can
            view them in the app. We also save periodic snapshots so you can
            track progress over time.
          </li>
          <li>
            <strong>Email:</strong> Only collected if you choose to provide it on
            your Profile page. Used solely for service updates — you can remove
            it anytime.
          </li>
          <li>
            <strong>Payments:</strong> Handled entirely by Stripe. We never see
            or store your card details.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">2. How We Protect It</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>All connections are encrypted via HTTPS</li>
          <li>
            Sessions use encrypted cookies — your tokens are never exposed to
            browser JavaScript
          </li>
          <li>
            We do not sell, rent, or share your data with anyone for marketing
            purposes
          </li>
          <li>
            MSF Companion is intended for users age 13 and older
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">3. Contact</h2>
        <p>
          Questions or want your data deleted? Email us at{" "}
          <a
            href="mailto:info@themsftoolkit.com"
            className="text-[var(--color-accent)] hover:underline"
          >
            info@themsftoolkit.com
          </a>{" "}
          and we&apos;ll take care of it.
        </p>
      </section>

      <div className="flex items-center justify-center gap-4 border-t border-[var(--color-surface-light)] pt-4 text-xs text-[var(--color-muted)]">
        <a href="/" className="text-[var(--color-accent)] hover:underline">
          Home
        </a>
        <span>•</span>
        <a href="/terms" className="text-[var(--color-accent)] hover:underline">
          Terms of Service
        </a>
        <span>•</span>
        <a href="/faq" className="text-[var(--color-accent)] hover:underline">
          FAQ
        </a>
      </div>
    </div>
  );
}
