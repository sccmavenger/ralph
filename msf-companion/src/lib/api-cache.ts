import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { msfApiFetch } from "@/lib/msf-api";

interface MetaResponse {
  data?: unknown;
  meta?: { hashes?: { all?: string } };
}

/**
 * Fetch an MSF API endpoint with optional meta hash caching.
 * When the "meta_hash_caching" feature flag is enabled and the cached hash
 * matches the current meta.hashes.all, the cached response is returned.
 */
export async function cachedMsfApiFetch<T>(opts: {
  path: string;
  accessToken: string;
  cacheKey?: string;
}): Promise<T> {
  const cacheKey = opts.cacheKey ?? opts.path;
  const cachingEnabled = await isFeatureEnabled("meta_hash_caching");

  if (cachingEnabled) {
    // First do a lightweight fetch to get the current hash
    const probeRes = await msfApiFetch<MetaResponse>({
      path: opts.path,
      accessToken: opts.accessToken,
    });

    const currentHash = probeRes.meta?.hashes?.all;

    if (currentHash) {
      const cached = await prisma.apiCache.findUnique({
        where: { endpoint: cacheKey },
      });

      if (cached && cached.hashValue === currentHash) {
        return cached.responseData as T;
      }

      // Hash differs or no cache — store the probe response as fresh cache
      await prisma.apiCache.upsert({
        where: { endpoint: cacheKey },
        create: {
          endpoint: cacheKey,
          hashValue: currentHash,
          responseData: probeRes as object,
          cachedAt: new Date(),
        },
        update: {
          hashValue: currentHash,
          responseData: probeRes as object,
          cachedAt: new Date(),
        },
      });

      return probeRes as T;
    }

    // No hash in response — return as-is without caching
    return probeRes as T;
  }

  // Caching disabled — normal fetch
  return msfApiFetch<T>({ path: opts.path, accessToken: opts.accessToken });
}
