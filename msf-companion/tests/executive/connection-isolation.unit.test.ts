import { afterEach, describe, expect, it, vi } from "vitest";
import { connectTestDatabase, createTestPrisma, type TestEnvironment } from "./test-database";

const mocks = vi.hoisted(() => ({
  configuration: vi.fn(),
  connect: vi.fn(async () => {}),
  end: vi.fn(async () => {}),
}));

vi.mock("pg", () => ({
  Client: class {
    constructor(configuration: unknown) { mocks.configuration(configuration); }
    connect = mocks.connect;
    end = mocks.end;
  },
}));

const database = "msf_exec_m12_connection_isolation";
const env: TestEnvironment = {
  NODE_ENV: "test",
  EXECUTIVE_TEST_DATABASE_CONFIRM: database,
  EXECUTIVE_TEST_DATABASE_URL: `postgresql://exec_test_app:synthetic%3Aonly@127.0.0.1:55432/${database}`,
  EXECUTIVE_TEST_MIGRATION_DATABASE_URL: `postgresql://exec_test_migrator:synthetic%3Aonly@127.0.0.1:55432/${database}`,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("disposable connection configuration (mocked pg, no database)", () => {
  it.each([
    ["missing", undefined],
    ["remote host", env.EXECUTIVE_TEST_MIGRATION_DATABASE_URL!.replace("127.0.0.1", "remote.invalid")],
    ["wrong role", env.EXECUTIVE_TEST_MIGRATION_DATABASE_URL!.replace("exec_test_migrator", "exec_test_app")],
    ["different database", env.EXECUTIVE_TEST_MIGRATION_DATABASE_URL!.replace(database, `${database}_other`)],
    ["host override", `${env.EXECUTIVE_TEST_MIGRATION_DATABASE_URL}?host=remote.invalid`],
  ])("rejects a %s migrator URL before constructing any client", async (_, migrationUrl) => {
    // A valid app URL must not bypass validation of the other required role.
    const invalid = { ...env, EXECUTIVE_TEST_MIGRATION_DATABASE_URL: migrationUrl };
    for (const role of ["app", "migrator"] as const) {
      await expect(connectTestDatabase(role, invalid)).rejects.toThrow();
      await expect(createTestPrisma(invalid, role)).rejects.toThrow();
    }
    expect(mocks.configuration).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.end).not.toHaveBeenCalled();
  });

  it.each(["app", "migrator"] as const)("pins the %s connection despite ambient PostgreSQL settings", async (role) => {
    for (const [key, value] of Object.entries({
      PGHOST: "remote.invalid", PGPORT: "5432", PGDATABASE: "shared",
      PGUSER: "postgres", PGPASSWORD: "ambient-synthetic-only",
      PGSSLMODE: "require", PGOPTIONS: "-c search_path=other",
      DATABASE_URL: "postgresql://postgres:synthetic-only@remote.invalid/shared",
    })) vi.stubEnv(key, value);

    const client = await connectTestDatabase(role, env);
    try {
      expect(mocks.configuration).toHaveBeenCalledExactlyOnceWith({
        host: "127.0.0.1",
        port: 55432,
        database,
        user: role === "app" ? "exec_test_app" : "exec_test_migrator",
        password: "synthetic:only",
        ssl: false,
        connectionTimeoutMillis: 5_000,
        statement_timeout: 15_000,
        query_timeout: 20_000,
        options: "-c lock_timeout=5000",
        application_name: "msf-m12-disposable-tests",
      });
      expect(mocks.connect).toHaveBeenCalledOnce();
    } finally {
      await client.end();
    }
    expect(mocks.end).toHaveBeenCalledOnce();
  });
});
