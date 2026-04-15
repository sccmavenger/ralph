import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { generateCodeVerifier, generateCodeChallenge } from "@/lib/pkce";

const HYDRA_AUTH_URL =
  "https://hydra-public.prod.m3.scopelypv.com/oauth2/auth";
const CLIENT_ID = process.env.SCOPELY_CLIENT_ID!;
const REDIRECT_URI = process.env.SCOPELY_REDIRECT_URI!;
const SCOPES = [
  "openid",
  "offline",
  "m3p.f.pr.pro",
  "m3p.f.pr.ros",
  "m3p.f.pr.inv",
  "m3p.f.pr.act",
  "m3p.f.pr.buy",
  "m3p.f.ar.pro",
  "m3p.f.ar.ros",
].join(" ");

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Store code_verifier in session for the callback to use
  session.codeVerifier = codeVerifier;
  await session.save();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state: crypto.randomUUID(),
  });

  return NextResponse.redirect(`${HYDRA_AUTH_URL}?${params.toString()}`);
}
