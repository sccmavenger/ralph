import { describe, expect, it } from "vitest";
import {
  connectTestDatabase, expectSqlFailure, insertFoundation, insertRow,
  withTestTransaction,
} from "./test-database";

const history = ["ExecutiveCharter", "ExecutiveCharterAcceptance", "ExecutiveActivityEvent"] as const;
const identities = ["ExecutiveOffice", "ExecutiveOwner", "ExecutiveAgent", "ExecutiveOwnerCredential"] as const;

describe("DB-07 append-only SQL guards (non-owner application role)", () => {
  for (const table of history) {
    for (const predicate of ["TRUE", "FALSE"]) {
      it(`${table} rejects UPDATE and DELETE, including zero rows (${predicate})`, async () => {
        await withTestTransaction(async (db) => {
          await insertFoundation(db);
          await expectSqlFailure(db, `UPDATE "${table}" SET "id" = "id" WHERE ${predicate}`);
          await expectSqlFailure(db, `DELETE FROM "${table}" WHERE ${predicate}`);
        });
      });
    }
    it(`${table} rejects TRUNCATE and cascading identity reset`, async () => {
      await withTestTransaction(async (db) => {
        await insertFoundation(db);
        // CASCADE includes FK dependents so a FK refusal cannot mask the trigger.
        await expectSqlFailure(db, `TRUNCATE "${table}" CASCADE`);
        await expectSqlFailure(db, `TRUNCATE "${table}" RESTART IDENTITY CASCADE`);
      });
    });
  }
});

