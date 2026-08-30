import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import {
  CANCELLATION_FEEDBACK_REASONS,
  verifyCancellationFeedbackToken,
} from "@/lib/cancellation-feedback";
import CancellationFeedbackForm from "./CancellationFeedbackForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cancellation feedback — The MSF Toolkit",
  description: "Tell The MSF Toolkit team what we could improve.",
};

export default async function CancellationFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const rawToken = (await searchParams).token;
  const token = typeof rawToken === "string" ? rawToken : "";
  const payload = token ? verifyCancellationFeedbackToken(token) : null;
  const feedbackCase = payload
    ? await prisma.cancellationFeedbackCase.findUnique({
        where: { id: payload.caseId },
        select: { commanderId: true, firstRespondedAt: true },
      })
    : null;
  const valid = Boolean(
    payload &&
    feedbackCase &&
    feedbackCase.commanderId === payload.commanderId
  );

  return (
    <main className="min-h-screen bg-[var(--color-background)] px-4 py-10 text-[var(--color-foreground)]">
      <div className="mx-auto max-w-xl">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 inline-block rounded-lg bg-red-600 px-4 py-2 text-sm font-extrabold text-white">MSF</div>
          <h1 className="text-2xl font-bold">Help us make The MSF Toolkit better</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            One sentence is plenty. Your candid feedback will be reviewed by the team.
          </p>
        </div>

        {valid && payload ? (
          <CancellationFeedbackForm
            token={token}
            reasons={CANCELLATION_FEEDBACK_REASONS.map((reason) => ({ ...reason }))}
            initialReason={payload.reason}
            previouslySubmitted={Boolean(feedbackCase?.firstRespondedAt)}
          />
        ) : (
          <div className="rounded-2xl bg-[var(--color-surface)] p-6 text-center">
            <h2 className="text-lg font-bold">This feedback link is invalid or has expired</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              You can still reply directly to the cancellation email, and we&apos;ll add your feedback to the review queue.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
