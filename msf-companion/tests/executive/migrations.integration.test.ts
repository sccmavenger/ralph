import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import {
  connectTestDatabase, createIsolatedTestDatabase, EXECUTIVE_TABLES,
  FOUNDATION_MIGRATIONS, grantTestApplicationAccess, loadMigrationSql,
  validateTestEnvironment, type TestEnvironment,
} from "./test-database";

const execute = promisify(execFile);
const appRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationRoot = path.join(appRoot, "prisma/migrations");
const prismaCli = path.join(appRoot, "node_modules/prisma/build/index.js");
const artifactRoot = path.join(appRoot, "test-results/executive-migrations");
const baselineMarker = "// Executive Office foundation:";
let candidateSchema: string;
let historicalNames: string[];
let checkTableNumber = 0;

// Fail closed before creating a tree, invoking Prisma, or opening a connection.
beforeAll(async () => {
  validateTestEnvironment();
  candidateSchema = await readFile(path.join(appRoot, "prisma/schema.prisma"), "utf8");
  historicalNames = (await readdir(migrationRoot))
    .filter((name) => /^\d{14}_/.test(name) && !(FOUNDATION_MIGRATIONS as readonly string[]).includes(name)).sort();
  expect(historicalNames).toHaveLength(24);
  expect(candidateSchema.split(baselineMarker)).toHaveLength(2);
  await mkdir(artifactRoot, { recursive: true });
});

type MigrationTree = { root: string; config: string; env: TestEnvironment };

function childEnvironment(env: TestEnvironment): NodeJS.ProcessEnv {
  validateTestEnvironment(env);
  // Do not forward DATABASE_URL, PG*, NODE_OPTIONS or application secrets.
  const clean: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE"]) {
    if (process.env[key] !== undefined) clean[key] = process.env[key];
  }
  return {
    ...clean, NODE_ENV: "test", PRISMA_HIDE_UPDATE_MESSAGE: "1",
    EXECUTIVE_TEST_DATABASE_URL: env.EXECUTIVE_TEST_DATABASE_URL,
    EXECUTIVE_TEST_MIGRATION_DATABASE_URL: env.EXECUTIVE_TEST_MIGRATION_DATABASE_URL,
    EXECUTIVE_TEST_DATABASE_CONFIRM: env.EXECUTIVE_TEST_DATABASE_CONFIRM,
  };
}

function redact(value: string, env: TestEnvironment) {
  const target = validateTestEnvironment(env);
  let result = value;
  for (const url of [target.appUrl, target.migrationUrl]) {
    result = result.replaceAll(url, "[disposable database URL]");
    result = result.replaceAll(new URL(url).password, "[disposable password]");
    result = result.replaceAll(decodeURIComponent(new URL(url).password), "[disposable password]");
  }
  return result;
}

async function command(tree: MigrationTree, args: string[], succeeds = true) {
  validateTestEnvironment(tree.env);
  let code = 0;
  let stdout = "";
  let stderr = "";
  try {
    ({ stdout, stderr } = await execute(process.execPath, [prismaCli, ...args, "--config", tree.config], {
      cwd: tree.root, env: childEnvironment(tree.env), timeout: 90_000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8",
    }));
  } catch (error) {
    const failure = error as Error & { code?: number | string; stdout?: string; stderr?: string };
    if (typeof failure.code !== "number") throw new Error("Prisma process did not complete normally");
    code = failure.code;
    stdout = failure.stdout ?? "";
    stderr = failure.stderr ?? "";
  }
  const output = redact(`${stdout}\n${stderr}`, tree.env);
  await appendFile(path.join(tree.root, "commands.log"), `${JSON.stringify(args)} => ${code}\n${output}\n`);
  if (succeeds) assert.equal(code, 0, output);
  else assert.notEqual(code, 0, "Expected a bounded migration failure");
  return { code, stdout: redact(stdout, tree.env), output };
}

async function addMigration(tree: MigrationTree, name: string, sql?: string) {
  assert.match(name, /^\d{14}_[a-z0-9_]+$/);
  const folder = path.join(tree.root, "migrations", name);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "migration.sql"), sql ?? await loadMigrationSql(name), "utf8");
}

