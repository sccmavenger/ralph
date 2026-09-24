import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { BootstrapRejectionError, runBootstrap, type BootstrapPrepared } from "../../src/lib/executive/bootstrap";
import { canonicalHash, sha256 } from "../../src/lib/executive/canonical";
import { checkExecutiveReadiness, type ExecutiveReadinessQuery } from "../../src/lib/executive/readiness";
import manifest from "../../src/lib/executive/m1-2-readiness-manifest.json";
import {
  connectTestDatabase, createIsolatedTestDatabase, createTestPrisma, EXECUTIVE_TABLES,
  FOUNDATION_MIGRATIONS, loadMigrationSql, validateTestEnvironment, type TestEnvironment,
} from "./test-database";

export function syntheticBootstrapPrepared(): BootstrapPrepared {
  const charter = { contentMarkdown: "# Synthetic Charter\n\nOnly an isolated test. Ω 资源\n",
    contentHash: sha256("# Synthetic Charter\n\nOnly an isolated test. Ω 资源\n"),
    sourceFileName: "synthetic-charter.docx", sourceFileHash: sha256("synthetic bytes, not the Owner DOCX"),
    title: "Synthetic Charter", manifestHash: sha256("synthetic manifest") };
  const envelope: BootstrapPrepared["envelope"] = {
    bootstrapVersion: 1, auditSchemaVersion: 1,
    office: { key: "msf-toolkit", name: "MSF Toolkit Executive Office", phase: "FOUNDATION", executionMode: "DISABLED", activeCharterAcceptanceId: null },
    owner: { displayName: "Synthetic Owner", contactEmail: "synthetic-owner@example.invalid", status: "PENDING_ENROLLMENT", authVersion: 1 },
    ceo: { roleKey: "CEO", displayName: "MSF Toolkit CEO", status: "ONBOARDING", roleDefinitionVersion: 1,
      governingCharterAcceptanceId: null, roleDefinition: { schemaVersion: 1, mission: "Synthetic descriptive mission",
        responsibilities: ["Learn from synthetic fixtures"], nonResponsibilities: ["No real action"], tools: [], permissions: [], spendingAuthority: false } },
    charter: { version: 1, title: charter.title, contentHash: charter.contentHash, sourceFileName: charter.sourceFileName,
      sourceFileHash: charter.sourceFileHash, manifestHash: charter.manifestHash, importedByOwnerId: null },
  };
  return { envelope, charter, bootstrapHash: canonicalHash(envelope) };
}

export function bootstrapReadiness(env: TestEnvironment, mode: "check" | "apply" = "apply") {
  const target = validateTestEnvironment(env);
  return async (tx: Prisma.TransactionClient) => {
    const query: ExecutiveReadinessQuery = <T extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) =>
      tx.$queryRawUnsafe<T[]>(sql, ...(values ?? []));
    const result = await checkExecutiveReadiness(query, { expectedDatabase: target.database, expectedRole: "exec_test_app", mode });
    if (!result.ready) throw new BootstrapRejectionError(result.diagnostics.some((entry) => entry.category === "privilege") ? "PRIVILEGE_FAILED" : "READINESS_FAILED");
  };
}

/** Actual accepted SQL + synthetic migration receipts. This fixture does NOT claim
 * Prisma deployment evidence; DB-15 separately runs actual Prisma migration CLI.
 * Never drops databases, resets, edits reviewed SQL or bypasses readiness. */
