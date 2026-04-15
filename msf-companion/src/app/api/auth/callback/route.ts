import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { handleLoginSnapshot } from "@/lib/snapshots";
import { msfApiFetch } from "@/lib/msf-api";

const HYDRA_TOKEN_URL =
  "https://hydra-public.prod.m3.scopelypv.com/oauth2/token";
const HYDRA_USERINFO_URL =
  "https://hydra-public.prod.m3.scopelypv.com/userinfo";
const CLIENT_ID = process.env.SCOPELY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SCOPELY_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.SCOPELY_REDIRECT_URI!;

export const dynamic = "force-dynamic";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Determine the public base URL from headers (set by reverse proxy) or fallback to request.url
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const baseUrl = `${proto}://${host}`;

  if (error) {
    const message = errorDescription || error;
    const params = new URLSearchParams({ error: message });
    return NextResponse.redirect(
      new URL(`/?${params.toString()}`, baseUrl)
    );
  }

  if (!code) {
    const params = new URLSearchParams({
      error: "No authorization code received",
    });
    return NextResponse.redirect(
      new URL(`/?${params.toString()}`, baseUrl)
    );
  }

  const session = await getSession();
  const codeVerifier = session.codeVerifier;

  if (!codeVerifier) {
    const params = new URLSearchParams({
      error: "Session expired. Please try again.",
    });
    return NextResponse.redirect(
      new URL(`/?${params.toString()}`, baseUrl)
    );
  }

  // Exchange authorization code for tokens
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  // Hydra requires client_secret_basic (HTTP Basic Auth), not client_secret_post
  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  let tokenData: TokenResponse;
  try {
    const tokenRes = await fetch(HYDRA_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "Unknown error");
      console.error("Token exchange failed:", tokenRes.status, text);
      const params = new URLSearchParams({
        error: "Authentication failed. Please try again.",
      });
      return NextResponse.redirect(
        new URL(`/?${params.toString()}`, baseUrl)
      );
    }

    tokenData = (await tokenRes.json()) as TokenResponse;
  } catch (err) {
    console.error("Token exchange error:", err);
    const params = new URLSearchParams({
      error: "Authentication failed. Please try again.",
    });
    return NextResponse.redirect(
      new URL(`/?${params.toString()}`, baseUrl)
    );
  }

  // Extract scopelyId — try JWT decoding first, then userinfo endpoint
  let scopelyId: string | undefined;

  // Try access_token JWT
  const payload = decodeJwtPayload(tokenData.access_token);
  if (payload?.sub) {
    scopelyId = payload.sub as string;
  }

  // Fallback: try id_token JWT
  if (!scopelyId && tokenData.id_token) {
    const idPayload = decodeJwtPayload(tokenData.id_token);
    if (idPayload?.sub) {
      scopelyId = idPayload.sub as string;
    }
  }

  // Fallback: Hydra userinfo endpoint (works with opaque tokens)
  if (!scopelyId) {
    try {
      const userinfoRes = await fetch(HYDRA_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json();
        if (userinfo.sub) scopelyId = userinfo.sub as string;
      }
    } catch {
      // Non-critical — will proceed without scopelyId
    }
  }

  // Store tokens in session (server-side only)
  session.accessToken = tokenData.access_token;
  session.refreshToken = tokenData.refresh_token;
  session.tokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
  session.scopelyId = scopelyId;
  session.codeVerifier = undefined; // Clean up

  await session.save();
  
  // Read back the sealed cookie so we can explicitly set it on the redirect response
  const cookieStore = await cookies();
  const sealedCookie = cookieStore.get("msf-session");

  // Fetch player card name for display
  let displayName: string | undefined;
  try {
    const card = await msfApiFetch<{ data?: { name?: string } }>({
      path: "/player/v1/card",
      accessToken: tokenData.access_token,
    });
    if (card.data?.name) displayName = card.data.name;
  } catch {
    // Non-critical
  }

  // Create/update commander and take snapshots (non-blocking on API failure)
  if (scopelyId) {
    try {
      await handleLoginSnapshot(scopelyId, tokenData.access_token, displayName);
    } catch {
      // Non-critical — continue without snapshot
    }
  }

  // Explicitly set the cookie on the redirect response to guarantee it's included
  const redirectResponse = NextResponse.redirect(new URL("/dashboard", baseUrl));
  if (sealedCookie) {
    redirectResponse.cookies.set("msf-session", sealedCookie.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }
  return redirectResponse;
}
