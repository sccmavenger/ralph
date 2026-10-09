import { describe, expect, it, vi } from "vitest";
import { checkExecutiveReadiness, type ExecutiveReadinessQuery, type ReadinessOptions } from "../../src/lib/executive/readiness";
import manifest from "../../src/lib/executive/m1-2-readiness-manifest.json";

// Source-free metadata doubles only. These do not establish server catalog,
// isolation, privilege or migration behavior; the PG suite supplies that proof.
function fixture(mode: "check" | "apply" = "check") {
  const options: ReadinessOptions = { expectedDatabase: "msf_exec_m12_readiness_unit", expectedRole: "exec_test_app", mode };
  const identity = { database: options.expectedDatabase, role: options.expectedRole, session_role: options.expectedRole,
    version: "160004", encoding: "UTF8", replication: "origin", search_path: "pg_catalog", recovery: false,
    server_address: "127.0.0.1", server_port: 5432, read_only: mode === "check" ? "on" : "off",
    isolation: mode === "check" ? "repeatable read" : "read committed" };
  const history = manifest.migrations.map(migration => ({ migration_name: migration.name, checksum: migration.checksum,
    finished: true, rolled_back: false, applied_steps_count: 1 }));
  const responses: Record<string, unknown>[][] = [
    [identity], [{ kind: "r", persistence: "p", row_security: false, forced: false }], history,
    ...Object.values(manifest.catalog).map(rows => rows.map(item => ({ item }))),
    [Object.fromEntries(["safe_role", "connect", "schema_usage", "read_tables", "read_history", "insert_tables",
      "lock_office", "sequence_usage", "execute_functions"].map(key => [key, true]))],
  ];
  const query = vi.fn(async () => {
    const rows = responses.shift();
    if (!rows) throw new Error("Unexpected readiness query");
    return structuredClone(rows);
  });
  return { options, identity, history, query, run: () => checkExecutiveReadiness(query as ExecutiveReadinessQuery, options) };
}

describe("BOOT-01/09 source-free readiness invocation contract", () => {
  it.each(["check", "apply"] as const)("accepts the synthetic %s metadata lane", async mode => {
    expect(await fixture(mode).run()).toEqual({ ready: true, diagnostics: [] });
  });

  it.each(["unknown mode", "missing mode", "wrong role", "shared database", "trailing LF"])(
    "rejects %s before querying", async kind => {
      const f = fixture("apply");
      if (kind === "unknown mode") Object.assign(f.options, { mode: "apply-ish" });
      if (kind === "missing mode") Object.assign(f.options, { mode: undefined });
      if (kind === "wrong role") f.options.expectedRole = "exec_test_migrator";
      if (kind === "shared database") f.options.expectedDatabase = "shared_database";
      if (kind === "trailing LF") f.options.expectedDatabase += "\n";
      expect(await f.run()).toEqual({ ready: false,
        diagnostics: [{ category: "runtime", reason: "TRANSACTION_IDENTITY_OR_MODE_INVALID" }] });
      expect(f.query).not.toHaveBeenCalled();
    },
  );

  it.each(["check", "apply"] as const)("retains %s expectations when the caller mutates options in flight", async mode => {
    const f = fixture(mode);
    const query: ExecutiveReadinessQuery = async (sql, values) => {
      Object.assign(f.options, { mode: mode === "check" ? "apply" : "check",
        expectedDatabase: "msf_exec_m12_replaced", expectedRole: "exec_test_migrator" });
      return (f.query as ExecutiveReadinessQuery)(sql, values);
    };
    expect(await checkExecutiveReadiness(query, f.options)).toEqual({ ready: true, diagnostics: [] });
  });

  it.each([NaN, Infinity, 1.5, 0, -1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid successful migration step count %s", async count => {
      const f = fixture();
      f.history[0].applied_steps_count = count;
      expect(await f.run()).toEqual({ ready: false,
        diagnostics: [{ category: "migration", reason: "REQUIRED_MIGRATION_INVALID" }] });
    },
  );
});