export async function createBootstrapFixture(suffix: string, options: { business?: boolean } = {}) {
  const env = await createIsolatedTestDatabase(`boot_${suffix}`);
  const owner = await connectTestDatabase("migrator", env);
  try {
    const names = options.business
      ? (await readdir(fileURLToPath(new URL("../../prisma/migrations", import.meta.url)))).filter((name) => /^\d{14}_/.test(name)).sort()
      : [...FOUNDATION_MIGRATIONS];
    const applied: { name: string; checksum: string }[] = [];
    for (const name of names) {
      // Windows checkout transport is normalized to the separately pinned committed LF bytes.
      const sql = (await loadMigrationSql(name)).replace(/\r\n/g, "\n");
      const checksum = sha256(sql);
      const pinned = manifest.migrations.find((entry) => entry.name === name);
      if (pinned) assert.equal(checksum, pinned.checksum, "Accepted migration bytes must match reviewed pin");
      await owner.query(sql);
      applied.push({ name, checksum });
    }
    await owner.query(`CREATE TABLE public._prisma_migrations (
      id varchar(36) PRIMARY KEY,checksum varchar(64) NOT NULL,migration_name varchar(255) NOT NULL,
      finished_at timestamptz,rolled_back_at timestamptz,started_at timestamptz NOT NULL DEFAULT now(),
      applied_steps_count integer NOT NULL DEFAULT 0,logs text)`);
    for (const migration of applied) await owner.query(`INSERT INTO public._prisma_migrations
      (id,checksum,migration_name,finished_at,applied_steps_count) VALUES ($1,$2,$3,now(),1)`, [randomUUID(), migration.checksum, migration.name]);
    await owner.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await owner.query("GRANT USAGE ON SCHEMA public TO exec_test_app");
    await owner.query("GRANT SELECT ON ALL TABLES IN SCHEMA public TO exec_test_app");
    for (const table of ["ExecutiveOffice", "ExecutiveOwner", "ExecutiveAgent", "ExecutiveCharter", "ExecutiveActivityEvent"]) {
      await owner.query(`GRANT INSERT ON public."${table}" TO exec_test_app`);
    }
    await owner.query('GRANT UPDATE ("updatedAt") ON public."ExecutiveOffice" TO exec_test_app');
    await owner.query('GRANT USAGE ON SEQUENCE public."ExecutiveActivityEvent_sequence_seq" TO exec_test_app');
    await owner.query("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC");
    await owner.query("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO exec_test_app");
    if (options.business) await seedBusinessSentinels(owner);
  } finally { await owner.end(); }
  const clients: PrismaClient[] = [];
  const newClient = async () => { const client = await createTestPrisma(env); clients.push(client); return client; };
  const client = await newClient();
  return {
    env, client, newClient, prepared: syntheticBootstrapPrepared(),
    readiness: bootstrapReadiness(env),
    async run(mode: "check" | "apply" = "apply", prepared = syntheticBootstrapPrepared(), useClient = client) {
      return runBootstrap({ client: useClient, mode, prepared, readiness: bootstrapReadiness(env, mode) });
    },
    async close() { await Promise.all(clients.map((entry) => entry.$disconnect())); },
  };
}
export type BootstrapFixture = Awaited<ReturnType<typeof createBootstrapFixture>>;

export async function executiveSnapshot(env: TestEnvironment) {
  const owner = await connectTestDatabase("migrator", env);
  try {
    const rows: Record<string, Record<string, unknown>[]> = {};
    for (const table of EXECUTIVE_TABLES) rows[table] = (await owner.query(`SELECT to_jsonb(t) AS row FROM public."${table}" t ORDER BY t.id`)).rows;
    const sequence = (await owner.query('SELECT last_value::text,is_called FROM public."ExecutiveActivityEvent_sequence_seq"')).rows;
    return { rows, sequence };
  } finally { await owner.end(); }
}

