import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import {
  checkExecutiveReadiness, collectExecutiveCatalog, type ExecutiveReadinessQuery,
  type ReadinessOptions,
} from "../../src/lib/executive/readiness";
import manifest from "../../src/lib/executive/m1-2-readiness-manifest.json";
import {
  connectTestDatabase, createIsolatedTestDatabase, EXECUTIVE_TABLES,
  FOUNDATION_MIGRATIONS, loadMigrationSql, validateTestEnvironment, type TestEnvironment,
} from "./test-database";

let fixtureNumber = 0;
let baseline: TestEnvironment;
const recordedQueries: { sql: string; rows: Record<string, unknown>[] }[] = [];
const appRole = "exec_test_app";

function pgQuery(client: Client): ExecutiveReadinessQuery {
  return async <T extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) =>
    (await client.query<T>(sql, values ? [...values] : undefined)).rows;
}

function options(env: TestEnvironment): ReadinessOptions {
  return { expectedDatabase: validateTestEnvironment(env).database, expectedRole: appRole, mode: "check" };
}

/** These are synthetic metadata fixtures, NOT evidence that Prisma deployed a
 * migration. Real CLI migration replay remains covered by the existing DB-15 suite.
 * Every catalog comes from the actual reviewed SQL on a newly owned child DB. */
async function preparedDatabase(
  change?: (owner: Client) => Promise<void>,
): Promise<TestEnvironment> {
  const env = await createIsolatedTestDatabase(`ready_${++fixtureNumber}`);
  const owner = await connectTestDatabase("migrator", env);
  try {
    for (const name of FOUNDATION_MIGRATIONS) await owner.query(await loadMigrationSql(name));
    await owner.query(`CREATE TABLE public._prisma_migrations (
      id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL, migration_name varchar(255) NOT NULL,
      finished_at timestamptz, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(),
      applied_steps_count integer NOT NULL DEFAULT 0, logs text)`);
    for (const migration of manifest.migrations) {
      await owner.query(`INSERT INTO public._prisma_migrations
        (id,checksum,migration_name,finished_at,applied_steps_count) VALUES ($1,$2,$3,now(),1)`,
      [randomUUID(), migration.checksum, migration.name]);
    }
    await owner.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await owner.query("GRANT USAGE ON SCHEMA public TO exec_test_app");
    await owner.query("GRANT SELECT ON ALL TABLES IN SCHEMA public TO exec_test_app");
    for (const name of ["ExecutiveOffice", "ExecutiveOwner", "ExecutiveAgent", "ExecutiveCharter", "ExecutiveActivityEvent"]) {
      await owner.query(`GRANT INSERT ON public."${name}" TO exec_test_app`);
    }
    await owner.query('GRANT UPDATE ("updatedAt") ON public."ExecutiveOffice" TO exec_test_app');
    await owner.query('GRANT USAGE ON SEQUENCE public."ExecutiveActivityEvent_sequence_seq" TO exec_test_app');
    await owner.query("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC");
    await owner.query("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO exec_test_app");
    if (change) await change(owner);
  } finally { await owner.end(); }
  return env;
}

async function inspect(env: TestEnvironment, record = false) {
  const client = await connectTestDatabase("app", env);
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL search_path=pg_catalog");
    const query: ExecutiveReadinessQuery = async <T extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
      // The checker itself may only SELECT; transaction setup is caller-owned.
      expect(sql.trimStart()).toMatch(/^(SELECT|WITH)\b/);
      const statementsOnly = sql.replace(/'(?:[^']|'')*'/g, "''");
      expect(statementsOnly).not.toMatch(/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|nextval|setval)\b/i);
      const rows = await pgQuery(client)<T>(sql, values);
      if (record) recordedQueries.push({ sql, rows: structuredClone(rows) });
      return rows;
    };
    return await checkExecutiveReadiness(query, options(env));
  } finally {
    try { await client.query("ROLLBACK"); } finally { await client.end(); }
  }
}

