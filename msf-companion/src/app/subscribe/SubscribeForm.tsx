"use client";

import { useState, useEffect } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { stripePromise } from "@/lib/stripe-client";

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [applyingPromo, setApplyingPromo] = useState(false);

  async function handleApplyPromo() {
    if (!promoCode.trim()) return;
    setApplyingPromo(true);
    setPromoError(null);
    setPromoApplied(null);

    try {
      const res = await fetch("/api/stripe/apply-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoCode: promoCode.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setPromoApplied(data.description ?? "Discount applied!");
      } else {
        setPromoError(data.error ?? "Invalid promo code");
      }
    } catch {
      setPromoError("Failed to verify promo code");
    } finally {
      setApplyingPromo(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/subscribe/success`,
      },
    });

    if (stripeError) {
      setError(stripeError.message ?? "Payment failed");
      setLoading(false);
    }
    // If no error, Stripe redirects to return_url
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />

      {/* Promo Code */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted)]">
          Have a discount code?
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Enter code"
            disabled={!!promoApplied}
            className="flex-1 rounded-lg border border-[var(--color-surface-light)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleApplyPromo}
            disabled={applyingPromo || !promoCode.trim() || !!promoApplied}
            className="rounded-lg border border-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/10 disabled:opacity-50"
          >
            {applyingPromo ? "…" : promoApplied ? "Applied" : "Apply"}
          </button>
        </div>
        {promoApplied && (
          <p className="text-xs text-green-400">✓ {promoApplied}</p>
        )}
        {promoError && (
          <p className="text-xs text-red-400">{promoError}</p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full rounded-lg bg-[var(--color-accent)] px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? "Processing…" : "Subscribe — $1.99/month"}
      </button>
      <p className="mt-2 text-center text-[10px] leading-snug text-[var(--color-muted)]">
        By subscribing, you agree to our{" "}
        <a href="/terms" className="text-[var(--color-accent)] hover:underline">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" className="text-[var(--color-accent)] hover:underline">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}

function TrustIndicators() {
  return (
    <div className="mt-4 space-y-2 text-center">
      <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--color-muted)]">
        <span>🔒</span>
        <span>Secure checkout powered by Stripe</span>
      </div>
      <p className="text-xs text-[var(--color-muted)]">
        Your payment info is encrypted and never stored on our servers. All
        transactions are processed securely by Stripe.
      </p>
      <div className="flex items-center justify-center gap-3 pt-1 text-xs text-[var(--color-muted)]">
        <span>Visa</span>
        <span>Mastercard</span>
        <span>Amex</span>
        <span>Apple Pay</span>
        <span>Google Pay</span>
        <span>Venmo</span>
      </div>
    </div>
  );
}

export default function SubscribeForm({
  isPremium,
  currentPeriodEnd,
  cancelAtPeriodEnd,
}: {
  isPremium: boolean;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [cancelled, setCancelled] = useState(cancelAtPeriodEnd ?? false);
  const [periodEndDisplay, setPeriodEndDisplay] = useState(
    currentPeriodEnd
      ? new Date(currentPeriodEnd).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : null
  );

  useEffect(() => {
    if (isPremium) return;

    async function createSubscription() {
      try {
        const res = await fetch("/api/stripe/create-subscription", {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to initialize payment");
          return;
        }
        setClientSecret(data.clientSecret);
      } catch {
        setError("Failed to connect to payment service");
      }
    }

    createSubscription();
  }, [isPremium]);

  async function handleCancel() {
    if (!confirm("Are you sure you want to cancel your subscription? You'll retain access until the end of your current billing period.")) {
      return;
    }
    setCancelling(true);
    try {
      const res = await fetch("/api/stripe/cancel-subscription", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setCancelled(true);
        if (data.currentPeriodEnd) {
          setPeriodEndDisplay(
            new Date(data.currentPeriodEnd).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })
          );
        }
      } else {
        setError(data.error ?? "Failed to cancel subscription");
      }
    } catch {
      setError("Failed to connect to payment service");
    } finally {
      setCancelling(false);
    }
  }

  async function handleReactivate() {
    setReactivating(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/reactivate-subscription", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setCancelled(false);
      } else {
        setError(data.error ?? "Failed to reactivate subscription");
      }
    } catch {
      setError("Failed to connect to payment service");
    } finally {
      setReactivating(false);
    }
  }

  if (isPremium) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-[var(--color-surface)] p-6 text-center">
        <span className="text-3xl">✅</span>
        <p className="mt-2 text-sm font-semibold text-[var(--color-foreground)]">
          You&apos;re a Premium member!
        </p>
        {cancelled && periodEndDisplay ? (
          <>
            <p className="mt-1 text-xs text-yellow-400">
              Your subscription is active until {periodEndDisplay}
            </p>
            <button
              onClick={handleReactivate}
              disabled={reactivating}
              className="mt-4 rounded-lg bg-[var(--color-accent)] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            >
              {reactivating ? "Reactivating…" : "Reactivate Subscription"}
            </button>
          </>
        ) : (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            You have full access to all features.
          </p>
        )}
        {!cancelled && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="mt-4 rounded-lg border border-red-500/30 px-4 py-2 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel Subscription"}
          </button>
        )}
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-[var(--color-surface)] p-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 text-center text-lg font-bold text-[var(--color-foreground)]">
        $1.99/month
      </p>
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            theme: "night",
            variables: {
              colorPrimary: "#3b82f6",
              colorBackground: "#1a1f2e",
              colorText: "#e2e8f0",
              colorDanger: "#ef4444",
              fontFamily: "inherit",
              borderRadius: "8px",
            },
          },
        }}
      >
        <CheckoutForm />
      </Elements>
      <TrustIndicators />
    </>
  );
}