describe("DB-08 permanent identities and exhaustive immutable fields", () => {
  for (const table of identities) {
    it(`${table} rejects delete/recreate and truncate`, async () => {
      await withTestTransaction(async (db) => {
        await insertFoundation(db);
        await expectSqlFailure(db, `DELETE FROM "${table}"`);
        await expectSqlFailure(db, `DELETE FROM "${table}" WHERE FALSE`);
        await expectSqlFailure(db, `TRUNCATE "${table}" CASCADE`);
      });
    });
  }

  it("guards an Office before any dependent row exists", async () => {
    await withTestTransaction(async (db) => {
      await db.query(`INSERT INTO "ExecutiveOffice"
        (id,key,name,"bootstrapVersion","bootstrapHash","updatedAt")
        VALUES ('lonely','msf-toolkit','Synthetic',1,$1,CURRENT_TIMESTAMP)`, ["a".repeat(64)]);
      await expectSqlFailure(db, `DELETE FROM "ExecutiveOffice"`);
      await expectSqlFailure(db, `UPDATE "ExecutiveOffice" SET id='replacement'`);
    });
  });

  const immutable: Record<string, string[]> = {
    ExecutiveOffice: ["id", "key", "createdAt", "bootstrapVersion", "bootstrapHash", "phase", "executionMode"],
    ExecutiveOwner: ["id", "officeId", "createdAt", "webauthnUserId"],
    ExecutiveOwnerCredential: ["id", "ownerId", "createdAt", "credentialId", "publicKey", "rpId", "deviceType"],
    ExecutiveOwnerEnrollment: ["id", "ownerId", "createdAt", "purpose", "tokenHash", "expiresAt", "operatorReason"],
    ExecutiveOwnerChallenge: ["id", "ownerId", "createdAt", "purpose", "challenge", "browserBindingHash", "enrollmentId", "sessionId", "authVersion", "expiresAt"],
    ExecutiveOwnerSession: ["id", "ownerId", "createdAt", "credentialId", "tokenHash", "authVersion", "absoluteExpiresAt"],
    ExecutiveAuthRateLimit: ["id", "createdAt", "bucketKeyHash"],
    ExecutiveAgent: ["id", "officeId", "createdAt", "roleKey", "reportsToOwnerId", "status", "roleDefinitionVersion", "roleDefinition"],
  };
  for (const [table, fields] of Object.entries(immutable)) {
    for (const field of fields) {
      it(`${table}.${field} cannot be rewritten`, async () => {
        await withTestTransaction(async (db) => {
          await insertFoundation(db);
          let expression = `'different'`;
          if (field.endsWith("At")) expression = `"${field}" + INTERVAL '1 second'`;
          if (["bootstrapVersion", "authVersion", "roleDefinitionVersion"].includes(field)) expression = `"${field}" + 1`;
          if (field === "publicKey") expression = `decode('040506', 'hex')`;
          if (field === "roleDefinition") expression = `'{}'::jsonb`;
          await expectSqlFailure(db, `UPDATE "${table}" SET "${field}"=${expression}`);
        });
      });
    }
  }

  it("allows all intended mutable display/usage/throttle fields", async () => {
    await withTestTransaction(async (db) => {
      const f = await insertFoundation(db);
      const later = new Date(f.now.getTime() + 1000);
      await db.query(`UPDATE "ExecutiveOffice" SET name='Updated', "updatedAt"=$1`, [later]);
      await db.query(`UPDATE "ExecutiveOwner" SET "displayName"='Updated',"contactEmail"='test@example.invalid',status='LOCKED',"authVersion"=2,"updatedAt"=$1`, [later]);
      await db.query(`UPDATE "ExecutiveOwnerCredential" SET counter=0,label='Backup',transports='["internal"]',"backedUp"=TRUE,"lastUsedAt"=$1,"revokedAt"=$1`, [later]);
      await db.query(`UPDATE "ExecutiveAgent" SET "displayName"='Updated',"updatedAt"=$1`, [later]);
      await db.query(`UPDATE "ExecutiveOwnerSession" SET "verifiedAt"=$1,"lastSeenAt"=$1,"idleExpiresAt"="idleExpiresAt"+INTERVAL '1 minute',"revokedAt"=$1`, [later]);
      await db.query(`UPDATE "ExecutiveAuthRateLimit" SET "attemptCount"=3,"updatedAt"=$1`, [later]);
      await db.query(`UPDATE "ExecutiveAuthRateLimit" SET "attemptCount"=0,"windowStartedAt"=$1,"blockedUntil"=$1,"expiresAt"="expiresAt"+INTERVAL '1 minute',"updatedAt"=$1`, [later]);
      await db.query("SET CONSTRAINTS ALL IMMEDIATE");
    });
  });

  for (const [table, field] of [
    ["ExecutiveOwnerEnrollment", "consumedAt"], ["ExecutiveOwnerEnrollment", "revokedAt"],
    ["ExecutiveOwnerChallenge", "consumedAt"], ["ExecutiveOwnerCredential", "revokedAt"],
    ["ExecutiveOwnerSession", "revokedAt"],
  ]) {
    it(`${table}.${field} can be set once, never cleared or moved`, async () => {
      await withTestTransaction(async (db) => {
        const f = await insertFoundation(db);
        await db.query(`UPDATE "${table}" SET "${field}"=$1`, [f.now]);
        await db.query(`UPDATE "${table}" SET "${field}"="${field}"`);
        await expectSqlFailure(db, `UPDATE "${table}" SET "${field}"=NULL`);
        await expectSqlFailure(db, `UPDATE "${table}" SET "${field}"="${field}"+INTERVAL '1 second'`);
      });
    });
  }

  it("cannot roll back authVersion, use timestamps, or a throttle window/count", async () => {
    await withTestTransaction(async (db) => {
      const f = await insertFoundation(db);
      await db.query(`UPDATE "ExecutiveOwner" SET "authVersion"=3`);
      await expectSqlFailure(db, `UPDATE "ExecutiveOwner" SET "authVersion"=2`);
      const later = new Date(f.now.getTime() + 2000);
      await db.query(`UPDATE "ExecutiveOwnerCredential" SET "lastUsedAt"=$1`, [later]);
      await expectSqlFailure(db, `UPDATE "ExecutiveOwnerCredential" SET "lastUsedAt"=NULL`);
      await expectSqlFailure(db, `UPDATE "ExecutiveOwnerCredential" SET "lastUsedAt"=$1`, [f.now]);
      for (const field of ["verifiedAt", "lastSeenAt", "idleExpiresAt"]) {
        await expectSqlFailure(db, `UPDATE "ExecutiveOwnerSession" SET "${field}"="${field}"-INTERVAL '1 second'`);
      }
      await db.query(`UPDATE "ExecutiveAuthRateLimit" SET "attemptCount"=3`);
      await expectSqlFailure(db, `UPDATE "ExecutiveAuthRateLimit" SET "attemptCount"=2`);
      await expectSqlFailure(db, `UPDATE "ExecutiveAuthRateLimit" SET "windowStartedAt"="windowStartedAt"-INTERVAL '1 second'`);
    });
  });
});