async function makeTree(suffix: string, names: readonly string[], schema = candidateSchema) {
  const env = await createIsolatedTestDatabase(suffix);
  const root = await mkdtemp(path.join(artifactRoot, `${suffix}-`));
  const tree = { root, env, config: path.join(root, "prisma.config.ts") };
  await mkdir(path.join(root, "migrations"));
  await copyFile(path.join(migrationRoot, "migration_lock.toml"), path.join(root, "migrations/migration_lock.toml"));
  await writeFile(path.join(root, "schema.prisma"), schema, "utf8");
  // This test-owned config has no dotenv, production singleton, or URL fallback.
  // Validation occurs before every child process; credentials stay in the env.
  await writeFile(tree.config, [
    'import { defineConfig } from "prisma/config";',
    'export default defineConfig({ schema: "schema.prisma", migrations: { path: "migrations" },',
    '  datasource: { url: process.env.EXECUTIVE_TEST_MIGRATION_DATABASE_URL! } });', "",
  ].join("\n"));
  for (const name of names) await addMigration(tree, name);
  return tree;
}

async function migrationRecords(client: Client) {
  return (await client.query(`SELECT migration_name, checksum, finished_at IS NOT NULL AS finished,
    rolled_back_at IS NOT NULL AS rolled_back, applied_steps_count,
    logs IS NOT NULL AS has_logs FROM public._prisma_migrations ORDER BY started_at, id`)).rows;
}

async function assertSuccessfulHistory(client: Client, expected: readonly string[]) {
  const records = await migrationRecords(client);
  expect(records.filter((row) => row.finished && !row.rolled_back).map((row) => row.migration_name).sort()).toEqual([...expected].sort());
  expect(records.filter((row) => !row.finished && !row.rolled_back)).toEqual([]);
  return records;
}

async function tableNames(client: Client) {
  return (await client.query<{ name: string }>(`SELECT c.relname AS name FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> '_prisma_migrations' ORDER BY c.relname`)).rows.map((row) => row.name);
}

async function emptyExecutiveTables(client: Client) {
  for (const table of EXECUTIVE_TABLES) {
    expect((await client.query(`SELECT count(*)::int AS count FROM public."${table}"`)).rows[0].count).toBe(0);
  }
}

async function businessSnapshot(client: Client, names: string[]) {
  const snapshot: Record<string, unknown> = {};
  for (const name of names) {
    assert.match(name, /^[A-Za-z][A-Za-z0-9]*$/);
    const relation = `public."${name}"`;
    snapshot[name] = {
      columns: (await client.query(`SELECT a.attname, format_type(a.atttypid,a.atttypmod) AS type,
        a.attnotnull, a.attidentity, a.attgenerated, pg_get_expr(d.adbin,d.adrelid) AS default_value
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [relation])).rows,
      constraints: (await client.query(`SELECT conname, contype, convalidated, condeferrable, condeferred,
        pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname`, [relation])).rows,
      indexes: (await client.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=$1 ORDER BY indexname`, [name])).rows,
      triggers: (await client.query(`SELECT tgname,tgenabled,pg_get_triggerdef(oid) AS definition
        FROM pg_trigger WHERE tgrelid=$1::regclass ORDER BY tgname`, [relation])).rows,
      relation: (await client.query(`SELECT relrowsecurity,relforcerowsecurity,relpersistence,
        pg_get_userbyid(relowner) AS owner,relacl FROM pg_class WHERE oid=$1::regclass`, [relation])).rows,
      rows: (await client.query(`SELECT to_jsonb(t) AS row FROM ${relation} t ORDER BY t."id"`)).rows,
    };
  }
  return snapshot;
}

