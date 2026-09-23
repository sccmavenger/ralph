import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client, type ClientConfig } from "pg";

export type TestEnvironment = Readonly<Record<string, string | undefined>>;
export type TestRole = "app" | "migrator";
export const TEST_DATABASE_PORT = 55432;
export const TEST_ROLE_NAMES = {
  app: "exec_test_app",
  migrator: "exec_test_migrator",
} as const;

/** Pure, fail-closed validation. Error messages never interpolate URL/secrets. */
export function validateTestDatabaseUrl(
  value: string | undefined,
  role: TestRole,
  env: TestEnvironment = process.env,
): string {
  if (env.NODE_ENV !== "test") throw new Error("Executive DB tests require NODE_ENV=test");
  if (role !== "app" && role !== "migrator") throw new Error("Unknown Executive test role");
  if (!value) throw new Error("Explicit Executive test database URL is required");
  // Raw matching deliberately disallows URL-normalized hosts (127.1, hex/octal,
  // DNS, IPv6), encoded database/role names, query overrides, and fragments.
  const match = /^(postgresql|postgres):\/\/([^:@/?#\s]+):([^@/?#\s]+)@127\.0\.0\.1:55432\/(msf_exec_m12_[a-z0-9][a-z0-9_]{0,49})$/.exec(value);
  if (!match || match[0] !== value || match[2] !== TEST_ROLE_NAMES[role]) {
    throw new Error("Executive test URL must use its named role and the fixed loopback target");
  }
  let password: string;
  try {
    password = decodeURIComponent(match[3]);
  } catch {
    throw new Error("Executive test URL contains invalid credential encoding");
  }
  if (!password.trim() || /[\u0000-\u001f\u007f]/.test(password)) {
    throw new Error("Executive test password must be explicit and nonempty");
  }
  if (env.EXECUTIVE_TEST_DATABASE_CONFIRM !== match[4]) {
    throw new Error("Executive test database confirmation must exactly match its run-specific name");
  }
  return value;
}

export function validateTestEnvironment(env: TestEnvironment = process.env) {
  const appUrl = validateTestDatabaseUrl(env.EXECUTIVE_TEST_DATABASE_URL, "app", env);
  const migrationUrl = validateTestDatabaseUrl(env.EXECUTIVE_TEST_MIGRATION_DATABASE_URL, "migrator", env);
  return { appUrl, migrationUrl, database: env.EXECUTIVE_TEST_DATABASE_CONFIRM! };
}

function clientConfiguration(role: TestRole, env: TestEnvironment): ClientConfig {
  if (role !== "app" && role !== "migrator") throw new Error("Unknown Executive test role");
  const target = validateTestEnvironment(env);
  const url = new URL(role === "app" ? target.appUrl : target.migrationUrl);
  // Explicit fields additionally prevent libpq-style environment fallbacks.
  return {
    host: "127.0.0.1",
    port: TEST_DATABASE_PORT,
    database: target.database,
    user: TEST_ROLE_NAMES[role],
    password: decodeURIComponent(url.password),
    ssl: false,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    query_timeout: 20_000,
    options: "-c lock_timeout=5000",
    application_name: "msf-m12-disposable-tests",
  };
}

export async function connectTestDatabase(role: TestRole = "app", env: TestEnvironment = process.env) {
  const client = new Client(clientConfiguration(role, env));
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}

export async function createTestPrisma(env: TestEnvironment = process.env, role: TestRole = "app") {
  const config = clientConfiguration(role, env);
  // Lazy import: pure URL tests/config loading need no generated client or DB.
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import("../../src/generated/prisma/client"),
    import("@prisma/adapter-pg"),
  ]);
  return new PrismaClient({ adapter: new PrismaPg(config) });
}

/** Only creates a child of the CI-owned disposable target; never drops/resets. */
export async function createIsolatedTestDatabase(suffix: string, env: TestEnvironment = process.env) {
  const base = validateTestEnvironment(env);
  if (!/^[a-z][a-z0-9_]{0,23}$/.test(suffix)) throw new Error("Invalid isolated database suffix");
  const database = `${base.database}_${suffix}`;
  const childUrl = (value: string) => {
    const url = new URL(value);
    url.pathname = `/${database}`;
    return url.href;
  };
  const child: TestEnvironment = {
    ...env,
    EXECUTIVE_TEST_DATABASE_URL: childUrl(base.appUrl),
    EXECUTIVE_TEST_MIGRATION_DATABASE_URL: childUrl(base.migrationUrl),
    EXECUTIVE_TEST_DATABASE_CONFIRM: database,
  };
  validateTestEnvironment(child); // Validate the new name before opening any client.
  const client = await connectTestDatabase("migrator", env);
  try {
    // Name is restricted to lowercase letters/digits/underscore by the guard.
    await client.query(`CREATE DATABASE "${database}" OWNER exec_test_migrator`);
  } finally { await client.end(); }
  return child;
}

