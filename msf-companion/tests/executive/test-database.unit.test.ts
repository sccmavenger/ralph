import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import executiveConfig from "../../vitest.executive.config";
import {
  connectTestDatabase, createIsolatedTestDatabase, createTestPrisma,
  validateTestDatabaseUrl, validateTestEnvironment, type TestEnvironment,
} from "./test-database";

const database = "msf_exec_m12_12345_1";
const valid: TestEnvironment = {
  NODE_ENV: "test",
  EXECUTIVE_TEST_DATABASE_CONFIRM: database,
  EXECUTIVE_TEST_DATABASE_URL: `postgresql://exec_test_app:synthetic-only@127.0.0.1:55432/${database}`,
  EXECUTIVE_TEST_MIGRATION_DATABASE_URL: `postgresql://exec_test_migrator:synthetic-only@127.0.0.1:55432/${database}`,
};
const appUrl = valid.EXECUTIVE_TEST_DATABASE_URL!;

afterEach(() => vi.restoreAllMocks());

describe("DB-14 fail-closed disposable URL boundary (no connection)", () => {
  it("accepts only the explicit named app/migrator target and exact confirmation", () => {
    expect(validateTestEnvironment(valid)).toEqual({
      appUrl, migrationUrl: valid.EXECUTIVE_TEST_MIGRATION_DATABASE_URL, database,
    });
    expect(validateTestDatabaseUrl(appUrl.replace("postgresql:", "postgres:"), "app", valid)).toMatch(/^postgres:/);
  });

  const invalidUrls: [string, string | undefined][] = [
    ["missing", undefined], ["empty", ""], ["malformed", "not-a-url"],
    ["wrong protocol", appUrl.replace("postgresql:", "https:")],
    ["DNS localhost", appUrl.replace("127.0.0.1", "localhost")],
    ["remote host", appUrl.replace("127.0.0.1", "example.invalid")],
    ["Azure host", appUrl.replace("127.0.0.1", "example.postgres.database.azure.com")],
    ["IPv6 loopback", appUrl.replace("127.0.0.1", "[::1]")],
    ["short loopback", appUrl.replace("127.0.0.1", "127.1")],
    ["hex loopback", appUrl.replace("127.0.0.1", "0x7f000001")],
    ["octal loopback", appUrl.replace("127.0.0.1", "0177.0.0.1")],
    ["encoded host", appUrl.replace("127.0.0.1", "%31%32%37.0.0.1")],
    ["wrong port", appUrl.replace(":55432/", ":5432/")],
    ["missing port", appUrl.replace(":55432/", "/")],
    ["wrong role", appUrl.replace("exec_test_app:", "postgres:")],
    ["migrator in app slot", appUrl.replace("exec_test_app:", "exec_test_migrator:")],
    ["encoded role", appUrl.replace("exec_test_app:", "%65xec_test_app:")],
    ["missing password", appUrl.replace(":synthetic-only@", "@")],
    ["empty password", appUrl.replace(":synthetic-only@", ":@")],
    ["blank password", appUrl.replace("synthetic-only", "%20")],
    ["control password", appUrl.replace("synthetic-only", "%00")],
    ["malformed escape", appUrl.replace("synthetic-only", "%zz")],
    ["unowned database", appUrl.replace(database, "production")],
    ["prefix only", appUrl.replace(database, "msf_exec_m12_")],
    ["encoded database", appUrl.replace(database, "msf_exec_m12_%31")],
    ["database traversal", appUrl.replace(database, `${database}/../production`)],
    ["uppercase database", appUrl.replace(database, "msf_exec_m12_RUN")],
    ["overlong database", appUrl.replace(database, `msf_exec_m12_${"a".repeat(51)}`)],
    ["query host override", `${appUrl}?host=example.invalid`],
    ["query socket override", `${appUrl}?host=/tmp`],
    ["query options", `${appUrl}?options=-c%20search_path=other`],
    ["query ssl", `${appUrl}?sslmode=require`],
    ["fragment", `${appUrl}#anything`],
    ["trailing whitespace", `${appUrl} `],
    ["trailing newline", `${appUrl}\n`],
  ];

  it.each(invalidUrls)("rejects %s before pg or Prisma can connect", async (_, value) => {
    const connect = vi.spyOn(Client.prototype, "connect");
    const env = { ...valid, EXECUTIVE_TEST_DATABASE_URL: value };
    await expect(connectTestDatabase("app", env)).rejects.toThrow();
    await expect(connectTestDatabase("migrator", env)).rejects.toThrow();
    await expect(createTestPrisma(env)).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    { NODE_ENV: undefined }, { NODE_ENV: "production" },
    { EXECUTIVE_TEST_DATABASE_CONFIRM: undefined },
    { EXECUTIVE_TEST_DATABASE_CONFIRM: "msf_exec_m12_another_run" },
    { EXECUTIVE_TEST_MIGRATION_DATABASE_URL: undefined },
    { EXECUTIVE_TEST_MIGRATION_DATABASE_URL: appUrl },
    { EXECUTIVE_TEST_MIGRATION_DATABASE_URL: valid.EXECUTIVE_TEST_MIGRATION_DATABASE_URL!.replace(database, "msf_exec_m12_another_run") },
  ])("rejects incomplete/cross-target environment %# before connection", async (patch) => {
    const connect = vi.spyOn(Client.prototype, "connect");
    await expect(connectTestDatabase("app", { ...valid, ...patch })).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });

  it("does not fall back to DATABASE_URL or leak a supplied credential in errors", async () => {
    const connect = vi.spyOn(Client.prototype, "connect");
    const env = { NODE_ENV: "test", DATABASE_URL: appUrl };
    await expect(connectTestDatabase("app", env)).rejects.toThrow("Explicit Executive test database URL");
    try { validateTestDatabaseUrl(appUrl.replace("127.0.0.1", "remote.invalid"), "app", valid); }
    catch (error) { expect(String(error)).not.toContain("synthetic-only"); }
    expect(connect).not.toHaveBeenCalled();
  });

  it.each(["../other", "foo;DROP", "", "UPPER", "x".repeat(25)])("rejects unsafe child name %s without connection", async (suffix) => {
    const connect = vi.spyOn(Client.prototype, "connect");
    await expect(createIsolatedTestDatabase(suffix, valid)).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });
});

