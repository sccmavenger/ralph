import { afterEach, describe, expect, it, vi } from "vitest";
import { createIsolatedTestDatabase, type TestEnvironment } from "./test-database";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => {}),
  query: vi.fn(async (_sql: string) => ({ rows: [] })),
  end: vi.fn(async () => {}),
}));

vi.mock("pg", () => ({
  Client: class {
    connect = mocks.connect;
    query = mocks.query;
    end = mocks.end;
  },
}));

const database = "msf_exec_m12_child_creation";
const env: TestEnvironment = {
  NODE_ENV: "test",
  EXECUTIVE_TEST_DATABASE_CONFIRM: database,
  EXECUTIVE_TEST_DATABASE_URL: `postgresql://exec_test_app:synthetic%3Aonly@127.0.0.1:55432/${database}`,
  EXECUTIVE_TEST_MIGRATION_DATABASE_URL: `postgresql://exec_test_migrator:synthetic%3Aonly@127.0.0.1:55432/${database}`,
};

afterEach(() => vi.resetAllMocks());

describe("disposable child database creation (mocked pg, no database)", () => {
  it("returns separately confirmed child URLs without mutating the parent environment", async () => {
    const parent = Object.freeze({ ...env });
    const child = await createIsolatedTestDatabase("recovery", parent);

    expect(child).toEqual({
      ...env,
      EXECUTIVE_TEST_DATABASE_CONFIRM: `${database}_recovery`,
      EXECUTIVE_TEST_DATABASE_URL: `${env.EXECUTIVE_TEST_DATABASE_URL}_recovery`,
      EXECUTIVE_TEST_MIGRATION_DATABASE_URL: `${env.EXECUTIVE_TEST_MIGRATION_DATABASE_URL}_recovery`,
    });
    expect(parent).toEqual(env);
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith(
      `CREATE DATABASE "${database}_recovery" OWNER exec_test_migrator`,
    );
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(mocks.connect.mock.invocationCallOrder[0]).toBeLessThan(mocks.query.mock.invocationCallOrder[0]);
    expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.end.mock.invocationCallOrder[0]);
  });

  it("rejects a valid suffix whose combined child name exceeds the target limit before connecting", async () => {
    const longDatabase = `msf_exec_m12_${"a".repeat(50)}`;
    const parent = {
      ...env,
      EXECUTIVE_TEST_DATABASE_CONFIRM: longDatabase,
      EXECUTIVE_TEST_DATABASE_URL: env.EXECUTIVE_TEST_DATABASE_URL!.replace(database, longDatabase),
      EXECUTIVE_TEST_MIGRATION_DATABASE_URL: env.EXECUTIVE_TEST_MIGRATION_DATABASE_URL!.replace(database, longDatabase),
    };

    await expect(createIsolatedTestDatabase("x", parent)).rejects.toThrow("fixed loopback target");
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.end).not.toHaveBeenCalled();
  });

  it("rejects mismatched parent confirmation before creating a child", async () => {
    await expect(createIsolatedTestDatabase("recovery", {
      ...env, EXECUTIVE_TEST_DATABASE_CONFIRM: `${database}_other`,
    })).rejects.toThrow("confirmation must exactly match");
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("closes the client and propagates a creation failure without retry or repair", async () => {
    const failure = new Error("synthetic CREATE DATABASE failure");
    mocks.query.mockRejectedValueOnce(failure);

    await expect(createIsolatedTestDatabase("recovery", env)).rejects.toBe(failure);
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledOnce();
    expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.end.mock.invocationCallOrder[0]);
  });

  it("closes a failed connection without issuing CREATE DATABASE", async () => {
    const failure = new Error("synthetic connection failure");
    mocks.connect.mockRejectedValueOnce(failure);

    await expect(createIsolatedTestDatabase("recovery", env)).rejects.toBe(failure);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.end).toHaveBeenCalledOnce();
  });
});