export async function businessSnapshot(env: TestEnvironment) {
  const owner = await connectTestDatabase("migrator", env);
  try {
    const tables = (await owner.query<{ name: string }>(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> '_prisma_migrations' AND left(c.relname,9)<>'Executive' ORDER BY c.relname`)).rows;
    const data: Record<string, unknown> = {};
    for (const { name } of tables) {
      assert.match(name, /^[A-Za-z][A-Za-z0-9]*$/);
      data[name] = {
        rows: (await owner.query(`SELECT to_jsonb(t) AS row FROM public."${name}" t ORDER BY t.id`)).rows,
        columns: (await owner.query(`SELECT attname,format_type(atttypid,atttypmod) AS type,attnotnull,
          pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE a.attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`, [`public."${name}"`])).rows,
        constraints: (await owner.query(`SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname`, [`public."${name}"`])).rows,
        indexes: (await owner.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=$1 ORDER BY indexname", [name])).rows,
      };
    }
    assert.equal(tables.length, 22);
    assert.equal(Object.hasOwn(data, "TowerResult"), false);
    return data;
  } finally { await owner.end(); }
}

async function seedBusinessSentinels(owner: Client) {
  const now = new Date("2026-09-24T12:00:00Z");
  const rows: Record<string, Record<string, unknown>> = {
    Commander: { id: "business_commander", scopelyId: "synthetic-bootstrap", updatedAt: now },
    RosterSnapshot: { commanderId: "business_commander", snapshotData: '{"synthetic":true}' },
    InventorySnapshot: { commanderId: "business_commander", snapshotData: '{"synthetic":true}' },
    AdvisorConversation: { id: "business_conversation", commanderId: "business_commander", title: "Synthetic", updatedAt: now },
    AdvisorMessage: { conversationId: "business_conversation", role: "user", content: "Synthetic" },
    AdvisorQuestionLog: { commanderId: "business_commander", question: "Synthetic?", category: "test", confidenceScore: 1, answeredSuccessfully: false },
    KnowledgeGap: { clusteredQuestion: "Synthetic?", category: "test", gapType: "synthetic", updatedAt: now },
    AiActionItem: { sourceType: "synthetic", sourceId: "sentinel", title: "Synthetic", updatedAt: now },
    CommanderNotification: { commanderId: "business_commander", type: "synthetic", title: "Synthetic", message: "Not delivered" },
    DailyTip: { commanderId: "business_commander", content: "Not delivered" },
    PushSubscription: { commanderId: "business_commander", endpoint: "https://example.invalid/test", p256dh: "synthetic", auth: "synthetic" },
    DailyTokenUsage: { commanderId: "business_commander", date: now, tokensUsed: 7 },
    FeatureFlag: { key: "synthetic", enabled: false },
    ApiCache: { endpoint: "synthetic", hashValue: "synthetic", responseData: '{"synthetic":true}' },
    UsageEvent: { commanderId: "business_commander", eventType: "synthetic", eventName: "synthetic", tier: "FREE" },
    ChurnIntervention: { commanderId: "business_commander", type: "synthetic", channel: "none" },
    EmailDelivery: { commanderId: "business_commander", recipientHash: "synthetic", messageType: "synthetic", subject: "Not sent", idempotencyKey: "synthetic", updatedAt: now },
    CancellationFeedbackCase: { id: "business_case", commanderId: "business_commander", cancellationKey: "synthetic", stripeSubscriptionId: "synthetic", cancellationRequestedAt: now, scheduledAt: now, updatedAt: now },
    CancellationFeedbackResponse: { caseId: "business_case", source: "synthetic", body: "Synthetic" },
    StripeWebhookEvent: { type: "synthetic", updatedAt: now },
    GameCharacter: { characterId: "synthetic", name: "Synthetic" },
    CommanderWallet: { commanderId: "business_commander", gold: 17, cores: 3, updatedAt: now },
  };
  for (const [table, value] of Object.entries(rows)) {
    const row = { id: `business_${table}`, ...value };
    const columns = Object.keys(row);
    await owner.query(`INSERT INTO public."${table}" (${columns.map((column) => `"${column}"`).join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
  }
}

export type TransactionOperation = { model: string; method: string; args: unknown[]; result: unknown; transaction: Prisma.TransactionClient };
/** Test-composition interception of REAL database operations. No readiness bypass. */
export function interceptBootstrapClient(client: PrismaClient, hooks: {
  afterOperation?: (operation: TransactionOperation) => Promise<void>;
  afterCommitted?: () => Promise<void>;
}): PrismaClient {
  return new Proxy(client, {
    get(target, property) {
      if (property !== "$transaction") { const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value; }
      return async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: Parameters<PrismaClient["$transaction"]>[1]) => {
        const result = await target.$transaction(async (tx) => {
          const wrap = (subject: object, model: string): object => new Proxy(subject, {
            get(inner, method) {
              const value = Reflect.get(inner, method);
              if (typeof value !== "function") return value;
              return async (...args: unknown[]) => {
                const response: unknown = await Reflect.apply(value, inner, args);
                await hooks.afterOperation?.({ model, method: String(method), args, result: response, transaction: tx });
                return response;
              };
            },
          });
          const wrapped = new Proxy(tx, {
            get(inner, key) {
              const value = Reflect.get(inner, key);
              if (typeof value === "function") return Reflect.get(wrap(inner, "$transaction"), key);
              if (typeof key === "string" && key.startsWith("executive") && value && typeof value === "object") return wrap(value, key);
              return value;
            },
          });
          return operation(wrapped);
        }, options);
        await hooks.afterCommitted?.();
        return result;
      };
    },
  });
}