describe("DB-14 discovery and configuration isolation", () => {
  it("normal web configuration explicitly excludes all Executive tests", async () => {
    // Load at runtime: the existing web config is deliberately excluded from
    // application tsc. A static import would pull its legacy poolOptions back in.
    const { default: normalConfig } = await import(new URL("../../vitest.config.ts", import.meta.url).href);
    expect(normalConfig.test?.exclude).toContain("tests/executive/**");
  });

  it("dedicated discovery cannot include wallet/functions/browser setup", () => {
    expect(executiveConfig.envDir).toBe(false);
    expect(executiveConfig.test?.include).toEqual(["tests/executive/**/*.test.ts"]);
    expect(executiveConfig.test?.setupFiles).toBeUndefined();
    expect(executiveConfig.test?.globalSetup).toBeUndefined();
    expect(executiveConfig.test?.environment).toBe("node");
    expect(executiveConfig.test?.maxWorkers).toBe(1);
    expect(executiveConfig.test?.fileParallelism).toBe(false);
  });

  it("test datasource explicitly validates environment and imports no live configuration", async () => {
    const config = await readFile(new URL("../../prisma.executive-test.config.ts", import.meta.url), "utf8");
    const harness = await readFile(new URL("./test-database.ts", import.meta.url), "utf8");
    expect(config).toContain("validateTestEnvironment(process.env)");
    expect(config).toContain("url: target.migrationUrl");
    for (const source of [config, harness]) {
      expect(source).not.toMatch(/import\s+["']dotenv/);
      expect(source).not.toMatch(/from\s+["'][^"']*(?:src\/lib\/prisma|prisma\.config|playwright|cleanup)["']/);
      expect(source).not.toMatch(/process\.env(?:\.DATABASE_URL|\[["']DATABASE_URL["']\])/);
    }
  });
});
