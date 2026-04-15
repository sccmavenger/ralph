const MSF_API_BASE = "https://api.marvelstrikeforce.com";

const MSF_API_KEY = process.env.MSF_API_KEY!;

interface MsfApiOptions {
  path: string;
  accessToken: string;
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

export async function msfApiFetch<T>({
  path,
  accessToken,
  method = "GET",
  body,
  params,
}: MsfApiOptions): Promise<T> {
  let url = `${MSF_API_BASE}${path}`;

  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      "x-api-key": MSF_API_KEY,
      "User-Agent": "APIClient/1.0 (Server)",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`MSF API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}
