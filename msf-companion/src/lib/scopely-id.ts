import { getSession } from "@/lib/session";

const HYDRA_USERINFO_URL =
  "https://hydra-public.prod.m3.scopelypv.com/userinfo";

/**
 * Get the scopelyId from the session, falling back to the Hydra userinfo endpoint
 * if the session doesn't have one (opaque token scenario).
 *
 * @param canSaveSession - If true (Route Handlers only), persist the recovered scopelyId to the session.
 *   Pass false from Server Components where session.save() would throw.
 */
export async function getScopelyId(
  canSaveSession: boolean = false
): Promise<string | null> {
  const session = await getSession();

  if (session.scopelyId) {
    return session.scopelyId;
  }

  // Fallback: resolve from Hydra userinfo using the access token
  if (!session.accessToken) return null;

  try {
    const res = await fetch(HYDRA_USERINFO_URL, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!res.ok) return null;

    const userinfo = await res.json();
    const sub = userinfo.sub as string | undefined;
    if (!sub) return null;

    // Persist to session if allowed (Route Handlers only)
    if (canSaveSession) {
      session.scopelyId = sub;
      await session.save();
    }

    return sub;
  } catch {
    return null;
  }
}