beforeAll(async () => {
  validateTestEnvironment(); // No implicit dotenv or application singleton.
  baseline = await preparedDatabase();
  expect(await inspect(baseline, true)).toEqual({ ready: true, diagnostics: [] });
});

describe("BOOT-09/10/11 SELECT-only migration, full catalog and effective privilege readiness", () => {
  it("accepts the reviewed PG16 contract with minimal grants without consuming a sequence or creating rows", async () => {
    const owner = await connectTestDatabase("migrator", baseline);
    try {
      const before = (await owner.query('SELECT last_value,is_called FROM public."ExecutiveActivityEvent_sequence_seq"')).rows;
      expect(await inspect(baseline)).toEqual({ ready: true, diagnostics: [] });
      expect((await owner.query('SELECT last_value,is_called FROM public."ExecutiveActivityEvent_sequence_seq"')).rows).toEqual(before);
      for (const table of EXECUTIVE_TABLES) {
        expect((await owner.query(`SELECT count(*)::int AS count FROM public."${table}"`)).rows[0].count).toBe(0);
      }
    } finally { await owner.end(); }
  });

  it("collects deterministic OID/owner/data-free expected catalog facts on a read-only connection", async () => {
    const client = await connectTestDatabase("app", baseline);
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL search_path=pg_catalog");
      const observed = await collectExecutiveCatalog(pgQuery(client));
      expect(observed).toEqual(manifest.catalog);
      expect(observed.tables).toHaveLength(11);
      expect(observed.columns).toHaveLength(116);
      expect(observed.indexes).toHaveLength(52);
      expect(observed.functions).toHaveLength(8);
      expect(observed.triggers.filter((row) => row.internal)).toHaveLength(80);
      expect(observed.triggers.filter((row) => !row.internal)).toHaveLength(26);
    } finally {
      try { await client.query("ROLLBACK"); } finally { await client.end(); }
    }
  });

  it.each([
    ["missing required record", "DELETE FROM public._prisma_migrations WHERE migration_name=$1"],
    ["wrong checksum", "UPDATE public._prisma_migrations SET checksum=repeat('0',64) WHERE migration_name=$1"],
    ["zero applied steps", "UPDATE public._prisma_migrations SET applied_steps_count=0 WHERE migration_name=$1"],
    ["unfinished record", "UPDATE public._prisma_migrations SET finished_at=NULL WHERE migration_name=$1"],
    ["rolled-back only record", "UPDATE public._prisma_migrations SET finished_at=NULL,rolled_back_at=now() WHERE migration_name=$1"],
    ["duplicate success", `INSERT INTO public._prisma_migrations (id,checksum,migration_name,finished_at,applied_steps_count)
      SELECT 'duplicate-success',checksum,migration_name,finished_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1`],
  ])("rejects %s without fetching migration logs", async (_name, sql) => {
    const env = await preparedDatabase(async (owner) => { await owner.query(sql, [FOUNDATION_MIGRATIONS[0]]); });
    const result = await inspect(env);
    expect(result.ready).toBe(false);
    expect(result.diagnostics).toContainEqual({ category: "migration", reason: "REQUIRED_MIGRATION_INVALID" });
    expect(recordedQueries.every(({ sql: executed }) => !/\blogs\b/.test(executed))).toBe(true);
  });

  it("allows old explicitly rolled-back attempts and unrelated successful application migrations", async () => {
    const env = await preparedDatabase(async (owner) => {
      await owner.query(`INSERT INTO public._prisma_migrations
        (id,checksum,migration_name,finished_at,rolled_back_at,applied_steps_count,logs) VALUES
        ('rolled-back',repeat('0',64),$1,NULL,now(),0,'synthetic private failure detail'),
        ('application',repeat('0',64),'synthetic_unrelated_completed',now(),NULL,1,NULL)`, [FOUNDATION_MIGRATIONS[0]]);
    });
    expect(await inspect(env)).toEqual({ ready: true, diagnostics: [] });
  });

  it("rejects an unresolved failure anywhere in the migration history", async () => {
    const env = await preparedDatabase(async (owner) => {
      await owner.query(`INSERT INTO public._prisma_migrations (id,checksum,migration_name)
        VALUES ('failed-unrelated',repeat('0',64),'synthetic_unrelated_failed')`);
    });
    expect((await inspect(env)).diagnostics).toContainEqual({ category: "migration", reason: "UNRESOLVED_MIGRATION" });
  });

  const catalogMutations: [string, string][] = [
    ["disabled trigger", 'ALTER TABLE public."ExecutiveOffice" DISABLE TRIGGER exec_update_guard'],
    ["replica-only trigger", 'ALTER TABLE public."ExecutiveOffice" ENABLE REPLICA TRIGGER exec_update_guard'],
    ["always-enabled replacement", 'ALTER TABLE public."ExecutiveOffice" ENABLE ALWAYS TRIGGER exec_update_guard'],
    ["missing trigger", 'DROP TRIGGER exec_update_guard ON public."ExecutiveOffice"'],
    ["unexpected trigger", `CREATE TRIGGER synthetic_extra BEFORE UPDATE ON public."ExecutiveOffice"
      FOR EACH ROW EXECUTE FUNCTION public.exec_guard_foundation_update()`],
    ["conditional trigger", `DROP TRIGGER exec_update_guard ON public."ExecutiveOffice";
      CREATE TRIGGER exec_update_guard BEFORE UPDATE ON public."ExecutiveOffice" FOR EACH ROW
      WHEN (OLD."name" IS DISTINCT FROM NEW."name") EXECUTE FUNCTION public.exec_guard_foundation_update()`],
    ["wrong trigger timing", `DROP TRIGGER exec_update_guard ON public."ExecutiveOffice";
      CREATE TRIGGER exec_update_guard AFTER UPDATE ON public."ExecutiveOffice"
      FOR EACH ROW EXECUTE FUNCTION public.exec_guard_foundation_update()`],
    ["weakened check", `ALTER TABLE public."ExecutiveOffice" DROP CONSTRAINT "ExecOffice_count_ck";
      ALTER TABLE public."ExecutiveOffice" ADD CONSTRAINT "ExecOffice_count_ck" CHECK ("bootstrapVersion">=0)`],
    ["unvalidated check", `ALTER TABLE public."ExecutiveOffice" DROP CONSTRAINT "ExecOffice_count_ck";
      ALTER TABLE public."ExecutiveOffice" ADD CONSTRAINT "ExecOffice_count_ck" CHECK ("bootstrapVersion">=1) NOT VALID`],
    ["wrong FK action", `ALTER TABLE public."ExecutiveOwner" DROP CONSTRAINT "ExecOwnerOffice_fk";
      ALTER TABLE public."ExecutiveOwner" ADD CONSTRAINT "ExecOwnerOffice_fk" FOREIGN KEY ("officeId")
      REFERENCES public."ExecutiveOffice"("id") ON DELETE CASCADE ON UPDATE RESTRICT`],
    ["deferred FK", `ALTER TABLE public."ExecutiveOwner" ALTER CONSTRAINT "ExecOwnerOffice_fk" DEFERRABLE INITIALLY DEFERRED`],
    ["weakened unique index", `DROP INDEX public."ExecOffice_key_uq";
      CREATE INDEX "ExecOffice_key_uq" ON public."ExecutiveOffice"("key")`],
    ["partial index", `DROP INDEX public."ExecEvent_request_idx";
      CREATE INDEX "ExecEvent_request_idx" ON public."ExecutiveActivityEvent"("officeId","requestId") WHERE "outcome"='SUCCESS'`],
    ["changed index order", `DROP INDEX public."ExecEvent_request_idx";
      CREATE INDEX "ExecEvent_request_idx" ON public."ExecutiveActivityEvent"("requestId","officeId")`],
    ["security definer", "ALTER FUNCTION public.exec_guard_foundation_update() SECURITY DEFINER"],
    ["wrong function search path", "ALTER FUNCTION public.exec_guard_foundation_update() SET search_path=public"],
    ["changed function body", `CREATE OR REPLACE FUNCTION public.exec_reject_truncate() RETURNS trigger
      LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS 'BEGIN RETURN NULL; END'`],
    ["RLS substitution", 'ALTER TABLE public."ExecutiveOffice" ENABLE ROW LEVEL SECURITY'],
    ["view substitution", `ALTER TABLE public."ExecutiveOffice" RENAME TO "ExecutiveOriginalOffice";
      CREATE VIEW public."ExecutiveOffice" AS SELECT * FROM public."ExecutiveOriginalOffice"`],
    ["inheritance", 'CREATE TABLE public.synthetic_inherited () INHERITS (public."ExecutiveOffice")'],
    ["new rule", `CREATE RULE synthetic_ignore AS ON INSERT TO public."ExecutiveOffice" DO INSTEAD NOTHING`],
    ["changed column type", 'ALTER TABLE public."ExecutiveOffice" ALTER COLUMN "name" TYPE varchar(200)'],
    ["changed default", 'ALTER TABLE public."ExecutiveOwner" ALTER COLUMN "authVersion" SET DEFAULT 2'],
    ["extra column", 'ALTER TABLE public."ExecutiveOffice" ADD COLUMN "synthetic" text'],
    ["extra Executive table", 'CREATE TABLE public."ExecutiveUnexpected" (id text)'],
    ["unbound sequence", 'ALTER SEQUENCE public."ExecutiveActivityEvent_sequence_seq" OWNED BY NONE'],
    ["cycling sequence", 'ALTER SEQUENCE public."ExecutiveActivityEvent_sequence_seq" CYCLE'],
    ["negative sequence increment", 'ALTER SEQUENCE public."ExecutiveActivityEvent_sequence_seq" INCREMENT BY -1 MINVALUE -9223372036854775808'],
    ["wrong default sequence binding", 'ALTER TABLE public."ExecutiveActivityEvent" ALTER COLUMN "sequence" SET DEFAULT 1'],
  ];
  it.each(catalogMutations)("rejects catalog drift: %s", async (_name, sql) => {
    const env = await preparedDatabase(async (owner) => { await owner.query(sql); });
    const result = await inspect(env);
    expect(result.ready).toBe(false);
    expect(result.diagnostics.some(({ category }) => category === "catalog" || category === "guard")).toBe(true);
  });

  it.each([
    ["SELECT", 'REVOKE SELECT ON public."ExecutiveCharterAcceptance" FROM exec_test_app'],
    ["INSERT", 'REVOKE INSERT ON public."ExecutiveActivityEvent" FROM exec_test_app'],
    ["Office row-lock permission", 'REVOKE UPDATE ("updatedAt") ON public."ExecutiveOffice" FROM exec_test_app'],
    ["sequence USAGE", 'REVOKE USAGE ON SEQUENCE public."ExecutiveActivityEvent_sequence_seq" FROM exec_test_app'],
    ["function EXECUTE", 'REVOKE EXECUTE ON FUNCTION public.exec_foundation_json_valid(text,jsonb) FROM exec_test_app'],
    ["dangerous schema CREATE", 'GRANT CREATE ON SCHEMA public TO exec_test_app'],
    ["dangerous trigger privilege", 'GRANT TRIGGER ON public."ExecutiveOffice" TO exec_test_app'],
  ])("rejects invalid operator grants: %s", async (_name, sql) => {
    const env = await preparedDatabase(async (owner) => { await owner.query(sql); });
    expect((await inspect(env)).diagnostics).toContainEqual({ category: "privilege", reason: "OPERATOR_PRIVILEGES_INVALID" });
  });

  it("rejects missing migration SELECT without leaking database errors", async () => {
    const env = await preparedDatabase(async (owner) => { await owner.query("REVOKE SELECT ON public._prisma_migrations FROM exec_test_app"); });
    expect(await inspect(env)).toEqual({ ready: false, diagnostics: [{ category: "migration", reason: "READINESS_QUERY_FAILED" }] });
  });

  it("does not reject broader ordinary DML or TEMP in the separate guard-test lane", async () => {
    const env = await preparedDatabase(async (owner) => {
      await owner.query("GRANT INSERT,UPDATE,DELETE,TRUNCATE ON ALL TABLES IN SCHEMA public TO exec_test_app");
    });
    expect(await inspect(env)).toEqual({ ready: true, diagnostics: [] });
  });

  it("rejects migrator identity even if its grants and catalog otherwise satisfy minimum access", async () => {
    const owner = await connectTestDatabase("migrator", baseline);
    try {
      await owner.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await owner.query("SET LOCAL search_path=pg_catalog");
      expect((await checkExecutiveReadiness(pgQuery(owner), options(baseline))).diagnostics)
        .toContainEqual({ category: "runtime", reason: "TRANSACTION_IDENTITY_OR_MODE_INVALID" });
    } finally {
      try { await owner.query("ROLLBACK"); } finally { await owner.end(); }
    }
  });

  // Pure snapshots cover states that require a superuser or role-administration
  // privileges to manufacture. No test changes server roles or disables RI guards.
  function snapshotQuery(change: (sql: string, rows: Record<string, unknown>[]) => void): ExecutiveReadinessQuery {
    return async <T extends Record<string, unknown>>(sql: string) => {
      const recording = recordedQueries.find((entry) => entry.sql === sql);
      assert.ok(recording, "Query must have been observed in the successful real readonly check");
      const rows = structuredClone(recording.rows);
      change(sql, rows);
      return rows as T[];
    };
  }

  it.each([
    ["version", "170001"], ["replication", "replica"], ["encoding", "SQL_ASCII"],
    ["recovery", true], ["read_only", "off"], ["isolation", "read committed"],
    ["search_path", "public"], ["session_role", "exec_test_migrator"], ["server_port", 55432],
  ])("rejects unsupported transaction identity snapshot %s", async (key, value) => {
    const query = snapshotQuery((_sql, rows) => { if (rows[0] && "session_role" in rows[0]) rows[0][key] = value; });
    expect((await checkExecutiveReadiness(query, options(baseline))).ready).toBe(false);
  });

  it("rejects a disabled internal FK trigger snapshot without superuser mutation", async () => {
    const query = snapshotQuery((sql, rows) => {
      if (!sql.includes("FROM pg_catalog.pg_trigger t")) return;
      const trigger = rows.find((row) => (row.item as Record<string, unknown>).internal === true);
      assert.ok(trigger);
      (trigger.item as Record<string, unknown>).enabled = "D";
    });
    expect((await checkExecutiveReadiness(query, options(baseline))).diagnostics)
      .toContainEqual({ category: "guard", reason: "CATALOG_TRIGGERS_MISMATCH" });
  });

  it("rejects dangerous inherited/SET ROLE capability snapshots", async () => {
    const query = snapshotQuery((_sql, rows) => { if (rows[0] && "safe_role" in rows[0]) rows[0].safe_role = false; });
    expect((await checkExecutiveReadiness(query, options(baseline))).diagnostics)
      .toContainEqual({ category: "privilege", reason: "OPERATOR_PRIVILEGES_INVALID" });
  });

  it("redacts raw query exceptions and never includes SQL, target values or migration logs", async () => {
    const query: ExecutiveReadinessQuery = async () => { throw new Error("synthetic-secret-database-url and private SQL"); };
    expect(await checkExecutiveReadiness(query, options(baseline))).toEqual({
      ready: false, diagnostics: [{ category: "runtime", reason: "READINESS_QUERY_FAILED" }],
    });
  });
});
