import { createHmac, timingSafeEqual } from "node:crypto";
import {
  isEmailPreferenceKey,
  type EmailPreferenceKey,
} from "@/lib/email-preferences";

interface UnsubscribeTokenPayload {
  v: 1;
  commanderId: string;
  preference: EmailPreferenceKey | "all";
}

function tokenSecret(): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("EMAIL_UNSUBSCRIBE_SECRET or SESSION_SECRET must be configured");
  }
  return secret;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", tokenSecret())
    .update(`msf-email-unsubscribe:${encodedPayload}`)
    .digest("base64url");
}

export function createUnsubscribeToken(
  commanderId: string,
  preference: EmailPreferenceKey | "all"
): string {
  const payload: UnsubscribeTokenPayload = {
    v: 1,
    commanderId,
    preference,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  if (!token || token.length > 1024) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;

  const expected = Buffer.from(sign(encoded), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Partial<UnsubscribeTokenPayload>;
    if (
      parsed.v !== 1 ||
      typeof parsed.commanderId !== "string" ||
      !parsed.commanderId ||
      (parsed.preference !== "all" && !isEmailPreferenceKey(parsed.preference))
    ) {
      return null;
    }
    return parsed as UnsubscribeTokenPayload;
  } catch {
    return null;
  }
}

export function unsubscribeUrl(
  commanderId: string,
  preference: EmailPreferenceKey | "all"
): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://themsftoolkit.com";
  const token = createUnsubscribeToken(commanderId, preference);
  return `${baseUrl}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}
