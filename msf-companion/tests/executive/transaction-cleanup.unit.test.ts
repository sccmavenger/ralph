import { Client } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTestTransaction, type TestEnvironment } from "./test-database";

const database = "msf_exec_m12_transaction_cleanup";
const env: TestEnvironment = {
  NODE_ENV: "test",
  EXECUTIVE_TEST_DATABASE_CONFIRM: database,
  EXECUTIVE_TEST_DATABASE_URL: `postgresql://exec_test_app:synthetic-only@127.0.0.1:55432/${database}`,
  EXECUTIVE_TEST_MIGRATION_DATABASE_URL: `postgresql://exec_test_migrator:synthetic-only@127.0.0.1:55432/${database}`,
};

afterEach(() => vi.restoreAllMocks());

describe("disposable transaction cleanup (mocked client, no database)", () => {
  function mockClient(failAt?: string) {
    const calls: string[] = [];
    vi.spyOn(Client.prototype, "connect").mockImplementation(async () => {
      calls.push("CONNECT");
    });
    // pg's query overloads include callback forms; this harness uses promises.
    vi.spyOn(Client.prototype, "query").mockImplementation((async (sql: string) => {
      calls.push(sql);
      if (sql === failAt) throw new Error(`${sql} failed`);
      return { rows: [], rowCount: 0, command: sql, oid: 0, fields: [] };
    }) as Client["query"]);
    vi.spyOn(Client.prototype, "end").mockImplementation(async () => {
      calls.push("END");
    });
    return calls;
  }

  it("rolls back successful fixture work before closing and returning its result", async () => {
    const calls = mockClient();
    const result = await withTestTransaction(async (client) => {
      await client.query("fixture work");
      return "fixture result";
    }, "app", env);

    expect(result).toBe("fixture result");
    expect(calls).toEqual(["CONNECT", "BEGIN", "fixture work", "ROLLBACK", "END"]);
  });

  it("rolls back and closes before propagating a fixture failure", async () => {
    const calls = mockClient();
    const failure = new Error("fixture failed");
    await expect(withTestTransaction(async () => {
      calls.push("fixture work");
      throw failure;
    }, "app", env)).rejects.toBe(failure);

    expect(calls).toEqual(["CONNECT", "BEGIN", "fixture work", "ROLLBACK", "END"]);
  });

  it("closes even when rollback fails", async () => {
    const calls = mockClient("ROLLBACK");
    await expect(withTestTransaction(async () => "result", "app", env))
      .rejects.toThrow("ROLLBACK failed");

    expect(calls).toEqual(["CONNECT", "BEGIN", "ROLLBACK", "END"]);
  });

  it("skips fixture work and cleans up when BEGIN fails", async () => {
    const calls = mockClient("BEGIN");
    const operation = vi.fn(async () => "result");
    await expect(withTestTransaction(operation, "app", env)).rejects.toThrow("BEGIN failed");

    expect(operation).not.toHaveBeenCalled();
    expect(calls).toEqual(["CONNECT", "BEGIN", "ROLLBACK", "END"]);
  });
});
