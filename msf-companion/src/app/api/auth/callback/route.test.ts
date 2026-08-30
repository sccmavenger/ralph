import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { handleLoginSnapshot } from "@/lib/snapshots";
import { msfApiFetch } from "@/lib/msf-api";
import { GET } from "./route";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/snapshots", () => ({ handleLoginSnapshot: vi.fn() }));
vi.mock("@/lib/msf-api", () => ({ msfApiFetch: vi.fn() }));

function jwtWithSubject(subject: string): string {
  return [
    Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: subject })).toString("base64url"),
    "signature",
  ].join(".");
}

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires the missing-email prompt again for each successful login", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const session = {
      codeVerifier: "verifier",
      emailPromptRequired: false,
      save,
    };
    vi.mocked(getSession).mockResolvedValue(session as never);
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "sealed-session" }),
    } as never);
    vi.mocked(msfApiFetch).mockResolvedValue({
      data: { name: "Test Commander" },
    });
    vi.mocked(handleLoginSnapshot).mockResolvedValue("commander-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: jwtWithSubject("scopely-1"),
            refresh_token: "refresh-token",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      )
    );

    const response = await GET(
      new NextRequest("https://themsftoolkit.com/api/auth/callback?code=code")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://themsftoolkit.com/dashboard"
    );
    expect(session.emailPromptRequired).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });
});