async function seedBusinessSentinels(client: Client) {
  const now = new Date("2026-09-22T12:00:00.000Z");
  const rows: Record<string, Record<string, unknown>> = {
    Commander: { id: "sentinel_commander", scopelyId: "synthetic-m12", displayName: "Synthetic sentinel", updatedAt: now },
    RosterSnapshot: { commanderId: "sentinel_commander", snapshotData: '{"synthetic":true,"kind":"roster"}' },
    InventorySnapshot: { commanderId: "sentinel_commander", snapshotData: '{"synthetic":true,"kind":"inventory"}' },
    AdvisorConversation: { id: "sentinel_conversation", commanderId: "sentinel_commander", title: "Synthetic", updatedAt: now },
    AdvisorMessage: { conversationId: "sentinel_conversation", role: "user", content: "Synthetic", tokenCount: 4 },
    AdvisorQuestionLog: { commanderId: "sentinel_commander", question: "Synthetic?", category: "test", confidenceScore: 1, answeredSuccessfully: false },
    KnowledgeGap: { clusteredQuestion: "Synthetic?", category: "test", gapType: "synthetic", updatedAt: now },
    AiActionItem: { sourceType: "synthetic", sourceId: "sentinel", title: "Synthetic", updatedAt: now },
    CommanderNotification: { commanderId: "sentinel_commander", type: "synthetic", title: "Synthetic", message: "Not delivered" },
    DailyTip: { commanderId: "sentinel_commander", content: "Synthetic, not delivered" },
    PushSubscription: { commanderId: "sentinel_commander", endpoint: "https://example.invalid/synthetic", p256dh: "synthetic", auth: "synthetic" },
    DailyTokenUsage: { commanderId: "sentinel_commander", date: now, tokensUsed: 7 },
    FeatureFlag: { key: "synthetic-test", enabled: false },
    ApiCache: { endpoint: "synthetic", hashValue: "synthetic", responseData: '{"synthetic":true}' },
    UsageEvent: { commanderId: "sentinel_commander", eventType: "synthetic", eventName: "synthetic", tier: "FREE" },
    ChurnIntervention: { commanderId: "sentinel_commander", type: "synthetic", channel: "none", delivered: false },
    EmailDelivery: { commanderId: "sentinel_commander", recipientHash: "synthetic", messageType: "synthetic", subject: "Not sent", idempotencyKey: "synthetic", updatedAt: now },
    CancellationFeedbackCase: { id: "sentinel_case", commanderId: "sentinel_commander", cancellationKey: "synthetic", stripeSubscriptionId: "synthetic", cancellationRequestedAt: now, scheduledAt: now, updatedAt: now },
    CancellationFeedbackResponse: { caseId: "sentinel_case", source: "synthetic", body: "Synthetic" },
    StripeWebhookEvent: { type: "synthetic", updatedAt: now },
    GameCharacter: { characterId: "synthetic", name: "Synthetic" },
    CommanderWallet: { commanderId: "sentinel_commander", gold: 17, cores: 3, updatedAt: now },
  };
  for (const [table, values] of Object.entries(rows)) {
    const row = { id: `sentinel_${table}`, ...values };
    const columns = Object.keys(row);
    await client.query(`INSERT INTO public."${table}" (${columns.map((column) => `"${column}"`).join(",")})
      VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
  }
  expect(Object.keys(rows)).toHaveLength(22);
  return Object.keys(rows).sort();
}

const indexContract: Record<string, [string, string[], boolean][]> = {
  ExecutiveOffice: [["ExecOffice_key_uq", ["key"], true]],
  ExecutiveOwner: [["ExecOwner_office_uq", ["officeId"], true], ["ExecOwner_handle_uq", ["webauthnUserId"], true], ["ExecOwner_scope_id_uq", ["officeId", "id"], true]],
  ExecutiveOwnerCredential: [["ExecCredential_external_uq", ["credentialId"], true], ["ExecCredential_owner_id_uq", ["ownerId", "id"], true], ["ExecCredential_owner_revoked_idx", ["ownerId", "revokedAt"], false]],
  ExecutiveOwnerEnrollment: [["ExecEnrollment_token_uq", ["tokenHash"], true], ["ExecEnrollment_owner_id_uq", ["ownerId", "id"], true], ["ExecEnrollment_owner_purpose_idx", ["ownerId", "purpose", "createdAt"], false], ["ExecEnrollment_expiry_idx", ["expiresAt"], false]],
  ExecutiveOwnerChallenge: [["ExecChallenge_value_uq", ["challenge"], true], ["ExecChallenge_owner_expiry_idx", ["ownerId", "expiresAt"], false], ["ExecChallenge_enrollment_idx", ["ownerId", "enrollmentId"], false], ["ExecChallenge_session_idx", ["ownerId", "sessionId"], false], ["ExecChallenge_expiry_idx", ["expiresAt"], false]],
  ExecutiveOwnerSession: [["ExecSession_token_uq", ["tokenHash"], true], ["ExecSession_owner_id_uq", ["ownerId", "id"], true], ["ExecSession_credential_idx", ["ownerId", "credentialId"], false], ["ExecSession_owner_revoked_idx", ["ownerId", "revokedAt"], false], ["ExecSession_absolute_idx", ["absoluteExpiresAt"], false], ["ExecSession_idle_idx", ["idleExpiresAt"], false]],
  ExecutiveAuthRateLimit: [["ExecRateLimit_bucket_uq", ["bucketKeyHash"], true], ["ExecRateLimit_expiry_idx", ["expiresAt"], false]],
  ExecutiveAgent: [["ExecAgent_office_role_uq", ["officeId", "roleKey"], true], ["ExecAgent_owner_idx", ["officeId", "reportsToOwnerId"], false], ["ExecAgent_acceptance_idx", ["officeId", "governingCharterAcceptanceId"], false]],
  ExecutiveCharter: [["ExecCharter_version_uq", ["officeId", "version"], true], ["ExecCharter_scope_hash_uq", ["officeId", "id", "contentHash"], true], ["ExecCharter_importer_idx", ["officeId", "importedByOwnerId"], false]],
  ExecutiveCharterAcceptance: [["ExecAcceptance_request_uq", ["requestKey"], true], ["ExecAcceptance_scope_id_uq", ["officeId", "id"], true], ["ExecAcceptance_time_idx", ["officeId", "acceptedAt", "id"], false], ["ExecAcceptance_charter_idx", ["officeId", "charterId", "contentHash"], false], ["ExecAcceptance_owner_idx", ["officeId", "ownerId"], false], ["ExecAcceptance_credential_idx", ["ownerId", "ownerCredentialId"], false]],
  ExecutiveActivityEvent: [["ExecEvent_sequence_uq", ["sequence"], true], ["ExecEvent_feed_idx", ["officeId", "sequence"], false], ["ExecEvent_type_idx", ["officeId", "eventType", "sequence"], false], ["ExecEvent_actor_idx", ["officeId", "actorOwnerId", "sequence"], false], ["ExecEvent_request_idx", ["officeId", "requestId"], false]],
};

const checkContract: Record<string, [string, string[]]> = {
  ExecutiveOffice: ["Office", ["shape", "state", "count", "hash", "time"]],
  ExecutiveOwner: ["Owner", ["shape", "state", "count", "time"]],
  ExecutiveOwnerCredential: ["Credential", ["shape", "state", "count", "time"]],
  ExecutiveOwnerEnrollment: ["Enrollment", ["shape", "state", "hash", "time"]],
  ExecutiveOwnerChallenge: ["Challenge", ["shape", "state", "count", "hash", "time"]],
  ExecutiveOwnerSession: ["Session", ["shape", "count", "hash", "time"]],
  ExecutiveAuthRateLimit: ["RateLimit", ["shape", "count", "hash", "time"]],
  ExecutiveAgent: ["Agent", ["shape", "state", "count", "time"]],
  ExecutiveCharter: ["Charter", ["shape", "count", "hash"]],
  ExecutiveCharterAcceptance: ["Acceptance", ["shape", "hash", "time"]],
  ExecutiveActivityEvent: ["Event", ["shape", "state", "count"]],
};

async function assertExecutiveCatalog(client: Client, root: string) {
  const allNames = await tableNames(client);
  expect(allNames.filter((name) => name.startsWith("Executive")).sort()).toEqual([...EXECUTIVE_TABLES].sort());
  expect(allNames).not.toContain("TowerResult");
  const indexes = (await client.query(`SELECT t.relname AS table_name, i.relname AS name,
    x.indisunique AS unique, x.indisprimary AS primary, x.indisvalid AS valid,
    am.amname AS method, x.indpred IS NULL AS unfiltered, x.indexprs IS NULL AS unexpressed,
    ARRAY(SELECT a.attname FROM unnest(x.indkey) WITH ORDINALITY k(num,pos)
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.num ORDER BY k.pos) AS columns
    FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_am am ON am.oid=i.relam
    WHERE n.nspname='public' AND t.relname LIKE 'Executive%' ORDER BY t.relname,i.relname`)).rows;
  const expectedIndexes = Object.entries(indexContract).flatMap(([table, entries]) => [
    ...entries.map(([name, columns, unique]) => ({ table_name: table, name, columns, unique, primary: false })),
    { table_name: table, name: `${table}_pkey`, columns: ["id"], unique: true, primary: true },
  ]).map((entry) => ({ ...entry, valid: true, method: "btree", unfiltered: true, unexpressed: true }));
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  expect(indexes.sort(byName)).toEqual(expectedIndexes.sort(byName));

  const checks = (await client.query(`SELECT r.relname AS table_name,c.conname AS name,c.convalidated AS valid,
    pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname LIKE 'Executive%'
    AND c.contype='c' ORDER BY c.conname`)).rows;
  expect(checks.map(({ table_name, name, valid }) => ({ table_name, name, valid })).sort(byName)).toEqual(
    Object.entries(checkContract).flatMap(([table_name, [alias, rules]]) => rules.map((rule) => ({ table_name, name: `Exec${alias}_${rule}_ck`, valid: true }))).sort(byName),
  );
  // Ask PostgreSQL to normalize the reviewed CHECK SQL on session-only scratch
  // tables, then compare exact expressions, not just constraint names/counts.
  // No public table or guard is altered; scratch tables vanish with the client.
  const foundationSql = await loadMigrationSql(FOUNDATION_MIGRATIONS[0]);
  for (const table of EXECUTIVE_TABLES) {
    const statement = foundationSql.match(new RegExp(`ALTER TABLE public\\."${table}"\\s+[\\s\\S]*?;`))?.[0];
    assert.ok(statement, `Missing CHECK SQL for ${table}`);
    assert.ok(statement.includes("ADD CONSTRAINT"));
    const temporary = `m12_check_${++checkTableNumber}`;
    await client.query(`CREATE TEMP TABLE "${temporary}" (LIKE public."${table}")`);
    await client.query(statement.replace(`public."${table}"`, `pg_temp."${temporary}"`));
    const expected = (await client.query(`SELECT conname AS name,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid=$1::regclass AND contype='c' ORDER BY conname`, [`pg_temp."${temporary}"`])).rows;
    expect(checks.filter((row) => row.table_name === table).map(({ name, definition }) => ({ name, definition })))
      .toEqual(expected);
  }

  const functions = (await client.query(`SELECT p.proname AS name,p.prosrc AS body,p.prosecdef AS security_definer,
    p.provolatile AS volatility,p.proparallel AS parallel,p.proconfig AS config,l.lanname AS language
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.proname LIKE 'exec_%' ORDER BY p.proname`)).rows;
  const migrationSql = (await Promise.all(FOUNDATION_MIGRATIONS.map(loadMigrationSql))).join("\n");
  const definitions = [...migrationSql.matchAll(/CREATE FUNCTION public\.(exec_[a-z_]+)\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/g)];
  expect(definitions).toHaveLength(8);
  expect(functions.map((fn) => fn.name)).toEqual(definitions.map((match) => match[1]).sort());
  for (const fn of functions) {
    const match = definitions.find((definition) => definition[1] === fn.name)!;
    expect(fn.body.trim().replace(/\r\n/g, "\n")).toBe(match[2].trim().replace(/\r\n/g, "\n"));
    expect(fn.security_definer).toBe(false);
    expect(fn.config).toEqual(["search_path=pg_catalog"]);
    expect(fn.volatility).toBe(fn.name === "exec_foundation_json_valid" ? "i" : "v");
    expect(fn.parallel).toBe(fn.name === "exec_foundation_json_valid" ? "s" : "u");
    expect(fn.language).toBe(fn.name === "exec_foundation_json_valid" ? "sql" : "plpgsql");
  }

  type TriggerExpectation = { table_name: string; name: string; function_name: string; type: number; enabled: string; deferrable: boolean; deferred: boolean };
  const expectedTriggers: TriggerExpectation[] = [];
  const add = (tables: string[], name: string, function_name: string, type: number, deferred = false) => {
    for (const table_name of tables) expectedTriggers.push({ table_name, name, function_name, type, enabled: "O", deferrable: deferred, deferred });
  };
  const history = ["ExecutiveCharter", "ExecutiveCharterAcceptance", "ExecutiveActivityEvent"];
  const identity = ["ExecutiveOffice", "ExecutiveOwner", "ExecutiveAgent", "ExecutiveOwnerCredential"];
  add(history, "exec_history_write_guard", "exec_reject_history_mutation", 26);
  add([...history, ...identity], "exec_truncate_guard", "exec_reject_truncate", 34);
  add(identity, "exec_identity_delete_guard", "exec_reject_identity_delete", 10);
  add([...identity, "ExecutiveOwnerEnrollment", "ExecutiveOwnerChallenge", "ExecutiveOwnerSession", "ExecutiveAuthRateLimit"], "exec_update_guard", "exec_guard_foundation_update", 19);
  add(["ExecutiveOwnerChallenge"], "exec_challenge_grant_guard", "exec_check_challenge_grant", 23);
  add(["ExecutiveAgent"], "exec_agent_office_lock", "exec_lock_agent_office", 23);
  add(["ExecutiveOffice", "ExecutiveAgent"], "exec_charter_pair_guard", "exec_check_charter_pointer_pair", 21, true);
  const triggers = (await client.query(`SELECT c.relname AS table_name,t.tgname AS name,p.proname AS function_name,
    t.tgtype::int AS type,t.tgenabled AS enabled,t.tgdeferrable AS deferrable,t.tginitdeferred AS deferred
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND c.relname LIKE 'Executive%' AND NOT t.tgisinternal`)).rows;
  const triggerOrder = (a: TriggerExpectation, b: TriggerExpectation) => `${a.table_name}:${a.name}`.localeCompare(`${b.table_name}:${b.name}`);
  expect(triggers.sort(triggerOrder)).toEqual(expectedTriggers.sort(triggerOrder));
  expect(triggers).toHaveLength(26);
  const foreignKeys = (await client.query(`SELECT c.conname AS name,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname LIKE 'Executive%' AND c.contype='f' ORDER BY c.conname`)).rows;
  expect(foreignKeys).toHaveLength(20); // Exact columns/actions are independently asserted by DB-03.
  const dateColumns = (await client.query(`SELECT table_name,column_name,datetime_precision FROM information_schema.columns
    WHERE table_schema='public' AND table_name LIKE 'Executive%' AND data_type LIKE 'timestamp%'`)).rows;
  expect(dateColumns.length).toBeGreaterThan(20);
  expect((await client.query(`SELECT count(*)::int AS count FROM information_schema.columns
    WHERE table_schema='public' AND table_name LIKE 'Executive%' AND data_type='timestamp without time zone'`)).rows[0].count).toBe(0);
  for (const column of dateColumns) expect(column.datetime_precision).toBe(3);
  await writeFile(path.join(root, "executive-catalog.json"), JSON.stringify({ indexes, checks, functions, triggers, foreignKeys, dateColumns }, null, 2));
}

async function oldClientProbe(tree: MigrationTree, tables: string[]) {
  validateTestEnvironment(tree.env);
  const clientUrl = pathToFileURL(path.join(tree.root, "old-client/client.ts")).href;
  const source = `
    import assert from 'node:assert/strict';
    import { PrismaPg } from '@prisma/adapter-pg';
    import { PrismaClient } from ${JSON.stringify(clientUrl)};
    const url = new URL(process.env.EXECUTIVE_TEST_DATABASE_URL);
    const prisma = new PrismaClient({adapter:new PrismaPg({host:'127.0.0.1',port:55432,
      database:process.env.EXECUTIVE_TEST_DATABASE_CONFIRM,user:'exec_test_app',password:decodeURIComponent(url.password),ssl:false})});
    try {
      for (const table of ${JSON.stringify(tables)}) {
        const delegate=table[0].toLowerCase()+table.slice(1);
        assert.equal((await prisma[delegate].findMany()).length,1,table);
      }
      const rollback=new Error('synthetic rollback');
      try { await prisma.$transaction(async tx=>{
        await tx.commander.update({where:{id:'sentinel_commander'},data:{displayName:'Temporary synthetic update'}});
        throw rollback;
      }); } catch (error) { if (error!==rollback) throw error; }
      assert.equal((await prisma.commander.findUniqueOrThrow({where:{id:'sentinel_commander'}})).displayName,'Synthetic sentinel');
      console.log(JSON.stringify({tablesRead:${tables.length},rowsRead:${tables.length},rollbackWritePassed:true,towerNotClaimed:true}));
    } finally { await prisma.$disconnect(); }
  `;
  const result = await execute(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", source], {
    cwd: tree.root, env: childEnvironment(tree.env), encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  });
  await appendFile(path.join(tree.root, "old-client.log"), redact(`${result.stdout}\n${result.stderr}`, tree.env));
  expect(JSON.parse(result.stdout.trim())).toEqual({ tablesRead: 22, rowsRead: 22, rollbackWritePassed: true, towerNotClaimed: true });
}

describe("DB-15 real Prisma migration replay, existing-data preservation, drift, and failure recovery", () => {
  it("fresh replay applies 24 historical + 2 Executive migrations with exact catalogs and no Executive rows", async () => {
    const names = [...historicalNames, ...FOUNDATION_MIGRATIONS];
    const tree = await makeTree("migration_fresh", names);
    await command(tree, ["migrate", "deploy"]);
    await command(tree, ["migrate", "status"]);
    const client = await connectTestDatabase("migrator", tree.env);
    try {
      expect(await tableNames(client)).toHaveLength(33);
      await assertSuccessfulHistory(client, names);
      await emptyExecutiveTables(client);
      await assertExecutiveCatalog(client, tree.root);
    } finally { await client.end(); }
  }, 180_000);

  it("upgrade preserves all 22 business catalogs and sentinel rows; repeat is inert and baseline client remains compatible", async () => {
    const baseline = candidateSchema.split(baselineMarker)[0];
    expect([...baseline.matchAll(/^model /gm)]).toHaveLength(23);
    const generationSchema = baseline.replace(/output\s*=\s*"[^"]+"/, 'output = "./old-client"\n  importFileExtension = "ts"');
    const tree = await makeTree("migration_upgrade", historicalNames, generationSchema);
    await command(tree, ["migrate", "deploy"]);
    await command(tree, ["generate"]);
    const client = await connectTestDatabase("migrator", tree.env);
    try {
      const tables = await seedBusinessSentinels(client);
      expect(await tableNames(client)).toEqual(tables);
      await grantTestApplicationAccess(client);
      await oldClientProbe(tree, tables);
      const before = await businessSnapshot(client, tables);
      await writeFile(path.join(tree.root, "before-business.json"), JSON.stringify(before, null, 2));
      const beforeDrift = await command(tree, ["migrate", "diff", "--from-config-datasource", "--to-schema", "schema.prisma", "--script"]);
      expect(beforeDrift.stdout).toContain('"TowerResult"');
      await writeFile(path.join(tree.root, "baseline-drift.sql"), beforeDrift.stdout);

      for (const name of FOUNDATION_MIGRATIONS) await addMigration(tree, name);
      await writeFile(path.join(tree.root, "schema.prisma"), candidateSchema);
      await command(tree, ["migrate", "deploy"]);
      await assertSuccessfulHistory(client, [...historicalNames, ...FOUNDATION_MIGRATIONS]);
      expect(await businessSnapshot(client, tables)).toEqual(before);
      await emptyExecutiveTables(client);
      await assertExecutiveCatalog(client, tree.root);
      await oldClientProbe(tree, tables); // Exactly the already-generated baseline client.
      expect(await businessSnapshot(client, tables)).toEqual(before);
      const afterDrift = await command(tree, ["migrate", "diff", "--from-config-datasource", "--to-schema", "schema.prisma", "--script"]);
      expect(afterDrift.stdout).toBe(beforeDrift.stdout);
      await writeFile(path.join(tree.root, "candidate-drift.sql"), afterDrift.stdout);

      const records = await migrationRecords(client);
      const catalogs = await readFile(path.join(tree.root, "executive-catalog.json"), "utf8");
      expect((await command(tree, ["migrate", "deploy"])).output).toMatch(/No pending migrations/);
      await command(tree, ["migrate", "status"]);
      expect(await migrationRecords(client)).toEqual(records);
      expect(await businessSnapshot(client, tables)).toEqual(before);
      await emptyExecutiveTables(client);
      await assertExecutiveCatalog(client, tree.root);
      expect(await readFile(path.join(tree.root, "executive-catalog.json"), "utf8")).toBe(catalogs);
      await writeFile(path.join(tree.root, "after-business.json"), JSON.stringify(await businessSnapshot(client, tables), null, 2));
    } finally { await client.end(); }
  }, 240_000);

  it.each([0, 1])("migration %i failure rolls back DDL and recovers only after catalog/metadata proof", async (index) => {
    const candidate = FOUNDATION_MIGRATIONS[index];
    const preceding = [...historicalNames, ...FOUNDATION_MIGRATIONS.slice(0, index)];
    const tree = await makeTree(`migration_failure_${index}`, preceding);
    await command(tree, ["migrate", "deploy"]);
    const client = await connectTestDatabase("migrator", tree.env);
    try {
      const tables = await tableNames(client);
      const before = await businessSnapshot(client, tables);
      const functionsBefore = (await client.query(`SELECT proname,prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' ORDER BY proname`)).rows;
      const correctSql = await loadMigrationSql(candidate);
      expect(correctSql).toMatch(/COMMIT;\s*$/);
      // Throw after all DDL but before COMMIT in a disposable copy only.
      const failingSql = correctSql.replace(/COMMIT;\s*$/, "DO $$ BEGIN RAISE EXCEPTION 'M12 synthetic migration failure'; END $$;\nCOMMIT;\n");
      await addMigration(tree, candidate, failingSql);
      expect((await command(tree, ["migrate", "deploy"], false)).output).toContain("P3018");
      expect(await tableNames(client)).toEqual(tables);
      expect(await businessSnapshot(client, tables)).toEqual(before);
      expect((await client.query(`SELECT proname,prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' ORDER BY proname`)).rows).toEqual(functionsBefore);
      if (index === 0) expect(tables.some((name) => name.startsWith("Executive"))).toBe(false);
      else {
        await emptyExecutiveTables(client);
        expect((await client.query(`SELECT count(*)::int AS count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
          WHERE c.relname LIKE 'Executive%' AND NOT t.tgisinternal`)).rows[0].count).toBe(0);
      }
      const failure = (await migrationRecords(client)).filter((record) => record.migration_name === candidate);
      expect(failure).toHaveLength(1);
      expect(failure[0]).toMatchObject({ finished: false, rolled_back: false, has_logs: true, applied_steps_count: 0 });
      expect((await command(tree, ["migrate", "deploy"], false)).output).toContain("P3009");
      await writeFile(path.join(tree.root, "verified-failure-state.json"), JSON.stringify({ candidate, failure, tables, functions: functionsBefore.map((fn) => fn.proname), foundationReady: false }, null, 2));

      // State-based recovery is explicitly limited to this proven rolled-back
      // test DB. Never mark an unapplied migration applied or alter shared history.
      await command(tree, ["migrate", "resolve", "--rolled-back", candidate]);
      const resolved = (await migrationRecords(client)).find((record) => record.migration_name === candidate);
      expect(resolved).toMatchObject({ finished: false, rolled_back: true });
      await addMigration(tree, candidate, correctSql);
      for (const name of FOUNDATION_MIGRATIONS.slice(index + 1)) await addMigration(tree, name);
      await command(tree, ["migrate", "deploy"]);
      await command(tree, ["migrate", "status"]);
      await assertSuccessfulHistory(client, [...historicalNames, ...FOUNDATION_MIGRATIONS]);
      expect(await businessSnapshot(client, tables)).toEqual(index === 0 ? before : expect.objectContaining(
        Object.fromEntries(Object.entries(before).filter(([name]) => !name.startsWith("Executive"))),
      ));
      await emptyExecutiveTables(client);
      await assertExecutiveCatalog(client, tree.root);
      const recovered = (await migrationRecords(client)).filter((record) => record.migration_name === candidate);
      expect(recovered).toHaveLength(2);
      expect(recovered.filter((record) => record.finished && !record.rolled_back)).toHaveLength(1);
      await writeFile(path.join(tree.root, "recovered-metadata.json"), JSON.stringify(recovered, null, 2));
    } finally { await client.end(); }
  }, 180_000);
});
