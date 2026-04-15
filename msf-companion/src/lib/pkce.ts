import crypto from "crypto";

/**
 * Generate a cryptographically random code_verifier per RFC 7636.
 * 43-128 characters, using URL-safe base64 characters.
 */
export function generateCodeVerifier(): string {
  const buffer = crypto.randomBytes(32);
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Generate the code_challenge from a code_verifier using S256 method.
 * Base64url-encoded SHA-256 hash of the code_verifier.
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash("sha256").update(verifier).digest("base64");
  return hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
