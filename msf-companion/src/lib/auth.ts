import { getSession } from "@/lib/session";

const HYDRA_TOKEN_URL =
  "https://hydra-public.prod.m3.scopelypv.com/oauth2/token";
const CLIENT_ID = process.env.SCOPELY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SCOPELY_CLIENT_SECRET || "";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

/**
 * Refresh the access token using the stored refresh token.
 * IMPORTANT: Only call from Route Handlers (not Server Components).
 */
export async function refreshAccessToken(): Promise<string | null> {
  const session = await getSession();

  if (!session.refreshToken) {
    return null;
  }

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    });

    // Hydra requires client_secret_basic (HTTP Basic Auth)
    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

    const res = await fetch(HYDRA_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("Token refresh failed:", res.status, text);
      return null;
    }

    const data = (await res.json()) as TokenResponse;

    session.accessToken = data.access_token;
    if (data.refresh_token) {
      session.refreshToken = data.refresh_token;
    }
    session.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    await session.save();

    return data.access_token;
  } catch (err) {
    console.warn("Token refresh error:", err);
    return null;
  }
}

/**
 * Get a valid access token for use in Server Components (read-only, no refresh).
 * Returns the token if still valid, null if expired or missing.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const session = await getSession();

  if (!session.accessToken) {
    return null;
  }

  // Check if token is expired
  const expiresAt = session.tokenExpiresAt ?? 0;
  if (Date.now() > expiresAt - 60_000) {
    // Token expired — can't refresh here (Server Component), return null
    return null;
  }

  return session.accessToken;
}

/**
 * Get a valid access token for use in Route Handlers (can refresh).
 */
export async function getValidAccessTokenWithRefresh(): Promise<string | null> {
  const session = await getSession();

  if (!session.accessToken) {
    return null;
  }

  const expiresAt = session.tokenExpiresAt ?? 0;
  if (Date.now() > expiresAt - 60_000) {
    return refreshAccessToken();
  }

  return session.accessToken;
}
