/**
 * Cloudflare Worker entrypoint for the MSF Companion web app (MSF-5, Phase 1).
 *
 * The Worker is a thin front door: every request is forwarded into a container
 * running the existing production image, built from the unmodified Dockerfile.
 * The app itself is unchanged.
 */
import { DurableObject } from "cloudflare:workers";

/** The port the Next.js standalone server listens on (Dockerfile: ENV PORT=3000). */
const CONTAINER_PORT = 3000;

/**
 * Keep the container warm for 10 minutes after the last request. Azure ran
 * minReplicas: 1 (always on); Cloudflare bills provisioned memory per second,
 * so a timeout trades a cold start on an idle site for a lower bill. Raise this
 * if cold starts show up in real traffic.
 */
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 1/2 vCPU + 4 GiB. Azure Container Apps gave 0.5 vCPU / 1 GiB; this matches
 * the vCPU exactly and raises memory, because memory is the axis the app has
 * headroom on today and CPU starvation is the harder failure to diagnose.
 * `basic` (1/4 vCPU, 1 GiB) is roughly a quarter of the memory cost but halves
 * CPU against Azure — revisit once Phase 1 has real traffic numbers.
 */
const INSTANCE_TYPE = "standard-1";

/** How long to wait for the Next.js server to start accepting requests. */
const READINESS_ATTEMPTS = 150;
const READINESS_INTERVAL_MS = 200;

/**
 * A single container instance serves all traffic, matching Azure's steady
 * state of one replica. Azure could scale to 3 on load; adding instances here
 * means routing across several Durable Object names, which keeps each one warm
 * and multiplies the memory bill. That is a deliberate Phase 2 decision, taken
 * against measured load rather than guessed.
 */
const CONTAINER_INSTANCE_NAME = "web";

/**
 * Runtime configuration forwarded into the container. These mirror the `env`
 * block of infra/app/web.bicep, so the app sees the same variables it sees on
 * Azure today.
 *
 * APPLICATIONINSIGHTS_CONNECTION_STRING is intentionally absent: telemetry
 * moves to Workers Logs (see "observability" in wrangler.jsonc).
 */
const FORWARDED_ENV_KEYS = [
  "DATABASE_URL",
  "MSF_API_KEY",
  "SCOPELY_CLIENT_ID",
  "SCOPELY_CLIENT_SECRET",
  "SCOPELY_REDIRECT_URI",
  "SESSION_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_KEY",
  "AZURE_OPENAI_GPT4O_MINI_DEPLOYMENT",
  "AZURE_AI_SEARCH_ENDPOINT",
  "AZURE_AI_SEARCH_KEY",
  // Guards the /api/cron/* routes that .github/workflows/refresh-kb.yml calls.
  "CRON_SECRET",
  "YOUTUBE_API_KEY",
  "RESEND_API_KEY",
] as const;

/**
 * `Env` is generated into worker-configuration.d.ts by `wrangler types` and
 * covers the bindings declared in wrangler.jsonc. Secrets are set with
 * `wrangler secret put` rather than in config, so they are declared here —
 * optional, because a deploy can be missing one.
 */
type WorkerEnv = Env &
  Partial<Record<(typeof FORWARDED_ENV_KEYS)[number], string>>;

export class WebContainer extends DurableObject<WorkerEnv> {
  private starting: Promise<void> | undefined;
  private monitoring: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    const container = ctx.container;
    if (container?.running) {
      // Restore the timeout and exit monitoring after a Durable Object restart.
      void ctx.blockConcurrencyWhile(() =>
        container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS),
      );
      this.observeExit();
    }
  }

  async fetch(request: Request): Promise<Response> {
    // Share startup across concurrent requests, including after a failed attempt.
    this.starting ??= this.startAndWaitForPort().finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    return this.ctx.container!.getTcpPort(CONTAINER_PORT).fetch(
      toContainerRequest(request),
    );
  }

  private async startAndWaitForPort(): Promise<void> {
    const container = this.ctx.container!;

    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: INSTANCE_TYPE,
        // MUST stay true. The app calls Stripe, Resend, the Scopely OAuth
        // endpoints, the MSF API and its own PostgreSQL host. The Cloudflare
        // container template defaults this to false, which would leave the app
        // up but unable to log anyone in or take a payment.
        enableInternet: true,
        env: this.containerEnv(),
      });
    }

    this.observeExit();
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);

    // `running` means startup was requested, not that Next.js is listening.
    const port = container.getTcpPort(CONTAINER_PORT);
    for (let attempt = 0; attempt < READINESS_ATTEMPTS; attempt += 1) {
      try {
        const response = await port.fetch("http://container/api/health", {
          signal: AbortSignal.timeout(1000),
        });
        await response.body?.cancel();
        if (response.ok) return;
      } catch {
        // The port may not be listening yet. Retry the readiness probe only.
      }
      await scheduler.wait(READINESS_INTERVAL_MS);
    }

    throw new Error(
      `Container did not become ready on port ${CONTAINER_PORT} within ` +
        `${(READINESS_ATTEMPTS * READINESS_INTERVAL_MS) / 1000}s`,
    );
  }

  /** Secrets and plain vars from the Worker, minus anything unset. */
  private containerEnv(): Record<string, string> {
    const containerEnv: Record<string, string> = { NODE_ENV: "production" };
    for (const key of FORWARDED_ENV_KEYS) {
      const value = this.env[key];
      if (typeof value === "string" && value.length > 0) {
        containerEnv[key] = value;
      }
    }
    return containerEnv;
  }

  private observeExit(): void {
    if (this.monitoring) return;
    this.monitoring = this.ctx
      .container!.monitor()
      .then(() => console.log("Container exited successfully"))
      .catch((error: unknown) => console.error("Container failed:", error))
      .finally(() => {
        this.monitoring = undefined;
      });
    this.ctx.waitUntil(this.monitoring);
  }
}

/**
 * Rewrite a public request so it can be addressed to the container, while
 * preserving the caller's original host and scheme.
 *
 * This is not cosmetic. src/app/api/auth/callback/route.ts and
 * src/app/api/auth/refresh/route.ts build their public base URL from
 * `x-forwarded-host` -> `host` -> `new URL(request.url).host`. Forwarding
 * without these headers (as the stock Cloudflare container example does) makes
 * both resolve to the internal `container` host, so Scopely OAuth sign-in and
 * token refresh would redirect users to `https://container/...`.
 */
function toContainerRequest(request: Request): Request {
  const originalUrl = new URL(request.url);

  const containerUrl = new URL(request.url);
  containerUrl.protocol = "http:";
  containerUrl.host = "container";

  const forwarded = new Request(containerUrl, request);
  forwarded.headers.delete("host");
  // Only set these from the real edge request; never trust a client-supplied value.
  forwarded.headers.set("x-forwarded-host", originalUrl.host);
  forwarded.headers.set(
    "x-forwarded-proto",
    originalUrl.protocol.replace(":", ""),
  );
  return forwarded;
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return env.WEB_CONTAINER.getByName(CONTAINER_INSTANCE_NAME).fetch(request);
  },
} satisfies ExportedHandler<WorkerEnv>;
