import { beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  connectTestDatabase, createIsolatedTestDatabase, createTestPrisma, EXECUTIVE_TABLES, expectInsertFailure,
  expectSqlFailure, foundationFixture, insertFoundation, insertRow, sha256,
  FOUNDATION_MIGRATIONS, grantTestApplicationAccess, loadMigrationSql,
  validateTestEnvironment, withTestTransaction, type ExecutiveTable, type FixtureRow,
} from "./test-database";

// No skip-on-missing-env: the integration lane must fail closed, including on CI.
beforeAll(() => { validateTestEnvironment(); });

async function parentsFor(client: Client, table: ExecutiveTable) {
  const fixture = foundationFixture();
  for (const candidate of EXECUTIVE_TABLES) {
    if (candidate === table) break;
    await insertRow(client, candidate, fixture.rows[candidate]);
  }
  return fixture;
}

const epoch = Date.parse("2026-09-22T12:00:00.000Z");
const at = (seconds: number) => new Date(epoch + seconds * 1_000);
type InvalidCase = [ExecutiveTable, string, unknown, string?];

describe("DB-01/02/06 inert foundation, typed client, uniqueness and row checks", () => {
  it("all eleven tables start empty, and a synthetic foundation remains inert", async () => {
    await withTestTransaction(async (client) => {
      for (const table of EXECUTIVE_TABLES) {
        expect((await client.query(`SELECT count(*)::int AS count FROM public."${table}"`)).rows[0].count).toBe(0);
      }
      await insertFoundation(client);
      expect((await client.query('SELECT "phase", "executionMode", "activeCharterAcceptanceId" FROM public."ExecutiveOffice"')).rows).toEqual([
        { phase: "FOUNDATION", executionMode: "DISABLED", activeCharterAcceptanceId: null },
      ]);
      expect((await client.query('SELECT "status", "roleKey", "governingCharterAcceptanceId" FROM public."ExecutiveAgent"')).rows).toEqual([
        { status: "ONBOARDING", roleKey: "CEO", governingCharterAcceptanceId: null },
      ]);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    });
  });

  it("generated Prisma client reads the models and round-trips dates/bytes/BigInt/JSON inside rollback", async () => {
    const prisma = await createTestPrisma();
    try {
      const counts = await Promise.all([
        prisma.executiveOffice.count(), prisma.executiveOwner.count(),
        prisma.executiveOwnerCredential.count(), prisma.executiveOwnerEnrollment.count(),
        prisma.executiveOwnerChallenge.count(), prisma.executiveOwnerSession.count(),
        prisma.executiveAuthRateLimit.count(), prisma.executiveAgent.count(),
        prisma.executiveCharter.count(), prisma.executiveCharterAcceptance.count(),
        prisma.executiveActivityEvent.count(),
      ]);
      expect(counts).toEqual(Array(11).fill(0));
      const rollback = new Error("synthetic Prisma rollback");
      await expect(prisma.$transaction(async (tx) => {
        // Prisma 7.6's single-row create omits the cuid when this ID also owns
        // the optional composite acceptance FK. Bulk-return creation preserves
        // generated IDs without changing the approved schema or DB constraints.
        const [office] = await tx.executiveOffice.createManyAndReturn({ data: {
          key: "msf-toolkit", name: "Synthetic Prisma Office", bootstrapVersion: 1,
          bootstrapHash: sha256("prisma fixture"),
        } });
        const owner = await tx.executiveOwner.create({ data: {
          officeId: office.id, displayName: "Synthetic Prisma Owner", webauthnUserId: "p".repeat(43),
        } });
        const credential = await tx.executiveOwnerCredential.create({ data: {
          ownerId: owner.id, credentialId: "cHJpc21h", publicKey: new Uint8Array([1, 2, 3]),
          counter: BigInt(0), rpId: "localhost", label: "Synthetic", transports: ["internal"],
          deviceType: "singleDevice", backedUp: false,
        } });
        expect(office.phase).toBe("FOUNDATION");
        expect(office.executionMode).toBe("DISABLED");
        expect(office.activeCharterAcceptanceId).toBeNull();
        expect(owner.status).toBe("PENDING_ENROLLMENT");
        expect(owner.authVersion).toBe(1);
        expect(credential.counter).toBe(BigInt(0));
        expect(Array.from(credential.publicKey)).toEqual([1, 2, 3]);
        expect(credential.transports).toEqual(["internal"]);
        expect(credential.createdAt).toBeInstanceOf(Date);
        throw rollback;
      })).rejects.toBe(rollback);
      expect(await prisma.executiveOffice.count()).toBe(0);
    } finally { await prisma.$disconnect(); }
  });

  it.each<ExecutiveTable>(["ExecutiveOffice", "ExecutiveOwner", "ExecutiveAgent"])("rejects a second singleton %s", async (table) => {
    await withTestTransaction(async (client) => {
      const fixture = await insertFoundation(client);
      await expectInsertFailure(client, table, { ...fixture.rows[table], id: "second_singleton" }, "23505");
    });
  });

  const uniqueCases: [ExecutiveTable, FixtureRow][] = [
    ["ExecutiveOwnerCredential", {}], ["ExecutiveOwnerEnrollment", {}],
    ["ExecutiveOwnerChallenge", {}], ["ExecutiveOwnerSession", {}],
    ["ExecutiveAuthRateLimit", {}], ["ExecutiveCharter", {}],
    ["ExecutiveCharterAcceptance", {}],
  ];
  it.each(uniqueCases)("rejects duplicate external/version/request key on %s", async (table, patch) => {
    await withTestTransaction(async (client) => {
      const fixture = await insertFoundation(client);
      await expectInsertFailure(client, table, { ...fixture.rows[table], ...patch, id: "duplicate_unique" }, "23505");
    });
  });

  it("rejects duplicate sequence independently of event ID while allowing repeated request IDs", async () => {
    await withTestTransaction(async (client) => {
      const fixture = await insertFoundation(client);
      const sequence = (await client.query('SELECT sequence FROM public."ExecutiveActivityEvent"')).rows[0].sequence;
      await expectInsertFailure(client, "ExecutiveActivityEvent", { ...fixture.rows.ExecutiveActivityEvent, id: "event_duplicate_sequence", sequence }, "23505");
      await insertRow(client, "ExecutiveActivityEvent", { ...fixture.rows.ExecutiveActivityEvent, id: "event_repeated_correlation" });
    });
  });

  it.each(EXECUTIVE_TABLES)("rejects a repeated primary key on %s", async (table) => {
    await withTestTransaction(async (client) => {
      const fixture = await insertFoundation(client);
      await expectInsertFailure(client, table, fixture.rows[table], "23505");
    });
  });

  const invalid: InvalidCase[] = [
    ["ExecutiveOffice", "key", "other"], ["ExecutiveOffice", "phase", "RUNNING"],
    ["ExecutiveOffice", "executionMode", "ENABLED"], ["ExecutiveOffice", "bootstrapVersion", 0],
    ["ExecutiveOffice", "activeCharterAcceptanceId", " "],
    ["ExecutiveOwner", "status", "ADMIN"], ["ExecutiveOwner", "authVersion", 0],
    ["ExecutiveOwner", "webauthnUserId", "a".repeat(42)],
    ["ExecutiveOwner", "webauthnUserId", "a".repeat(44)],
    ["ExecutiveOwner", "webauthnUserId", `${"a".repeat(42)}=`],
    ["ExecutiveOwner", "contactEmail", " "], ["ExecutiveOwner", "contactEmail", "a".repeat(321)],
    ["ExecutiveOwnerCredential", "counter", BigInt(-1)], ["ExecutiveOwnerCredential", "publicKey", Buffer.alloc(0)],
    ["ExecutiveOwnerCredential", "deviceType", "unknown"],
    ["ExecutiveOwnerCredential", "transports", {}], ["ExecutiveOwnerCredential", "transports", ["internal", 1]],
    ["ExecutiveOwnerCredential", "lastUsedAt", at(-1)], ["ExecutiveOwnerCredential", "revokedAt", at(-1)],
    ["ExecutiveOwnerEnrollment", "purpose", "OTHER"], ["ExecutiveOwnerEnrollment", "expiresAt", at(0)],
    ["ExecutiveOwnerEnrollment", "consumedAt", at(-1)], ["ExecutiveOwnerEnrollment", "consumedAt", at(600)],
    ["ExecutiveOwnerEnrollment", "revokedAt", at(-1)], ["ExecutiveOwnerEnrollment", "operatorReason", "a".repeat(1001)],
    ["ExecutiveOwnerChallenge", "purpose", "OTHER"], ["ExecutiveOwnerChallenge", "authVersion", 0],
    ["ExecutiveOwnerChallenge", "challenge", "not/base64+url="],
    ["ExecutiveOwnerCredential", "credentialId", "not/base64+url="],
    ["ExecutiveOwnerChallenge", "expiresAt", at(0)], ["ExecutiveOwnerChallenge", "consumedAt", at(-1)],
    ["ExecutiveOwnerChallenge", "consumedAt", at(600)],
    ["ExecutiveOwnerSession", "authVersion", 0], ["ExecutiveOwnerSession", "absoluteExpiresAt", at(0)],
    ["ExecutiveOwnerSession", "lastSeenAt", at(-1)], ["ExecutiveOwnerSession", "lastSeenAt", at(600)],
    ["ExecutiveOwnerSession", "idleExpiresAt", at(3601)], ["ExecutiveOwnerSession", "verifiedAt", at(1)],
    ["ExecutiveOwnerSession", "revokedAt", at(-1)],
    ["ExecutiveAuthRateLimit", "attemptCount", -1], ["ExecutiveAuthRateLimit", "windowStartedAt", at(-1)],
    ["ExecutiveAuthRateLimit", "windowStartedAt", at(600)], ["ExecutiveAuthRateLimit", "blockedUntil", at(-1)],
    ["ExecutiveAuthRateLimit", "blockedUntil", at(601)],
    ["ExecutiveAgent", "roleKey", "CTO"], ["ExecutiveAgent", "status", "ACTIVE"],
    ["ExecutiveAgent", "roleDefinitionVersion", 0], ["ExecutiveAgent", "roleDefinition", []],
    ["ExecutiveAgent", "governingCharterAcceptanceId", " "],
    ["ExecutiveAgent", "roleDefinition", {}],
    ["ExecutiveCharter", "version", 0], ["ExecutiveCharter", "contentMarkdown", ""],
    ["ExecutiveCharter", "importedByOwnerId", " "],
    ["ExecutiveCharter", "contentHash", "a".repeat(64)],
    ["ExecutiveCharter", "sourceFileName", "../charter.md"], ["ExecutiveCharter", "sourceFileName", "C:\\charter.md"],
    ["ExecutiveCharter", "sourceFileName", "."], ["ExecutiveCharter", "sourceFileName", ".."],
    ["ExecutiveCharterAcceptance", "verifiedAt", at(61)], ["ExecutiveCharterAcceptance", "verifiedAt", at(-241)],
    ["ExecutiveCharterAcceptance", "acceptedAt", at(61)],
    ["ExecutiveActivityEvent", "sequence", BigInt(0)], ["ExecutiveActivityEvent", "actorType", "AGENT"],
    ["ExecutiveActivityEvent", "outcome", "MAYBE"], ["ExecutiveActivityEvent", "actorType", "OWNER"],
    ["ExecutiveActivityEvent", "actorOwnerId", "fixture_owner"],
    ["ExecutiveActivityEvent", "metadata", []], ["ExecutiveActivityEvent", "metadata", "string"],
    ["ExecutiveActivityEvent", "eventType", "a".repeat(101)], ["ExecutiveActivityEvent", "subjectType", "a".repeat(101)],
    ["ExecutiveActivityEvent", "requestId", "a".repeat(201)],
    ["ExecutiveActivityEvent", "subjectId", " "],
  ];
  const strings: Partial<Record<ExecutiveTable, string[]>> = {
    ExecutiveOffice: ["name"], ExecutiveOwner: ["displayName", "officeId"],
    ExecutiveOwnerCredential: ["ownerId", "credentialId", "rpId", "label"],
    ExecutiveOwnerEnrollment: ["ownerId", "operatorReason"], ExecutiveOwnerChallenge: ["ownerId", "challenge"],
    ExecutiveOwnerSession: ["ownerId", "credentialId"], ExecutiveAgent: ["officeId", "displayName", "reportsToOwnerId"],
    ExecutiveCharter: ["officeId", "title", "contentMarkdown", "sourceFileName"],
    ExecutiveCharterAcceptance: ["officeId", "charterId", "ownerId", "ownerCredentialId", "ownerSessionRef", "requestKey"],
    ExecutiveActivityEvent: ["officeId", "eventType", "subjectType", "requestId"],
  };
  for (const table of EXECUTIVE_TABLES) {
    invalid.push([table, "id", " "]);
    for (const field of strings[table] ?? []) invalid.push([table, field, " "]);
    if ("updatedAt" in foundationFixture().rows[table]) invalid.push([table, "updatedAt", at(-1)]);
  }
  for (const [table, field] of [
    ["ExecutiveOffice", "bootstrapHash"], ["ExecutiveOwnerEnrollment", "tokenHash"],
    ["ExecutiveOwnerChallenge", "browserBindingHash"], ["ExecutiveOwnerSession", "tokenHash"],
    ["ExecutiveAuthRateLimit", "bucketKeyHash"], ["ExecutiveCharter", "contentHash"],
    ["ExecutiveCharter", "sourceFileHash"], ["ExecutiveCharterAcceptance", "contentHash"],
  ] as const) {
    invalid.push([table, field, "A".repeat(64)], [table, field, "a".repeat(63)], [table, field, "g".repeat(64)]);
  }

  it.each(invalid)("DB-06 rejects invalid %s.%s = %s", async (table, field, value, code = "23514") => {
    await withTestTransaction(async (client) => {
      const fixture = await parentsFor(client, table);
      await expectInsertFailure(client, table, { ...fixture.rows[table], [field]: value }, code);
    });
  });

  it.each(["schemaVersion", "mission", "responsibilities", "nonResponsibilities", "tools", "permissions", "spendingAuthority"])("closed CEO role rejects missing %s", async (field) => {
    await withTestTransaction(async (client) => {
      const fixture = await parentsFor(client, "ExecutiveAgent");
      const role = { ...(fixture.rows.ExecutiveAgent.roleDefinition as FixtureRow) };
      delete role[field];
      await expectInsertFailure(client, "ExecutiveAgent", { ...fixture.rows.ExecutiveAgent, roleDefinition: role });
    });
  });

  it.each<[string, unknown]>([
    ["schemaVersion", 2], ["schemaVersion", "1"], ["schemaVersion", null], ["mission", " "],
    ["mission", null], ["responsibilities", [1]], ["responsibilities", null],
    ["nonResponsibilities", {}], ["tools", ["shell"]], ["permissions", ["deploy"]],
    ["spendingAuthority", true], ["spendingAuthority", null], ["extraAuthority", "yes"],
  ])("closed CEO role rejects unauthorized/invalid %s", async (field, value) => {
    await withTestTransaction(async (client) => {
      const fixture = await parentsFor(client, "ExecutiveAgent");
      const role = { ...(fixture.rows.ExecutiveAgent.roleDefinition as FixtureRow), [field]: value };
      await expectInsertFailure(client, "ExecutiveAgent", { ...fixture.rows.ExecutiveAgent, roleDefinition: role });
    });
  });

  it("SQL NULL and JSON null cannot bypass JSON guards; helper rejects unknown kinds", async () => {
    await withTestTransaction(async (client) => {
      expect((await client.query(`SELECT public.exec_foundation_json_valid('TRANSPORTS', 'null'::jsonb) AS json_null,
        public.exec_foundation_json_valid('TRANSPORTS', NULL) AS sql_null,
        public.exec_foundation_json_valid(NULL, '[]'::jsonb) AS null_kind,
        public.exec_foundation_json_valid('OTHER', '[]'::jsonb) AS unknown_kind,
        public.exec_foundation_json_valid('ROLE_DEFINITION', 'null'::jsonb) AS role_null`)).rows[0]).toEqual({
        json_null: false, sql_null: false, null_kind: false, unknown_kind: false, role_null: false,
      });
      const fixture = await insertFoundation(client);
      for (const [table, column] of [["ExecutiveOwnerCredential", "transports"], ["ExecutiveAgent", "roleDefinition"], ["ExecutiveActivityEvent", "metadata"]] as const) {
        // INSERT avoids history/update triggers masking the actual row CHECK.
        const row = fixture.rows[table];
        const columns = Object.keys(row).filter((key) => key !== column);
        const quoted = columns.map((key) => `"${key}"`).join(",");
        const select = columns.map((key) => key === "id" ? `'null_test_${column}'` : `"${key}"`).join(",");
        for (const [literal, code] of [["NULL", "23502"], ["'null'::jsonb", "23514"]]) {
          await expectSqlFailure(client, `INSERT INTO public."${table}" (${quoted}, "${column}") SELECT ${select}, ${literal} FROM public."${table}" LIMIT 1`, [], code);
        }
      }
    });
  });

  it("valid boundary timestamps, states, JSON, and canonical Unicode charter bytes succeed", async () => {
    await withTestTransaction(async (client) => {
      const fixture = await insertFoundation(client);
      for (const status of ["ACTIVE", "LOCKED", "PENDING_ENROLLMENT"]) {
        await client.query('UPDATE public."ExecutiveOwner" SET status=$1 WHERE id=$2', [status, fixture.ids.owner]);
      }
      await client.query('UPDATE public."ExecutiveOwnerCredential" SET "lastUsedAt"=$1, "revokedAt"=$1, transports=\'[]\'::jsonb WHERE id=$2', [fixture.now, fixture.ids.credential]);
      await client.query('UPDATE public."ExecutiveAuthRateLimit" SET "blockedUntil"="expiresAt" WHERE id=$1', [fixture.ids.rateLimit]);
      await client.query('UPDATE public."ExecutiveOwner" SET "contactEmail"=$1 WHERE id=$2', ["a".repeat(320), fixture.ids.owner]);
      await client.query('UPDATE public."ExecutiveOwnerEnrollment" SET "consumedAt"=$1 WHERE id=$2', [fixture.now, fixture.ids.enrollment]);
      await client.query('UPDATE public."ExecutiveOwnerChallenge" SET "consumedAt"=$1 WHERE id=$2', [fixture.now, fixture.ids.challenge]);
      for (const actorType of ["SYSTEM", "ANONYMOUS", "OWNER"] ) {
        await insertRow(client, "ExecutiveActivityEvent", { ...fixture.rows.ExecutiveActivityEvent, id: `actor_${actorType}`, actorType, actorOwnerId: actorType === "OWNER" ? fixture.ids.owner : null, outcome: actorType === "SYSTEM" ? "REJECTED" : "FAILED" });
      }
      await insertRow(client, "ExecutiveOwnerCredential", { ...fixture.rows.ExecutiveOwnerCredential, id: "multi_device", credentialId: "bXVsdGk", deviceType: "multiDevice", transports: [], backedUp: true });
      await insertRow(client, "ExecutiveOwnerSession", { ...fixture.rows.ExecutiveOwnerSession, id: "earlier_verification", tokenHash: sha256("earlier"), verifiedAt: at(-60), idleExpiresAt: at(3600) });
      await insertRow(client, "ExecutiveCharterAcceptance", { ...fixture.rows.ExecutiveCharterAcceptance, id: "exact_five_minutes", requestKey: "boundary_receipt", verifiedAt: at(-240) });
      await insertRow(client, "ExecutiveActivityEvent", { ...fixture.rows.ExecutiveActivityEvent, id: "bounded_strings", eventType: "a".repeat(100), subjectType: "b".repeat(100), requestId: "c".repeat(200), metadata: {}, subjectId: null });
      await insertRow(client, "ExecutiveOwnerEnrollment", { ...fixture.rows.ExecutiveOwnerEnrollment, id: "bounded_reason", tokenHash: sha256("bounded_reason"), operatorReason: "r".repeat(1000) });
      expect((await client.query('SELECT "contentHash", encode(sha256(convert_to("contentMarkdown",\'UTF8\')),\'hex\') AS actual FROM public."ExecutiveCharter"')).rows[0]).toEqual({ contentHash: fixture.contentHash, actual: fixture.contentHash });
    });
  });

  it("delayed transaction uses coherent explicit issuance and receipt instants", async () => {
    await withTestTransaction(async (client) => {
      const fixture = await insertFoundation(client);
      await client.query("SELECT pg_sleep(0.02)");
      const stamp = (await client.query("SELECT clock_timestamp()::timestamptz(3) AS stamp")).rows[0].stamp as Date;
      await insertRow(client, "ExecutiveOwnerEnrollment", { ...fixture.rows.ExecutiveOwnerEnrollment, id: "delayed_grant", tokenHash: sha256("delayed-grant"), createdAt: stamp, expiresAt: new Date(stamp.getTime() + 60_000) });
      await insertRow(client, "ExecutiveCharterAcceptance", { ...fixture.rows.ExecutiveCharterAcceptance, id: "delayed_receipt", requestKey: "delayed_request", createdAt: stamp, acceptedAt: stamp, verifiedAt: stamp });
    });
  });
});

