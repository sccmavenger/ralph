import type { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalHash } from "../../src/lib/executive/canonical";
import { runBootstrap } from "../../src/lib/executive/bootstrap";
import { bootstrapReadiness, createBootstrapFixture, executiveSnapshot, interceptBootstrapClient } from "./bootstrap-fixtures";
import { connectTestDatabase, validateTestEnvironment } from "./test-database";

beforeAll(() => { validateTestEnvironment(); });

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

async function observeAdvisoryWaiter(observer: Client) {
  const end = Date.now() + 3500;
  while (Date.now() < end) {
    const result = await observer.query(`SELECT count(*)::int AS waiting FROM pg_catalog.pg_locks
      WHERE locktype='advisory' AND classid=1297303109 AND objid=1 AND objsubid=2
      AND database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) AND NOT granted`);
    if (result.rows[0].waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected fixed transaction advisory lock waiter was not observed");
}

describe("BOOT-07/08 independent caller serialization and BOOT-09 coherent readonly snapshots", () => {
  it.each([false, true])("two real clients serialize (different inputs=%s) with one creator and no partial foundation", async (different) => {
    const fixture = await createBootstrapFixture(different ? "race_conflict" : "race_same");
    const observer = await connectTestDatabase("app", fixture.env);
    const entered = gate();
    const release = gate();
    let first: ReturnType<typeof runBootstrap> | undefined;
    let second: ReturnType<typeof runBootstrap> | undefined;
    try {
      const secondClient = await fixture.newClient();
      first = runBootstrap({ client: fixture.client, mode: "apply", prepared: fixture.prepared,
        readiness: async (tx) => { await fixture.readiness(tx); entered.release(); await release.promise; } });
      await Promise.race([entered.promise, first.then(() => { throw new Error("First caller completed before lock barrier"); })]);
      const attempted = structuredClone(fixture.prepared);
      if (different) {
        attempted.envelope.owner.displayName = "Other synthetic Owner";
        attempted.bootstrapHash = canonicalHash(attempted.envelope);
      }
      second = runBootstrap({ client: secondClient, mode: "apply", prepared: attempted, readiness: fixture.readiness });
      await observeAdvisoryWaiter(observer);
      release.release();
      const [winner, follower] = await Promise.all([first, second]);
      expect(winner).toMatchObject({ status: "CREATED", exitCode: 0 });
      expect(follower).toMatchObject(different
        ? { reasonCode: "BOOTSTRAP_CONFLICT", exitCode: 4, diagnostic: { auditPersisted: true } }
        : { status: "ALREADY_BOOTSTRAPPED", exitCode: 0 });
      if (!different && "officeId" in winner && "officeId" in follower) {
        expect([follower.officeId, follower.ownerId, follower.ceoId, follower.charterId])
          .toEqual([winner.officeId, winner.ownerId, winner.ceoId, winner.charterId]);
      }
      const state = await executiveSnapshot(fixture.env);
      for (const table of ["ExecutiveOffice", "ExecutiveOwner", "ExecutiveAgent", "ExecutiveCharter"]) expect(state.rows[table]).toHaveLength(1);
      expect(state.rows.ExecutiveActivityEvent).toHaveLength(different ? 3 : 2);
    } finally {
      release.release();
      await Promise.allSettled([first, second].filter((promise) => promise !== undefined));
      await observer.end(); await fixture.close();
    }
  }, 30_000);

  it("an independently held fixed advisory lock times out once within the bounded lock interval and writes nothing", async () => {
    const fixture = await createBootstrapFixture("lock_timeout");
    const blocker = await connectTestDatabase("app", fixture.env);
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_catalog.pg_advisory_xact_lock($1::int,$2::int)", [1297303109, 1]);
      const before = await executiveSnapshot(fixture.env);
      const start = Date.now();
      const attempt = fixture.run();
      const observer = await connectTestDatabase("app", fixture.env);
      try { await observeAdvisoryWaiter(observer); } finally { await observer.end(); }
      const outcome = await attempt;
      const elapsed = Date.now() - start;
      expect(outcome).toMatchObject({ reasonCode: "LOCK_TIMEOUT", exitCode: 5, diagnostic: { phase: "LOCK", auditPersisted: false } });
      expect(elapsed).toBeGreaterThanOrEqual(4500);
      expect(elapsed).toBeLessThan(12000);
      expect(await executiveSnapshot(fixture.env)).toEqual(before);
    } finally {
      try { await blocker.query("ROLLBACK"); } finally { await blocker.end(); await fixture.close(); }
    }
  }, 30_000);

  it("readonly check sees a coherent empty or complete state, never another transaction's uncommitted siblings", async () => {
    const fixture = await createBootstrapFixture("check_snapshot");
    const entered = gate();
    const release = gate();
    let creating: ReturnType<typeof runBootstrap> | undefined;
    try {
      const writer = interceptBootstrapClient(fixture.client, { afterOperation: async (operation) => {
        if (operation.model === "executiveAgent" && operation.method === "create") { entered.release(); await release.promise; }
      } });
      creating = runBootstrap({ client: writer, mode: "apply", prepared: fixture.prepared, readiness: fixture.readiness });
      await Promise.race([entered.promise, creating.then(() => { throw new Error("Creation completed before uncommitted-state barrier"); })]);
      const reader = await fixture.newClient();
      expect(await runBootstrap({ client: reader, mode: "check", prepared: fixture.prepared, readiness: bootstrapReadiness(fixture.env, "check") }))
        .toMatchObject({ status: "READY_EMPTY", exitCode: 0 });
      release.release();
      expect(await creating).toMatchObject({ status: "CREATED" });
      expect(await fixture.run("check", fixture.prepared, reader)).toMatchObject({ status: "ALREADY_BOOTSTRAPPED" });
      expect((await executiveSnapshot(fixture.env)).rows.ExecutiveActivityEvent).toHaveLength(2);
    } finally {
      release.release();
      if (creating) await Promise.allSettled([creating]);
      await fixture.close();
    }
  });
});