describe("DB-09 cleanup preserves permanent attribution", () => {
  it("requires challenge-first cleanup; receipt has no session FK", async () => {
    await withTestTransaction(async (db) => {
      const f = await insertFoundation(db);
      await insertRow(db, "ExecutiveOwnerChallenge", {
        ...f.rows.ExecutiveOwnerChallenge, id: "grant_ref", challenge: "Z3JhbnRfcmVm",
        purpose: "INITIAL_ENROLLMENT", enrollmentId: f.ids.enrollment, sessionId: null,
      });
      await insertRow(db, "ExecutiveOwnerChallenge", {
        ...f.rows.ExecutiveOwnerChallenge, id: "session_ref", challenge: "c2Vzc2lvbl9yZWY",
        purpose: "REVERIFY", enrollmentId: null, sessionId: f.ids.session,
      });
      await expectSqlFailure(db, `DELETE FROM "ExecutiveOwnerEnrollment"`, [], "23503");
      await expectSqlFailure(db, `DELETE FROM "ExecutiveOwnerSession"`, [], "23503");
      const cutoff = new Date(f.now.getTime() + 3 * 86400_000);
      await db.query(`DELETE FROM "ExecutiveOwnerChallenge" WHERE "expiresAt"<$1`, [cutoff]);
      await db.query(`DELETE FROM "ExecutiveOwnerEnrollment" WHERE "expiresAt"<$1`, [cutoff]);
      await db.query(`DELETE FROM "ExecutiveOwnerSession" WHERE "absoluteExpiresAt"<$1`, [cutoff]);
      await db.query(`DELETE FROM "ExecutiveAuthRateLimit" WHERE "expiresAt"<$1`, [cutoff]);
      for (const table of [...history, ...identities]) {
        expect((await db.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n).toBe(1);
      }
      expect((await db.query(`SELECT "ownerSessionRef" FROM "ExecutiveCharterAcceptance"`)).rows[0].ownerSessionRef).toBe(f.ids.session);
    });
  });
});

describe("DB-11 atomic synthetic state and audit", () => {
  it("audit failure rolls back the whole synthetic transaction, including state", async () => {
    const db = await connectTestDatabase();
    try {
      await db.query("BEGIN");
      const f = await insertFoundation(db);
      await db.query(`UPDATE "ExecutiveOwner" SET "displayName"='must roll back'`);
      await expect(insertRow(db, "ExecutiveActivityEvent", {
        ...f.rows.ExecutiveActivityEvent, id: "bad_audit", sequence: undefined, outcome: "INVALID",
      })).rejects.toMatchObject({ code: "23514" });
      await db.query("ROLLBACK");
      expect((await db.query(`SELECT count(*)::int AS n FROM "ExecutiveOwner"`)).rows[0].n).toBe(0);
      expect((await db.query(`SELECT count(*)::int AS n FROM "ExecutiveActivityEvent"`)).rows[0].n).toBe(0);
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  });
});