describe("DB-03/04/05 scoped relations and auth reference shapes", () => {
  const fkContract: [string, ExecutiveTable, string[], ExecutiveTable, string[]][] = [
    ["ExecOwnerOffice", "ExecutiveOwner", ["officeId"], "ExecutiveOffice", ["id"]],
    ["ExecCredentialOwner", "ExecutiveOwnerCredential", ["ownerId"], "ExecutiveOwner", ["id"]],
    ["ExecEnrollmentOwner", "ExecutiveOwnerEnrollment", ["ownerId"], "ExecutiveOwner", ["id"]],
    ["ExecChallengeOwner", "ExecutiveOwnerChallenge", ["ownerId"], "ExecutiveOwner", ["id"]],
    ["ExecSessionOwner", "ExecutiveOwnerSession", ["ownerId"], "ExecutiveOwner", ["id"]],
    ["ExecSessionCredential", "ExecutiveOwnerSession", ["ownerId", "credentialId"], "ExecutiveOwnerCredential", ["ownerId", "id"]],
    ["ExecChallengeEnrollment", "ExecutiveOwnerChallenge", ["ownerId", "enrollmentId"], "ExecutiveOwnerEnrollment", ["ownerId", "id"]],
    ["ExecChallengeSession", "ExecutiveOwnerChallenge", ["ownerId", "sessionId"], "ExecutiveOwnerSession", ["ownerId", "id"]],
    ["ExecAgentOffice", "ExecutiveAgent", ["officeId"], "ExecutiveOffice", ["id"]],
    ["ExecAgentOwner", "ExecutiveAgent", ["officeId", "reportsToOwnerId"], "ExecutiveOwner", ["officeId", "id"]],
    ["ExecCharterOffice", "ExecutiveCharter", ["officeId"], "ExecutiveOffice", ["id"]],
    ["ExecCharterImporter", "ExecutiveCharter", ["officeId", "importedByOwnerId"], "ExecutiveOwner", ["officeId", "id"]],
    ["ExecAcceptanceOffice", "ExecutiveCharterAcceptance", ["officeId"], "ExecutiveOffice", ["id"]],
    ["ExecAcceptanceOwner", "ExecutiveCharterAcceptance", ["officeId", "ownerId"], "ExecutiveOwner", ["officeId", "id"]],
    ["ExecAcceptanceCredential", "ExecutiveCharterAcceptance", ["ownerId", "ownerCredentialId"], "ExecutiveOwnerCredential", ["ownerId", "id"]],
    ["ExecAcceptanceCharter", "ExecutiveCharterAcceptance", ["officeId", "charterId", "contentHash"], "ExecutiveCharter", ["officeId", "id", "contentHash"]],
    ["ExecOfficeActiveAcceptance", "ExecutiveOffice", ["id", "activeCharterAcceptanceId"], "ExecutiveCharterAcceptance", ["officeId", "id"]],
    ["ExecAgentAcceptance", "ExecutiveAgent", ["officeId", "governingCharterAcceptanceId"], "ExecutiveCharterAcceptance", ["officeId", "id"]],
    ["ExecEventOffice", "ExecutiveActivityEvent", ["officeId"], "ExecutiveOffice", ["id"]],
    ["ExecEventOwner", "ExecutiveActivityEvent", ["officeId", "actorOwnerId"], "ExecutiveOwner", ["officeId", "id"]],
  ];

  it("all twenty FK column orders/actions/MATCH SIMPLE definitions match the contract", async () => {
    await withTestTransaction(async (client) => {
      const actual = (await client.query(`SELECT c.conname, child.relname AS child, parent.relname AS parent,
        c.confdeltype, c.confupdtype, c.confmatchtype, c.condeferrable,
        ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord)
          JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.ord) AS columns,
        ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ord)
          JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY k.ord) AS references
        FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
        JOIN pg_class parent ON parent.oid=c.confrelid WHERE c.contype='f' AND child.relname LIKE 'Executive%'`)).rows;
      expect(actual).toHaveLength(20);
      for (const [name, child, columns, parent, references] of fkContract) {
        expect(actual.find((row) => row.conname === `${name}_fk`)).toEqual({
          conname: `${name}_fk`, child, parent, columns, references,
          confdeltype: "r", confupdtype: "r", confmatchtype: "s", condeferrable: false,
        });
      }
    });
  });

  const missingReferences: [ExecutiveTable, FixtureRow][] = [
    ["ExecutiveOwner", { officeId: "missing" }], ["ExecutiveOwnerCredential", { ownerId: "missing" }],
    ["ExecutiveOwnerEnrollment", { ownerId: "missing" }], ["ExecutiveOwnerChallenge", { ownerId: "missing" }],
    ["ExecutiveOwnerSession", { ownerId: "missing" }], ["ExecutiveOwnerSession", { credentialId: "missing" }],
    ["ExecutiveAgent", { reportsToOwnerId: "missing" }], ["ExecutiveAgent", { officeId: "missing" }],
    ["ExecutiveCharter", { officeId: "missing" }], ["ExecutiveCharter", { importedByOwnerId: "missing" }],
    ["ExecutiveCharterAcceptance", { officeId: "missing" }], ["ExecutiveCharterAcceptance", { ownerId: "missing" }],
    ["ExecutiveCharterAcceptance", { ownerCredentialId: "missing" }], ["ExecutiveCharterAcceptance", { charterId: "missing" }],
    ["ExecutiveCharterAcceptance", { contentHash: "a".repeat(64) }],
    ["ExecutiveActivityEvent", { officeId: "missing" }],
    ["ExecutiveActivityEvent", { actorType: "OWNER", actorOwnerId: "missing" }],
  ];
  it.each(missingReferences)("rejects nonexistent/wrong scope reference on %s: %j", async (table, patch) => {
    await withTestTransaction(async (client) => {
      const fixture = await parentsFor(client, table);
      await expectInsertFailure(client, table, { ...fixture.rows[table], ...patch }, "23503");
    });
  });

  it("rejects missing active/governing receipts through their immediate FKs", async () => {
    await withTestTransaction(async (client) => {
      await insertFoundation(client);
      await expectSqlFailure(client, 'UPDATE public."ExecutiveOffice" SET "activeCharterAcceptanceId"=\'missing\'', [], "23503");
      await expectSqlFailure(client, 'UPDATE public."ExecutiveAgent" SET "governingCharterAcceptanceId"=\'missing\'', [], "23503");
    });
  });

  it("a different valid Charter cannot be paired with the original Charter's hash", async () => {
    await withTestTransaction(async (client) => {
      const fixture = await insertFoundation(client);
      const text = `${fixture.rows.ExecutiveCharter.contentMarkdown}Second version.\n`;
      const hash = sha256(text);
      await insertRow(client, "ExecutiveCharter", { ...fixture.rows.ExecutiveCharter, id: "second_charter", version: 2, contentMarkdown: text, contentHash: hash });
      await expectInsertFailure(client, "ExecutiveCharterAcceptance", { ...fixture.rows.ExecutiveCharterAcceptance, id: "wrong_charter_hash", requestKey: "wrong_hash", charterId: "second_charter" }, "23503");
      await insertRow(client, "ExecutiveCharterAcceptance", { ...fixture.rows.ExecutiveCharterAcceptance, id: "right_charter_hash", requestKey: "right_hash", charterId: "second_charter", contentHash: hash });
    });
  });

  it("valid same-Owner enrollment/session links and every optional-reference shape succeed", async () => {
    await withTestTransaction(async (client) => {
      const fixture = await insertFoundation(client);
      await insertRow(client, "ExecutiveOwnerEnrollment", { ...fixture.rows.ExecutiveOwnerEnrollment, id: "recovery", tokenHash: sha256("recovery"), purpose: "RECOVERY" });
      for (const purpose of ["INITIAL_ENROLLMENT", "RECOVERY_ENROLLMENT", "ADD_CREDENTIAL", "REVERIFY"] ) {
        const enrollment = purpose.endsWith("ENROLLMENT");
        await insertRow(client, "ExecutiveOwnerChallenge", {
          ...fixture.rows.ExecutiveOwnerChallenge, id: purpose, challenge: Buffer.from(purpose).toString("base64url"), purpose,
          enrollmentId: enrollment ? (purpose.startsWith("INITIAL") ? fixture.ids.enrollment : "recovery") : null,
          sessionId: enrollment ? null : fixture.ids.session,
        });
      }
      await insertRow(client, "ExecutiveCharter", { ...fixture.rows.ExecutiveCharter, id: "imported", version: 2, importedByOwnerId: fixture.ids.owner });
    });
  });

  it.each<[string, string | null, string | null]>([
    ["SIGN_IN", "fixture_enrollment", null], ["SIGN_IN", null, "fixture_session"],
    ["INITIAL_ENROLLMENT", null, null], ["INITIAL_ENROLLMENT", "fixture_enrollment", "fixture_session"],
    ["RECOVERY_ENROLLMENT", null, null], ["RECOVERY_ENROLLMENT", "fixture_enrollment", null],
    ["ADD_CREDENTIAL", null, null], ["ADD_CREDENTIAL", "fixture_enrollment", "fixture_session"],
    ["REVERIFY", null, null], ["REVERIFY", "fixture_enrollment", "fixture_session"],
  ])("rejects purpose/null matrix %s / %s / %s", async (purpose, enrollmentId, sessionId) => {
    await withTestTransaction(async (client) => {
      const fixture = await insertFoundation(client);
      await expectInsertFailure(client, "ExecutiveOwnerChallenge", { ...fixture.rows.ExecutiveOwnerChallenge, id: "bad_shape", challenge: "YmFkX3NoYXBl", purpose, enrollmentId, sessionId });
    });
  });

  it("INITIAL cannot use a RECOVERY grant; nonexistent grant and wrong session are rejected", async () => {
    await withTestTransaction(async (client) => {
      const fixture = await insertFoundation(client);
      await insertRow(client, "ExecutiveOwnerEnrollment", { ...fixture.rows.ExecutiveOwnerEnrollment, id: "recovery", tokenHash: sha256("recovery"), purpose: "RECOVERY" });
      const challenge = { ...fixture.rows.ExecutiveOwnerChallenge, id: "invalid_grant", challenge: "aW52YWxpZF9ncmFudA" };
      await expectInsertFailure(client, "ExecutiveOwnerChallenge", { ...challenge, purpose: "INITIAL_ENROLLMENT", enrollmentId: "recovery" });
      await expectInsertFailure(client, "ExecutiveOwnerChallenge", { ...challenge, purpose: "INITIAL_ENROLLMENT", enrollmentId: "missing" });
      await expectInsertFailure(client, "ExecutiveOwnerChallenge", { ...challenge, purpose: "REVERIFY", sessionId: "missing" }, "23503");
    });
  });

  it("grant consumption and revocation cannot both be set", async () => {
    await withTestTransaction(async (client) => {
      const fixture = await parentsFor(client, "ExecutiveOwnerEnrollment");
      await expectInsertFailure(client, "ExecutiveOwnerEnrollment", { ...fixture.rows.ExecutiveOwnerEnrollment, consumedAt: at(1), revokedAt: at(2) });
    });
  });
});