export async function grantTestApplicationAccess(client: Client, options: { allowTruncate?: boolean } = {}) {
  // Caller supplies an already guarded migrator connected to a disposable DB.
  // Never used by production migrations or application code.
  await client.query("GRANT USAGE ON SCHEMA public TO exec_test_app");
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE${options.allowTruncate ? ", TRUNCATE" : ""} ON ALL TABLES IN SCHEMA public TO exec_test_app`);
  await client.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO exec_test_app");
}

/** Always roll back; immutable history is never deleted/truncated for cleanup. */
export async function withTestTransaction<T>(
  operation: (client: Client) => Promise<T>,
  role: TestRole = "app",
  env: TestEnvironment = process.env,
): Promise<T> {
  const client = await connectTestDatabase(role, env);
  try {
    await client.query("BEGIN");
    return await operation(client);
  } finally {
    try { await client.query("ROLLBACK"); } finally { await client.end(); }
  }
}

export const EXECUTIVE_TABLES = [
  "ExecutiveOffice", "ExecutiveOwner", "ExecutiveOwnerCredential",
  "ExecutiveOwnerEnrollment", "ExecutiveOwnerChallenge", "ExecutiveOwnerSession",
  "ExecutiveAuthRateLimit", "ExecutiveAgent", "ExecutiveCharter",
  "ExecutiveCharterAcceptance", "ExecutiveActivityEvent",
] as const;
export type ExecutiveTable = typeof EXECUTIVE_TABLES[number];
export type FixtureRow = Record<string, unknown>;

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(identifier)) throw new Error("Invalid fixture column");
  return `"${identifier}"`;
}

export function insertStatement(table: ExecutiveTable, row: FixtureRow) {
  if (!(EXECUTIVE_TABLES as readonly string[]).includes(table)) throw new Error("Invalid fixture table");
  const columns = Object.keys(row).filter((column) => row[column] !== undefined);
  assert.ok(columns.length > 0);
  const values = columns.map((column) => {
    const value = row[column];
    return ["transports", "roleDefinition", "metadata"].includes(column)
      && value !== null && value !== undefined ? JSON.stringify(value) : value;
  });
  return {
    text: `INSERT INTO public.${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
    values,
  };
}

export async function insertRow(client: Client, table: ExecutiveTable, row: FixtureRow) {
  return client.query(insertStatement(table, row));
}

/** Expected failures recover the transaction; uses Node assertions, never Vitest. */
export async function expectSqlFailure(
  client: Client, sql: string, values: unknown[] = [], expectedCode = "23514",
) {
  await client.query("SAVEPOINT expected_failure");
  let caught: unknown;
  try { await client.query(sql, values); } catch (error) { caught = error; }
  finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_failure");
    await client.query("RELEASE SAVEPOINT expected_failure");
  }
  assert.ok(caught, "Expected SQL to be rejected");
  assert.equal((caught as { code?: string }).code, expectedCode);
  return caught as Error & { code: string; constraint?: string };
}

export async function expectInsertFailure(
  client: Client, table: ExecutiveTable, row: FixtureRow, expectedCode = "23514",
) {
  const query = insertStatement(table, row);
  return expectSqlFailure(client, query.text, query.values, expectedCode);
}

export const FOUNDATION_MIGRATIONS = [
  "20260922090000_executive_foundation",
  "20260922090100_executive_immutability_guards",
] as const;

export async function loadMigrationSql(name: string) {
  if (!/^\d{14}_[a-z0-9_]+$/.test(name)) throw new Error("Invalid migration filename");
  const path = fileURLToPath(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url));
  return readFile(path, "utf8");
}

export function sha256(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }

/** Synthetic schema fixture, not a real bootstrap, auth, acceptance, or audit service. */
export function foundationFixture(prefix = "fixture") {
  assert.match(prefix, /^[a-zA-Z0-9_-]{1,40}$/);
  const ids = Object.fromEntries([
    "office", "owner", "credential", "enrollment", "challenge", "session", "rateLimit",
    "agent", "charter", "acceptance", "event",
  ].map((key) => [key, `${prefix}_${key}`])) as Record<
    "office" | "owner" | "credential" | "enrollment" | "challenge" | "session"
    | "rateLimit" | "agent" | "charter" | "acceptance" | "event", string>;
  const now = new Date("2026-09-22T12:00:00.000Z");
  const later = new Date(now.getTime() + 60_000);
  const expiry = new Date(now.getTime() + 600_000);
  const content = "# Synthetic Charter\n\nCommander Ω — 资源\n";
  const contentHash = sha256(content);
  const created = { createdAt: now };
  const updated = { ...created, updatedAt: now };
  const rows: Record<ExecutiveTable, FixtureRow> = {
    ExecutiveOffice: { id: ids.office, ...updated, key: "msf-toolkit", name: "Synthetic Office", phase: "FOUNDATION", executionMode: "DISABLED", bootstrapVersion: 1, bootstrapHash: sha256(`${prefix}:bootstrap`), activeCharterAcceptanceId: null },
    ExecutiveOwner: { id: ids.owner, ...updated, officeId: ids.office, displayName: "Synthetic Owner", contactEmail: null, status: "PENDING_ENROLLMENT", webauthnUserId: createHash("sha256").update(`${prefix}:handle`).digest("base64url"), authVersion: 1 },
    ExecutiveOwnerCredential: { id: ids.credential, ...created, ownerId: ids.owner, credentialId: Buffer.from(`${prefix}:external-credential`).toString("base64url"), publicKey: Buffer.from([1, 2, 3]), counter: BigInt(0), rpId: "localhost", label: "Synthetic passkey", transports: ["internal"], deviceType: "singleDevice", backedUp: false, lastUsedAt: null, revokedAt: null },
    ExecutiveOwnerEnrollment: { id: ids.enrollment, ...created, ownerId: ids.owner, purpose: "INITIAL", tokenHash: sha256(`${prefix}:grant`), expiresAt: expiry, consumedAt: null, revokedAt: null, operatorReason: "Synthetic fixture only" },
    ExecutiveOwnerChallenge: { id: ids.challenge, ...created, ownerId: ids.owner, purpose: "SIGN_IN", challenge: Buffer.from(`${prefix}:challenge`).toString("base64url"), browserBindingHash: sha256(`${prefix}:browser`), enrollmentId: null, sessionId: null, authVersion: 1, expiresAt: expiry, consumedAt: null },
    ExecutiveOwnerSession: { id: ids.session, ...created, ownerId: ids.owner, credentialId: ids.credential, tokenHash: sha256(`${prefix}:session`), authVersion: 1, verifiedAt: now, lastSeenAt: now, idleExpiresAt: expiry, absoluteExpiresAt: new Date(now.getTime() + 3_600_000), revokedAt: null },
    ExecutiveAuthRateLimit: { id: ids.rateLimit, ...updated, bucketKeyHash: sha256(`${prefix}:bucket`), attemptCount: 0, windowStartedAt: now, blockedUntil: null, expiresAt: expiry },
    ExecutiveAgent: { id: ids.agent, ...updated, officeId: ids.office, roleKey: "CEO", displayName: "Synthetic CEO", reportsToOwnerId: ids.owner, status: "ONBOARDING", roleDefinitionVersion: 1, roleDefinition: { schemaVersion: 1, mission: "Synthetic description", responsibilities: ["Learn"], nonResponsibilities: ["Execute"], tools: [], permissions: [], spendingAuthority: false }, governingCharterAcceptanceId: null },
    ExecutiveCharter: { id: ids.charter, ...created, officeId: ids.office, version: 1, title: "Synthetic Charter", contentMarkdown: content, contentHash, sourceFileName: "synthetic-charter.md", sourceFileHash: sha256("Synthetic source"), importedByOwnerId: null },
    ExecutiveCharterAcceptance: { id: ids.acceptance, createdAt: later, officeId: ids.office, charterId: ids.charter, ownerId: ids.owner, ownerCredentialId: ids.credential, ownerSessionRef: ids.session, contentHash, verifiedAt: now, acceptedAt: later, requestKey: `${prefix}_request` },
    ExecutiveActivityEvent: { id: ids.event, ...created, officeId: ids.office, eventType: "fixture.created", actorType: "OPERATOR", actorOwnerId: null, subjectType: "Fixture", subjectId: ids.office, requestId: `${prefix}_correlation`, outcome: "SUCCESS", metadata: { synthetic: true }, occurredAt: now },
  };
  return { ids, rows, now, contentHash };
}

export async function insertFoundation(client: Client, prefix = "fixture") {
  const fixture = foundationFixture(prefix);
  for (const table of EXECUTIVE_TABLES) await insertRow(client, table, fixture.rows[table]);
  return fixture;
}
