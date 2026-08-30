import { createHmac, timingSafeEqual } from "node:crypto";

export const CANCELLATION_FEEDBACK_REASONS = [
  { id: "not_using_enough", number: 1, label: "I wasn’t using it enough" },
  { id: "price_did_not_match_value", number: 2, label: "The price didn’t match the value" },
  { id: "missing_something", number: 3, label: "It was missing something I needed" },
  { id: "confusing_or_broken", number: 4, label: "Something was confusing or didn’t work well" },
  { id: "needs_changed", number: 5, label: "My needs changed" },
  { id: "something_else", number: 6, label: "Something else" },
] as const;

export type CancellationFeedbackReason =
  (typeof CANCELLATION_FEEDBACK_REASONS)[number]["id"];

export const CANCELLATION_FEEDBACK_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface CancellationFeedbackTokenPayload {
  v: 1;
  commanderId: string;
  caseId: string;
  exp: number;
  reason?: CancellationFeedbackReason;
}

export interface CreateCancellationFeedbackTokenOptions {
  commanderId: string;
  caseId: string;
  reason?: CancellationFeedbackReason;
  expiresAt?: Date;
}

const reasonIds = new Set<string>(
  CANCELLATION_FEEDBACK_REASONS.map(({ id }) => id)
);

export function isCancellationFeedbackReason(
  value: unknown
): value is CancellationFeedbackReason {
  return typeof value === "string" && reasonIds.has(value);
}

function feedbackTokenSecret(): string {
  const secret =
    process.env.EMAIL_FEEDBACK_SECRET ||
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "EMAIL_FEEDBACK_SECRET, EMAIL_UNSUBSCRIBE_SECRET, or SESSION_SECRET must be configured"
    );
  }
  return secret;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", feedbackTokenSecret())
    .update(`msf-cancellation-feedback:v1:${encodedPayload}`)
    .digest("base64url");
}

function requireIdentifier(value: string, label: string): string {
  if (!value || value !== value.trim() || value.length > 256) {
    throw new Error(`${label} must be a non-empty identifier`);
  }
  return value;
}

function toEpochSeconds(value: Date): number {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) {
    throw new Error("Cancellation feedback token expiry must be a valid date");
  }
  return Math.floor(milliseconds / 1000);
}

export function createCancellationFeedbackToken(
  options: CreateCancellationFeedbackTokenOptions,
  now = new Date()
): string {
  const nowEpoch = toEpochSeconds(now);
  const exp = options.expiresAt
    ? toEpochSeconds(options.expiresAt)
    : nowEpoch + CANCELLATION_FEEDBACK_TOKEN_TTL_SECONDS;

  if (exp <= nowEpoch) {
    throw new Error("Cancellation feedback token expiry must be in the future");
  }
  if (options.reason !== undefined && !isCancellationFeedbackReason(options.reason)) {
    throw new Error("Cancellation feedback reason is invalid");
  }

  const payload: CancellationFeedbackTokenPayload = {
    v: 1,
    commanderId: requireIdentifier(options.commanderId, "Commander ID"),
    caseId: requireIdentifier(options.caseId, "Cancellation feedback case ID"),
    exp,
    ...(options.reason ? { reason: options.reason } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyCancellationFeedbackToken(
  token: string,
  now = new Date()
): CancellationFeedbackTokenPayload | null {
  if (!token || token.length > 2048) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;

  const expected = Buffer.from(sign(encoded), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Partial<CancellationFeedbackTokenPayload>;
    const nowEpoch = toEpochSeconds(now);

    if (
      parsed.v !== 1 ||
      typeof parsed.commanderId !== "string" ||
      !parsed.commanderId ||
      parsed.commanderId !== parsed.commanderId.trim() ||
      parsed.commanderId.length > 256 ||
      typeof parsed.caseId !== "string" ||
      !parsed.caseId ||
      parsed.caseId !== parsed.caseId.trim() ||
      parsed.caseId.length > 256 ||
      typeof parsed.exp !== "number" ||
      !Number.isSafeInteger(parsed.exp) ||
      parsed.exp <= nowEpoch ||
      (parsed.reason !== undefined &&
        !isCancellationFeedbackReason(parsed.reason))
    ) {
      return null;
    }

    return parsed as CancellationFeedbackTokenPayload;
  } catch {
    return null;
  }
}

export function cancellationFeedbackUrl(
  options: CreateCancellationFeedbackTokenOptions,
  now = new Date()
): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://themsftoolkit.com";
  const url = new URL("/feedback/cancellation", baseUrl);
  url.searchParams.set("token", createCancellationFeedbackToken(options, now));
  return url.toString();
}
