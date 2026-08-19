import { NextResponse } from "next/server";
import { getValidAccessTokenWithRefresh as getValidAccessToken } from "@/lib/auth";
import { msfApiFetch } from "@/lib/msf-api";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;

interface CharactersPage {
  data?: unknown[];
  meta?: {
    page?: number;
    perPage?: number;
    perTotal?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export async function GET() {
  const token = await getValidAccessToken();

  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED", retryable: false },
      { status: 401 }
    );
  }

  try {
    // The API returns every character when perPage is omitted. As the catalog
    // grows, that response eventually exceeds the API's 472 KB limit and the
    // dashboard loses its playable-character count. Fetch bounded pages and
    // combine them for the existing clients of this route.
    const page1 = await msfApiFetch<CharactersPage>({
      path: `/game/v1/characters?traitFormat=id&page=1&perPage=${PER_PAGE}`,
      accessToken: token,
    });

    const data = [...(page1.data ?? [])];
    const total = page1.meta?.perTotal ?? data.length;
    const pageCount = Math.ceil(total / PER_PAGE);

    if (pageCount > 1) {
      const remainingPages = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, index) =>
          msfApiFetch<CharactersPage>({
            path: `/game/v1/characters?traitFormat=id&page=${index + 2}&perPage=${PER_PAGE}`,
            accessToken: token,
          })
        )
      );

      for (const page of remainingPages) {
        data.push(...(page.data ?? []));
      }
    }

    return NextResponse.json({
      ...page1,
      data,
      meta: page1.meta
        ? { ...page1.meta, page: 1, perPage: data.length, perTotal: total }
        : undefined,
    });
  } catch (err) {
    console.error("MSF game characters fetch failed:", err);
    return NextResponse.json(
      {
        error: "Failed to load game characters",
        code: "MSF_API_ERROR",
        retryable: true,
      },
      { status: 502 }
    );
  }
}