describe("DB-12/13 retained authentication history and non-owner DML", () => {
  it("ordinary non-owner DML works; a separate broad grant proves guards independently of privileges", async () => {
    const env = await createIsolatedTestDatabase("privileges");
    const migrator = await connectTestDatabase("migrator", env);
    try {
      for (const name of FOUNDATION_MIGRATIONS) await migrator.query(await loadMigrationSql(name));
      await grantTestApplicationAccess(migrator);
      await withTestTransaction(async (client) => {
        const fixture = await insertFoundation(client);
        await client.query('UPDATE public."ExecutiveOffice" SET name=\'Valid display edit\' WHERE id=$1', [fixture.ids.office]);
        await client.query('DELETE FROM public."ExecutiveOwnerChallenge" WHERE id=$1', [fixture.ids.challenge]);
        expect((await client.query('SELECT count(*)::int AS n FROM public."ExecutiveCharterAcceptance"')).rows[0].n).toBe(1);
        await expectSqlFailure(client, 'TRUNCATE public."ExecutiveActivityEvent"', [], "42501");
      }, "app", env);
      // This test-only grant applies solely to the newly created disposable DB.
      await grantTestApplicationAccess(migrator, { allowTruncate: true });
      await withTestTransaction(async (client) => {
        await insertFoundation(client);
        await expectSqlFailure(client, 'UPDATE public."ExecutiveActivityEvent" SET "outcome"=\'SUCCESS\' WHERE FALSE');
        await expectSqlFailure(client, 'DELETE FROM public."ExecutiveCharter" WHERE FALSE');
        await expectSqlFailure(client, 'TRUNCATE public."ExecutiveActivityEvent"');
      }, "app", env);
    } finally { await migrator.end(); }
  });

  it("revoked credential / stale generations remain representable without claiming usable authentication", async () => {
    await withTestTransaction(async (client) => {
      const fixture = await insertFoundation(client);
      await client.query('UPDATE public."ExecutiveOwner" SET "authVersion"=2 WHERE id=$1', [fixture.ids.owner]);
      await client.query('UPDATE public."ExecutiveOwnerCredential" SET "revokedAt"=$1 WHERE id=$2', [at(1), fixture.ids.credential]);
      await insertRow(client, "ExecutiveOwnerSession", { ...fixture.rows.ExecutiveOwnerSession, id: "stale_session", tokenHash: sha256("stale_session") });
      await insertRow(client, "ExecutiveCharterAcceptance", { ...fixture.rows.ExecutiveCharterAcceptance, id: "retained_receipt", requestKey: "retained_request" });
      expect((await client.query('SELECT "authVersion" FROM public."ExecutiveOwnerSession" WHERE id=\'stale_session\'')).rows[0].authVersion).toBe(1);
      expect((await client.query('SELECT count(*)::int AS n FROM public."ExecutiveCharterAcceptance"')).rows[0].n).toBe(2);
    });
  });

  it("all foundation tests run as the named non-owner, nonsuperuser, non-CREATEDB role", async () => {
    const client = await connectTestDatabase();
    try {
      const role = (await client.query("SELECT current_user, rolsuper, rolcreatedb FROM pg_roles WHERE rolname=current_user")).rows[0];
      expect(role).toEqual({ current_user: "exec_test_app", rolsuper: false, rolcreatedb: false });
      expect((await client.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'Executive%' AND tableowner=current_user`)).rows[0].n).toBe(0);
      expect((await client.query(`SELECT has_table_privilege(current_user,'public."ExecutiveCharter"','UPDATE') AS update,
        has_table_privilege(current_user,'public."ExecutiveCharter"','DELETE') AS delete,
        has_table_privilege(current_user,'public."ExecutiveCharter"','TRUNCATE') AS truncate`)).rows[0]).toEqual({ update: true, delete: true, truncate: true });
    } finally { await client.end(); }
  });
});
