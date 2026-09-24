import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapSqlState, runBootstrap } from "../../src/lib/executive/bootstrap";
import { canonicalHash } from "../../src/lib/executive/canonical";
import {
  businessSnapshot, createBootstrapFixture, executiveSnapshot, interceptBootstrapClient,
  type TransactionOperation,
} from "./bootstrap-fixtures";
import { connectTestDatabase, validateTestEnvironment } from "./test-database";

beforeAll(() => { validateTestEnvironment(); });

const boundaries = ["Office", "Owner", "Charter", "CEO", "first event", "second event", "readback", "constraints"] as const;

describe("BOOT-12/13/14 actual PostgreSQL rollback, bounded retry and modeled acknowledgment loss", () => {
  it.each(boundaries)("rolls back every Executive row after %s and preserves all 22 existing business catalogs/sentinels", async (boundary) => {
    const fixture = await createBootstrapFixture(`fail_${boundaries.indexOf(boundary)}`, { business: true });
    let injected = false;
    let events = 0;
    let officeCreated = false;
    try {
      const beforeExecutive = await executiveSnapshot(fixture.env);
      const beforeBusiness = await businessSnapshot(fixture.env);
      const matches = (operation: TransactionOperation) => {
        if (operation.model === "executiveOffice" && operation.method === "createManyAndReturn") officeCreated = true;
        if (operation.model === "executiveActivityEvent" && operation.method === "create") events++;
        return boundary === "Office" && operation.model === "executiveOffice" && operation.method === "createManyAndReturn"
          || boundary === "Owner" && operation.model === "executiveOwner" && operation.method === "create"
          || boundary === "Charter" && operation.model === "executiveCharter" && operation.method === "create"
          || boundary === "CEO" && operation.model === "executiveAgent" && operation.method === "create"
          || boundary === "first event" && operation.model === "executiveActivityEvent" && events === 1
          || boundary === "second event" && operation.model === "executiveActivityEvent" && events === 2
          || boundary === "readback" && officeCreated && operation.method === "$queryRawUnsafe" && String(operation.args[0]).includes("AS snapshot")
          || boundary === "constraints" && operation.method === "$executeRawUnsafe" && operation.args[0] === "SET CONSTRAINTS ALL IMMEDIATE";
      };
      const failing = interceptBootstrapClient(fixture.client, { afterOperation: async (operation) => {
        if (!injected && matches(operation)) { injected = true; throw new Error("Synthetic private fault detail never emitted"); }
      } });
      const outcome = await runBootstrap({ client: failing, mode: "apply", prepared: fixture.prepared, readiness: fixture.readiness });
      expect(injected).toBe(true);
      expect(outcome).toMatchObject({ status: "FAILED", exitCode: 5, diagnostic: { auditPersisted: false } });
      expect(JSON.stringify(outcome)).not.toMatch(/private fault detail/);
      expect((await executiveSnapshot(fixture.env)).rows).toEqual(beforeExecutive.rows);
      expect(await businessSnapshot(fixture.env)).toEqual(beforeBusiness);
      // Sequence gaps are deliberately permitted after rollback; replaying the
      // same validated inputs creates one new complete foundation, not a repair.
      expect(await fixture.run()).toMatchObject({ status: "CREATED", exitCode: 0 });
      expect((await executiveSnapshot(fixture.env)).rows.ExecutiveActivityEvent).toHaveLength(2);
      expect(await businessSnapshot(fixture.env)).toEqual(beforeBusiness);
    } finally { await fixture.close(); }
  }, 60_000);

  it.each(["40001", "40P01"])("real server SQLSTATE %s is identified by PrismaPg and retried only once with unchanged request/lock", async (sqlState) => {
    const fixture = await createBootstrapFixture(`retry_${sqlState.toLowerCase()}`);
    let faulted = false;
    let observed: string | undefined;
    let locks = 0;
    const requestId = randomUUID();
    try {
      const failingOnce = interceptBootstrapClient(fixture.client, { afterOperation: async (operation) => {
        if (operation.method === "$queryRawUnsafe" && String(operation.args[0]).includes("pg_advisory_xact_lock")) {
          locks++;
          expect(operation.args.slice(1)).toEqual([1297303109, 1]);
        }
        if (!faulted && operation.model === "executiveOffice" && operation.method === "createManyAndReturn") {
          faulted = true;
          try {
            // Fixed allowlisted test SQL, real server error/transaction abort.
            await operation.transaction.$executeRawUnsafe(sqlState === "40001"
              ? "DO $$ BEGIN RAISE EXCEPTION 'Synthetic serialization abort' USING ERRCODE='40001'; END $$"
              : "DO $$ BEGIN RAISE EXCEPTION 'Synthetic deadlock abort' USING ERRCODE='40P01'; END $$");
          } catch (error) { observed = bootstrapSqlState(error); throw error; }
        }
      } });
      expect(await runBootstrap({ client: failingOnce, mode: "apply", prepared: fixture.prepared, readiness: fixture.readiness, requestId }))
        .toMatchObject({ status: "CREATED", requestId, exitCode: 0 });
      expect(observed).toBe(sqlState);
      expect(locks).toBe(2);
      const events = await fixture.client.executiveActivityEvent.findMany();
      expect(events).toHaveLength(2);
      expect(events.every((event) => event.requestId === requestId)).toBe(true);
    } finally { await fixture.close(); }
  }, 30_000);

  it("a repeatedly server-aborted transaction stops after one retry with no foundation or success audit", async () => {
    const fixture = await createBootstrapFixture("retry_bounded");
    let attempts = 0;
    try {
      const aborted = interceptBootstrapClient(fixture.client, { afterOperation: async (operation) => {
        if (operation.model === "executiveOffice" && operation.method === "createManyAndReturn") {
          attempts++;
          await operation.transaction.$executeRawUnsafe("DO $$ BEGIN RAISE EXCEPTION 'Synthetic abort' USING ERRCODE='40001'; END $$");
        }
      } });
      expect(await runBootstrap({ client: aborted, mode: "apply", prepared: fixture.prepared, readiness: fixture.readiness }))
        .toMatchObject({ reasonCode: "TRANSACTION_FAILED", exitCode: 5, diagnostic: { auditPersisted: false } });
      expect(attempts).toBe(2);
      for (const rows of Object.values((await executiveSnapshot(fixture.env)).rows)) expect(rows).toEqual([]);
    } finally { await fixture.close(); }
  });

  it("a real audit-phase database error rolls back the first event and every identity without retry", async () => {
    const fixture = await createBootstrapFixture("audit_failure");
    let attempts = 0;
    let observed: string | undefined;
    try {
      const failing = interceptBootstrapClient(fixture.client, { afterOperation: async (operation) => {
        if (operation.model === "executiveActivityEvent" && operation.method === "create") {
          attempts++;
          try { await operation.transaction.$queryRawUnsafe("SELECT 1 / 0 AS synthetic_audit_failure"); }
          catch (error) { observed = bootstrapSqlState(error); throw error; }
        }
      } });
      expect(await runBootstrap({ client: failing, mode: "apply", prepared: fixture.prepared, readiness: fixture.readiness }))
        .toMatchObject({ reasonCode: "AUDIT_WRITE_FAILED", diagnostic: { phase: "AUDIT", auditPersisted: false } });
      expect(observed).toBe("22012");
      expect(attempts).toBe(1);
      for (const rows of Object.values((await executiveSnapshot(fixture.env)).rows)) expect(rows).toEqual([]);
    } finally { await fixture.close(); }
  });

  it("a real same-role backend disconnect before commit leaves no foundation", async () => {
    const fixture = await createBootstrapFixture("disconnect");
    const controller = await connectTestDatabase("app", fixture.env);
    let terminated = false;
    try {
      const disconnected = interceptBootstrapClient(fixture.client, { afterOperation: async (operation) => {
        if (operation.model === "executiveOffice" && operation.method === "createManyAndReturn") {
          const [row] = await operation.transaction.$queryRawUnsafe<{ pid: number }[]>("SELECT pg_catalog.pg_backend_pid() AS pid");
          const result = await controller.query(`SELECT pg_catalog.pg_terminate_backend(pid) AS terminated FROM pg_catalog.pg_stat_activity
            WHERE pid=$1 AND datname=current_database() AND usename=current_user`, [row.pid]);
          expect(result.rows).toEqual([{ terminated: true }]);
          terminated = true;
        }
      } });
      expect(await runBootstrap({ client: disconnected, mode: "apply", prepared: fixture.prepared, readiness: fixture.readiness }))
        .toMatchObject({ status: "FAILED", reasonCode: "TRANSACTION_FAILED", diagnostic: { auditPersisted: false } });
      expect(terminated).toBe(true);
      for (const rows of Object.values((await executiveSnapshot(fixture.env)).rows)) expect(rows).toEqual([]);
      expect(await fixture.run()).toMatchObject({ status: "CREATED" });
    } finally { await controller.end(); await fixture.close(); }
  });

  it("models a dropped adapter acknowledgment AFTER real commit, then resolves through no-write replay", async () => {
    const fixture = await createBootstrapFixture("lost_ack");
    let committed = false;
    try {
      const acknowledgmentLost = interceptBootstrapClient(fixture.client, { afterCommitted: async () => {
        committed = true;
        throw Object.assign(new Error("Synthetic dropped acknowledgment"), { code: "ECONNRESET" });
      } });
      const result = await runBootstrap({ client: acknowledgmentLost, mode: "apply", prepared: fixture.prepared, readiness: fixture.readiness });
      expect(committed).toBe(true);
      expect(result).toMatchObject({ reasonCode: "COMMIT_OUTCOME_UNKNOWN", exitCode: 6, diagnostic: { phase: "COMMIT" } });
      if (!("diagnostic" in result)) throw new Error("Expected unknown outcome diagnostic");
      expect(result.diagnostic).not.toHaveProperty("auditPersisted");
      const before = await executiveSnapshot(fixture.env);
      expect(before.rows.ExecutiveOffice).toHaveLength(1);
      expect(before.rows.ExecutiveActivityEvent).toHaveLength(2);
      expect(await fixture.run()).toMatchObject({ status: "ALREADY_BOOTSTRAPPED" });
      expect(await executiveSnapshot(fixture.env)).toEqual(before);
    } finally { await fixture.close(); }
  });

  it("unknown rejection acknowledgment does not falsely claim absent audit; another conflicting attempt may append", async () => {
    const fixture = await createBootstrapFixture("reject_ack");
    try {
      expect(await fixture.run()).toMatchObject({ status: "CREATED" });
      const changed = structuredClone(fixture.prepared);
      changed.envelope.owner.displayName = "Conflicting synthetic Owner";
      changed.bootstrapHash = canonicalHash(changed.envelope);
      const acknowledgmentLost = interceptBootstrapClient(fixture.client, { afterCommitted: async () => { throw new Error("Synthetic acknowledgment lost"); } });
      const unknown = await runBootstrap({ client: acknowledgmentLost, mode: "apply", prepared: changed, readiness: fixture.readiness });
      expect(unknown).toMatchObject({ reasonCode: "COMMIT_OUTCOME_UNKNOWN", exitCode: 6 });
      if (!("diagnostic" in unknown)) throw new Error("Expected unknown outcome diagnostic");
      expect(unknown.diagnostic).not.toHaveProperty("auditPersisted");
      expect((await executiveSnapshot(fixture.env)).rows.ExecutiveActivityEvent).toHaveLength(3);
      expect(await fixture.run("apply", changed)).toMatchObject({ reasonCode: "BOOTSTRAP_CONFLICT", diagnostic: { auditPersisted: true } });
      expect((await executiveSnapshot(fixture.env)).rows.ExecutiveActivityEvent).toHaveLength(4);
    } finally { await fixture.close(); }
  });
});
