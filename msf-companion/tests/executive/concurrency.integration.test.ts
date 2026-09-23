import { describe, expect, it } from "vitest";
import type { Client } from "pg";
import {
  connectTestDatabase, createIsolatedTestDatabase, FOUNDATION_MIGRATIONS,
  grantTestApplicationAccess, insertFoundation, insertRow, loadMigrationSql,
} from "./test-database";

async function isolated(suffix: string, fixture = true) {
  const env = await createIsolatedTestDatabase(suffix);
  const owner = await connectTestDatabase("migrator", env);
  try {
    for (const migration of FOUNDATION_MIGRATIONS) await owner.query(await loadMigrationSql(migration));
    await grantTestApplicationAccess(owner, { allowTruncate: true });
  } finally { await owner.end(); }
  const first = await connectTestDatabase("app", env);
  const second = await connectTestDatabase("app", env);
  const observer = await connectTestDatabase("app", env);
  let data;
  if (fixture) {
    await first.query("BEGIN");
    data = await insertFoundation(first);
    await insertRow(first, "ExecutiveCharterAcceptance", {
      ...data.rows.ExecutiveCharterAcceptance, id: "receipt_b", requestKey: "receipt_b",
    });
    await first.query("COMMIT");
  }
  return {
    first, second, observer, data,
    async close() {
      for (const client of [first, second, observer]) {
        try { await client.query("ROLLBACK"); } finally { await client.end(); }
      }
      // No DROP/reset; only the CI-owned container is removed after evidence.
    },
  };
}

async function waitForBlocked(observer: Client, blocked: Client) {
  const pid = (blocked as Client & { processID: number }).processID;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const result = await observer.query("SELECT cardinality(pg_blocking_pids($1)) AS blockers", [pid]);
    if (result.rows[0].blockers > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected SQL lock contention was not observed");
}

describe("DB-02 concurrent singleton uniqueness", () => {
  it("has exactly one committed winner for the fixed Office key", async () => {
    const db = await isolated("unique_race", false);
    try {
      for (const c of [db.first, db.second]) await c.query("BEGIN");
      const sql = `INSERT INTO "ExecutiveOffice" (id,key,name,"bootstrapVersion","bootstrapHash","updatedAt")
        VALUES ($1,'msf-toolkit','Synthetic',1,$2,CURRENT_TIMESTAMP)`;
      await db.first.query(sql, ["one", "a".repeat(64)]);
      const loser = db.second.query(sql, ["two", "b".repeat(64)]).then(() => null, (e: { code: string }) => e.code);
      await waitForBlocked(db.observer, db.second);
      await db.first.query("COMMIT");
      expect(await loser).toBe("23505");
      await db.second.query("ROLLBACK");
      expect((await db.observer.query(`SELECT id FROM "ExecutiveOffice"`)).rows).toEqual([{ id: "one" }]);
    } finally { await db.close(); }
  });
});

describe("DB-10 deferred Office/CEO authority agreement", () => {
  it("rejects split authority at actual COMMIT, preserving the previous state", async () => {
    const db = await isolated("split_commit");
    try {
      await db.first.query("BEGIN");
      await db.first.query(`UPDATE "ExecutiveOffice" SET "activeCharterAcceptanceId"=$1`, [db.data!.ids.acceptance]);
      await expect(db.first.query("COMMIT")).rejects.toMatchObject({ code: "23514" });
      const actual = await db.observer.query(`SELECT o."activeCharterAcceptanceId" AS office,a."governingCharterAcceptanceId" AS agent
        FROM "ExecutiveOffice" o JOIN "ExecutiveAgent" a ON a."officeId"=o.id`);
      expect(actual.rows).toEqual([{ office: null, agent: null }]);
    } finally { await db.close(); }
  });

  it("serializes two complete receipt transitions without split pointers", async () => {
    const db = await isolated("pair_race");
    try {
      for (const c of [db.first, db.second]) await c.query("BEGIN");
      await db.first.query(`UPDATE "ExecutiveOffice" SET "activeCharterAcceptanceId"=$1`, [db.data!.ids.acceptance]);
      await db.first.query(`UPDATE "ExecutiveAgent" SET "governingCharterAcceptanceId"=$1`, [db.data!.ids.acceptance]);
      const queued = db.second.query(`UPDATE "ExecutiveOffice" SET "activeCharterAcceptanceId"='receipt_b'`);
      await waitForBlocked(db.observer, db.second);
      await db.first.query("COMMIT");
      await queued;
      await db.second.query(`UPDATE "ExecutiveAgent" SET "governingCharterAcceptanceId"='receipt_b'`);
      await db.second.query("COMMIT");
      const rows = await db.observer.query(`SELECT o."activeCharterAcceptanceId" AS office,a."governingCharterAcceptanceId" AS agent
        FROM "ExecutiveOffice" o JOIN "ExecutiveAgent" a ON a."officeId"=o.id`);
      expect(rows.rows).toEqual([{ office: "receipt_b", agent: "receipt_b" }]);
    } finally { await db.close(); }
  });

  it("concurrent partial writers cannot combine two invalid transactions", async () => {
    const db = await isolated("partial_race");
    try {
      for (const c of [db.first, db.second]) await c.query("BEGIN");
      await db.first.query(`UPDATE "ExecutiveOffice" SET "activeCharterAcceptanceId"=$1`, [db.data!.ids.acceptance]);
      const queued = db.second.query(`UPDATE "ExecutiveAgent" SET "governingCharterAcceptanceId"='receipt_b'`);
      await waitForBlocked(db.observer, db.second);
      await expect(db.first.query("COMMIT")).rejects.toMatchObject({ code: "23514" });
      await queued;
      await expect(db.second.query("COMMIT")).rejects.toMatchObject({ code: "23514" });
      const rows = await db.observer.query(`SELECT o."activeCharterAcceptanceId" AS office,a."governingCharterAcceptanceId" AS agent
        FROM "ExecutiveOffice" o JOIN "ExecutiveAgent" a ON a."officeId"=o.id`);
      expect(rows.rows).toEqual([{ office: null, agent: null }]);
    } finally { await db.close(); }
  });
});

describe("DB-02/08 synthetic single-use transition", () => {
  it("concurrent conditional consumption produces one winner", async () => {
    const db = await isolated("consume_race");
    try {
      for (const c of [db.first, db.second]) await c.query("BEGIN");
      const sql = `UPDATE "ExecutiveOwnerChallenge" SET "consumedAt"=$1 WHERE "consumedAt" IS NULL RETURNING id`;
      const first = await db.first.query(sql, [db.data!.now]);
      const queued = db.second.query(sql, [db.data!.now]);
      await waitForBlocked(db.observer, db.second);
      await db.first.query("COMMIT");
      const second = await queued;
      await db.second.query("COMMIT");
      expect([first.rowCount, second.rowCount]).toEqual([1, 0]);
    } finally { await db.close(); }
  });
});
