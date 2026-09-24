import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { Client, Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertUnicode, canonicalHash, canonicalJson, decodeUtf8, exactObject, parseStrictJson, sha256,
} from "../../src/lib/executive/canonical";
import {
  bootstrapConnection, parseBootstrapArguments, readBoundedFile, readPrivateJson, validateBootstrapInput, validateBootstrapTarget,
} from "../../src/lib/executive/bootstrap-config";

const filesystem = vi.hoisted(() => ({ open: vi.fn(), lstat: vi.fn() }));
vi.mock("node:fs/promises", () => filesystem);

const database = "msf_exec_m12_12345_1";
const target = {
  targetVersion: 1, environment: "disposable", host: "127.0.0.1", port: 55432,
  database, role: "exec_test_app", tls: "disabled", runId: "12345-1",
};
const url = `postgresql://exec_test_app:synthetic-only@127.0.0.1:55432/${database}`;
const environment = {
  NODE_ENV: "test", EXECUTIVE_BOOTSTRAP_DATABASE_URL: url,
  EXECUTIVE_BOOTSTRAP_DATABASE_CONFIRM: database,
};
const input = { inputVersion: 1, owner: { displayName: "Synthetic Owner Ω", contactEmail: null } };
const checkArgs = ["--check", "--input", "/private/owner.json", "--source-file", "/private/source.docx", "--target", "/private/target.json"];

beforeEach(() => {
  filesystem.open.mockReset();
  filesystem.lstat.mockReset();
  vi.spyOn(Client.prototype, "connect").mockImplementation(() => { throw new Error("UNEXPECTED_DATABASE_CONNECTION"); });
  vi.spyOn(Pool.prototype, "connect").mockImplementation(() => { throw new Error("UNEXPECTED_DATABASE_CONNECTION"); });
});
afterEach(() => {
  expect(Client.prototype.connect).not.toHaveBeenCalled();
  expect(Pool.prototype.connect).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("BOOT-01 bounded private-file reads (mock filesystem; no real source access)", () => {
  function mockFile(content: Buffer, chunkSize = content.length) {
    const stat = { size: content.length, dev: 1, ino: 17, mtimeMs: 1000, ctimeMs: 1000, isFile: () => true };
    let position = 0;
    const handle = {
      stat: vi.fn().mockResolvedValue(stat),
      read: vi.fn(async (buffer: Buffer, offset: number, length: number) => {
        const bytesRead = Math.min(length, chunkSize, content.length - position);
        content.copy(buffer, offset, position, position + bytesRead);
        position += bytesRead;
        return { bytesRead, buffer };
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    filesystem.lstat.mockResolvedValue(stat);
    filesystem.open.mockResolvedValue(handle);
    return { handle, stat };
  }

  it("reads partial chunks from one handle and closes it; Linux open forbids following links/blocking devices", async () => {
    const content = Buffer.from('{"owner":"Synthetic Ω"}');
    const { handle } = mockFile(content, 3);
    expect(await readBoundedFile("/private/synthetic.json", content.length)).toEqual(content);
    expect(filesystem.open).toHaveBeenCalledTimes(1);
    expect(handle.read.mock.calls.length).toBeGreaterThan(1);
    expect(handle.stat).toHaveBeenCalledTimes(2);
    expect(handle.close).toHaveBeenCalledTimes(1);
    const flags = filesystem.open.mock.calls[0][1];
    expect(flags).toBe(process.platform === "win32" ? constants.O_RDONLY
      : constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  });

  it.each(["symlink", "directory", "fifo", "device", "empty", "oversized"])(
    "rejects %s before opening", async (kind) => {
      filesystem.lstat.mockResolvedValue({ isFile: () => kind === "empty" || kind === "oversized",
        size: kind === "empty" ? 0 : 17 });
      await expect(readBoundedFile("/private/synthetic.json", 16)).rejects.toThrow("INVALID_FILE");
      expect(filesystem.open).not.toHaveBeenCalled();
    },
  );

  it.each(["dev", "ino", "size", "mtimeMs", "ctimeMs"])("rejects pre-open identity race: %s", async (field) => {
    const { handle, stat } = mockFile(Buffer.from("valid"));
    handle.stat.mockResolvedValueOnce({ ...stat, [field]: 999 });
    await expect(readBoundedFile("/private/synthetic.json", 16)).rejects.toThrow("INVALID_FILE");
    expect(handle.read).not.toHaveBeenCalled();
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it.each(["size", "mtimeMs", "ctimeMs"])("rejects mutation during read: %s", async (field) => {
    const { handle, stat } = mockFile(Buffer.from("valid"));
    handle.stat.mockResolvedValueOnce(stat).mockResolvedValueOnce({ ...stat, [field]: 999 });
    await expect(readBoundedFile("/private/synthetic.json", 16)).rejects.toThrow("INVALID_FILE");
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it("closes on read/stat errors without opening another handle", async () => {
    const { handle } = mockFile(Buffer.from("valid"));
    handle.read.mockRejectedValueOnce(new Error("synthetic read error"));
    await expect(readBoundedFile("/private/synthetic.json", 16)).rejects.toThrow("synthetic read error");
    expect(handle.close).toHaveBeenCalledTimes(1);
    expect(filesystem.open).toHaveBeenCalledTimes(1);
  });

  it("rejects a truncated file and a stream that grows past its initial bounded size", async () => {
    const first = mockFile(Buffer.from("valid"));
    first.handle.read.mockResolvedValueOnce({ bytesRead: 0, buffer: Buffer.alloc(0) });
    await expect(readBoundedFile("/private/synthetic.json", 16)).rejects.toThrow("INVALID_FILE");
    expect(first.handle.close).toHaveBeenCalledTimes(1);
    const second = mockFile(Buffer.from("123456"));
    const initial = { ...second.stat, size: 5 };
    filesystem.lstat.mockResolvedValue(initial);
    second.handle.stat.mockResolvedValue(initial);
    await expect(readBoundedFile("/private/synthetic.json", 5)).rejects.toThrow("INVALID_FILE");
    expect(second.handle.close).toHaveBeenCalledTimes(1);
  });

  it("enforces private JSON size/UTF-8/duplicate-key rules before any database work", async () => {
    mockFile(Buffer.from('{"a":1,"\\u0061":2}'));
    await expect(readPrivateJson("/private/synthetic.json")).rejects.toThrow();
    mockFile(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]));
    await expect(readPrivateJson("/private/synthetic.json")).rejects.toThrow();
    mockFile(Buffer.from(" ".repeat(16 * 1024 + 1)));
    await expect(readPrivateJson("/private/synthetic.json")).rejects.toThrow("INVALID_FILE");
    mockFile(Buffer.from('{"safe":true}'));
    expect(await readPrivateJson("/private/synthetic.json")).toEqual({ safe: true });
  });
});

describe("BOOT-02 independent restricted canonical vectors", () => {
  it("matches independently specified canonical bytes and standard SHA-256", () => {
    const value = { z: 'line\nquote" slash\\ end', b: 2, a: [true, null, "Ω 🚀"] };
    const expected = '{"a":[true,null,"Ω 🚀"],"b":2,"z":"line\\nquote\\" slash\\\\ end"}';
    expect(canonicalJson(value)).toBe(expected);
    expect(canonicalHash(value)).toBe(createHash("sha256").update(expected, "utf8").digest("hex"));
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(Buffer.from(canonicalJson(value)).at(-1)).not.toBe(10);
  });

  it("sorts nested ASCII keys and ignores input JSON formatting, never array order or Unicode normalization", () => {
    expect(canonicalHash(parseStrictJson(' { "z": { "b":2,"a":1 }, "a": [] } ')))
      .toBe(canonicalHash(parseStrictJson('{"a":[],"z":{"a":1,"b":2}}')));
    expect(canonicalHash(["a", "b"])).not.toBe(canonicalHash(["b", "a"]));
    expect(canonicalHash("Owner")).not.toBe(canonicalHash("owner"));
    expect(canonicalHash("é")).not.toBe(canonicalHash("e\u0301"));
    expect(canonicalJson({ "\\": 1, A: 2, a: 3, "!": 4 })).toBe('{"!":4,"A":2,"\\\\":1,"a":3}');
  });

  it.each([NaN, Infinity, -Infinity, -0, 1.5, Number.MAX_SAFE_INTEGER + 1,
    undefined, BigInt(1), Symbol("value"), new Date(0), new Map(), new Set(), new Uint8Array([1])])(
    "rejects unsupported canonical value %#", (value) => { expect(() => canonicalJson(value)).toThrow(); },
  );

  it("rejects symbol/nonenumerable/accessor keys and sparse/extended arrays", () => {
    expect(() => canonicalJson({ [Symbol("hidden")]: 1 })).toThrow();
    expect(() => canonicalJson(Object.defineProperty({}, "hidden", { value: 1 }))).toThrow();
    const accessor = vi.fn(() => 1);
    expect(() => canonicalJson(Object.defineProperty({}, "a", { get: accessor, enumerable: true }))).toThrow();
    expect(accessor).not.toHaveBeenCalled();
    expect(() => canonicalJson(Array(2))).toThrow();
    const sparseWithExtra = Object.assign(Array(2), { 0: 1, extra: 2 });
    expect(() => canonicalJson(sparseWithExtra)).toThrow();
    expect(() => canonicalJson(Object.assign([1], { extra: 2 }))).toThrow();
    expect(() => canonicalJson({ "Ω": "non-ASCII schema key" })).toThrow();
  });

  it("bounds recursion and rejects unpaired surrogates without normalizing valid Unicode", () => {
    let deep: unknown = 1;
    for (let index = 0; index < 66; index++) deep = [deep];
    expect(() => canonicalJson(deep)).toThrow();
    expect(() => parseStrictJson("[".repeat(66) + "0" + "]".repeat(66))).toThrow();
    for (const value of ["\ud800", "\udfff", "a\ud800b", "\udc00\ud800"]) {
      expect(() => assertUnicode(value)).toThrow();
      expect(() => canonicalJson(value)).toThrow();
    }
    expect(() => assertUnicode("Ω 🚀 e\u0301")).not.toThrow();
  });
});

describe("BOOT-01/02 strict UTF-8 and JSON", () => {
  it.each([
    '{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"x":{"a":1,"a":2}}',
    '{"a":[{"x":1,"\\u0078":2}]}', '{"a":1,}', "[1,]", "[1,,2]", "00", "01", "-01", "+1",
    "NaN", "Infinity", "1e999", "true false", "{}{}", "undefined", '{a:1}', '{"a":}',
    '"unterminated', '"\\q"', '"\\uZZZZ"', '"raw\nnewline"', '"\\ud800"', '"\\udfff"',
    '{"\\ud800":1}', "\ufeff{}", "\u00a0{}", "/*comment*/{}", "",
  ])("rejects malformed, duplicate or non-Unicode JSON %#", (text) => { expect(() => parseStrictJson(text)).toThrow(); });

  it("preserves safe __proto__ keys as own data and accepts genuine JSON escape sequences", () => {
    const parsed = parseStrictJson('{"__proto__":{"polluted":true},"escape":"\\\" \\\\ \\t \\uD83D\\uDE80"}') as Record<string, unknown>;
    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(Object.hasOwn(parsed, "__proto__")).toBe(true);
    expect(parsed.escape).toBe('" \\ \t 🚀');
    expect(Object.hasOwn({}, "polluted")).toBe(false);
    expect(parseStrictJson(" \r\n\t[true,false,null,-1,1.5,1e2]\t")).toEqual([true, false, null, -1, 1.5, 100]);
  });

  it.each([[0xef, 0xbb, 0xbf, 0x7b, 0x7d], [0xff], [0xc0, 0xaf], [0xe2, 0x82], [0xed, 0xa0, 0x80]])(
    "rejects BOM/malformed UTF-8 %#", (...bytes) => { expect(() => decodeUtf8(Uint8Array.from(bytes))).toThrow(); },
  );
  it("round-trips non-ASCII text and refuses missing/extra schema fields", () => {
    expect(decodeUtf8(Buffer.from("资源 Ω 🚀\n"))).toBe("资源 Ω 🚀\n");
    expect(exactObject({ a: null }, ["a"])).toEqual({ a: null });
    for (const value of [null, [], true, "a", {}, { a: 1, b: 2 }]) expect(() => exactObject(value, ["a"])).toThrow();
  });
});

describe("BOOT-01 closed operator arguments and Owner metadata", () => {
  it("accepts pure help, exactly one mode and explicit private paths", () => {
    expect(parseBootstrapArguments(["--help"])).toEqual({ help: true });
    expect(parseBootstrapArguments(checkArgs)).toEqual({ help: false, mode: "check", inputPath: "/private/owner.json",
      sourcePath: "/private/source.docx", targetPath: "/private/target.json", confirmTarget: undefined });
    expect(parseBootstrapArguments(["--apply", ...checkArgs.slice(1), "--confirm-target", database]))
      .toMatchObject({ mode: "apply", confirmTarget: database });
  });
  it.each([
    [], ["--help", "--check"], [...checkArgs, "--help"], [...checkArgs, "--check"], [...checkArgs, "--apply"],
    [...checkArgs, "--force"], [...checkArgs, "--repair"], [...checkArgs, "--skip-provenance"],
    [...checkArgs, "--source-policy", "synthetic"], [...checkArgs, "--input", "another.json"],
    [...checkArgs, "--confirm-target", database], ["--apply", ...checkArgs.slice(1)],
    checkArgs.slice(0, -1), ["--check", "--input", "--source-file", "x", "--target", "y"],
    ["--check", "--input", "", ...checkArgs.slice(3)], ["--check", "--input", " ", ...checkArgs.slice(3)],
    ["--check", "--input", "a\nb", ...checkArgs.slice(3)], ["--check", "--input", "\ud800", ...checkArgs.slice(3)],
    ["--input=owner.json", ...checkArgs], ["positional", ...checkArgs],
  ].map((args) => ({ args })))("rejects ambiguous/unsupported argv %#", ({ args }) => {
    expect(() => parseBootstrapArguments(args)).toThrow();
  });

  it("preserves Unicode display text and email case, with an explicit null contact", () => {
    expect(validateBootstrapInput(input)).toEqual(input);
    const mailbox = { ...input, owner: { displayName: "🚀".repeat(200), contactEmail: "Owner+test@Example.INVALID" } };
    expect(validateBootstrapInput(mailbox)).toEqual(mailbox);
    expect(validateBootstrapInput({ ...input, owner: { displayName: "e\u0301", contactEmail: null } }).owner.displayName).toBe("e\u0301");
  });

  it.each(["", " ", " Owner", "Owner ", "a\nb", "a\tb", "a\u0000b", "a\u200bb", "\ud800", "🚀".repeat(201)])(
    "rejects invalid display metadata %#", (displayName) => {
      expect(() => validateBootstrapInput({ ...input, owner: { ...input.owner, displayName } })).toThrow();
    },
  );
  it.each(["", " Owner@example.invalid", "Owner@example.invalid ", "Owner <a@example.invalid>", "a@example.invalid,b@example.invalid",
    "a\n@example.invalid", "a@localhost", "a..b@example.invalid", ".a@example.invalid", "a.@example.invalid", "a@-example.invalid",
    "a@example-.invalid", "Ω@example.invalid", "a@例子.invalid", "a".repeat(321) + "@example.invalid", 7, false])(
    "rejects invalid contact metadata %#", (contactEmail) => {
      expect(() => validateBootstrapInput({ ...input, owner: { ...input.owner, contactEmail } })).toThrow();
    },
  );
  it.each([{}, { ...input, inputVersion: 2 }, { ...input, inputVersion: "1" }, { ...input, authority: true },
    { ...input, owner: { displayName: "Synthetic" } }, { ...input, owner: { ...input.owner, credential: "forbidden" } }])(
    "rejects missing/extra/wrong-version Owner schema %#", (value) => { expect(() => validateBootstrapInput(value)).toThrow(); },
  );
});

describe("BOOT-01 explicit disposable target and no fallback/no connection", () => {
  it("actual pg Client construction cannot inherit poisoned startup settings (without connecting)", () => {
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
    vi.stubEnv("PGBINARY", undefined);
    const poisoned = {
      PGHOST: "production.invalid", PGPORT: "5432", PGUSER: "postgres", PGPASSWORD: "forbidden",
      PGDATABASE: "production", PGOPTIONS: "-c search_path=untrusted -c session_replication_role=replica",
      PGCLIENT_ENCODING: "SQL_ASCII", PGREPLICATION: "database", PGSSLMODE: "require",
      PGAPPNAME: "untrusted", PGCONNECT_TIMEOUT: "0",
    };
    for (const [key, value] of Object.entries(poisoned)) vi.stubEnv(key, value);
    // Exercise the production/default environment path, not just a supplied test object.
    const config = bootstrapConnection(validateBootstrapTarget(target), "check", undefined);
    const client = new Client(config) as Client & { connectionParameters: Record<string, unknown> };
    expect(client.connectionParameters).toMatchObject({ host: "127.0.0.1", port: 55432,
      user: "exec_test_app", database, password: "synthetic-only", ssl: false,
      options: "-c search_path=pg_catalog", client_encoding: "UTF8", replication: "false",
      application_name: "msf-executive-bootstrap-v1", connect_timeout: 5,
      statement_timeout: 10000, lock_timeout: 5000, idle_in_transaction_session_timeout: 15000,
    });
    expect(client.connectionParameters.binary).not.toBeTruthy();
  });

  it.each(["1", "true", "false", "0"])("refuses PGBINARY=%s through both default and explicit environment paths", (value) => {
    for (const [key, setting] of Object.entries(environment)) vi.stubEnv(key, setting);
    vi.stubEnv("PGBINARY", value);
    expect(() => bootstrapConnection(validateBootstrapTarget(target), "check", undefined)).toThrow("INVALID_TARGET");
    expect(() => bootstrapConnection(validateBootstrapTarget(target), "check", undefined,
      { ...environment, PGBINARY: value })).toThrow("INVALID_TARGET");
  });

  it("returns only explicit bounded adapter options and ignores poisoned application/libpq values", () => {
    const validated = validateBootstrapTarget(target);
    const config = bootstrapConnection(validated, "apply", database, { ...environment, DATABASE_URL: "forbidden",
      PGHOST: "production.invalid", PGPORT: "5432", PGUSER: "postgres", PGPASSWORD: "forbidden", PGDATABASE: "production" });
    expect(config).toMatchObject({ host: "127.0.0.1", port: 55432, user: "exec_test_app", password: "synthetic-only",
      database, ssl: false, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10000,
      query_timeout: 20000, lock_timeout: 5000, idle_in_transaction_session_timeout: 15000 });
    expect(config).not.toHaveProperty("connectionString");
    expect(bootstrapConnection(validated, "check", undefined, { ...environment,
      EXECUTIVE_BOOTSTRAP_DATABASE_URL: url.replace("synthetic-only", "synthetic%40password%3Avalue") }).password)
      .toBe("synthetic@password:value");
  });

  it.each([
    { targetVersion: 2 }, { targetVersion: "1" }, { environment: "production" }, { host: "localhost" },
    { host: "127.1" }, { host: "[::1]" }, { host: "example.invalid" }, { port: 5432 }, { port: "55432" },
    { role: "exec_test_migrator" }, { role: "postgres" }, { tls: "required" }, { database: "production" },
    { database: "msf_exec_m12_" }, { database: "msf_exec_m12_RUN" }, { database: `${database}\n` },
    { database: `msf_exec_m12_${"a".repeat(51)}` }, { runId: "" }, { runId: "a/b" }, { runId: "123\n" },
    { runId: "a".repeat(101) }, { override: true },
  ])("rejects target manifest mismatch %#", (patch) => { expect(() => validateBootstrapTarget({ ...target, ...patch })).toThrow(); });

  it.each([
    undefined, "", "not-a-url", url.replace("postgresql:", "https:"), url.replace("127.0.0.1", "localhost"),
    url.replace("127.0.0.1", "127.1"), url.replace("127.0.0.1", "0x7f000001"), url.replace("127.0.0.1", "0177.0.0.1"),
    url.replace("127.0.0.1", "[::1]"), url.replace("127.0.0.1", "example.postgres.database.azure.com"),
    url.replace("127.0.0.1", "%31%32%37.0.0.1"), url.replace(":55432/", ":5432/"),
    url.replace("exec_test_app:", "exec_test_migrator:"), url.replace("exec_test_app:", "%65xec_test_app:"),
    url.replace(":synthetic-only@", "@"), url.replace("synthetic-only", ""), url.replace("synthetic-only", "%20"),
    url.replace("synthetic-only", "%00"), url.replace("synthetic-only", "%zz"), url.replace(database, "production"),
    url.replace(database, "msf_exec_m12_%31"), url.replace(database, `${database}/../production`),
    `${url}?host=production.invalid`, `${url}?sslmode=require`, `${url}#fragment`, `${url} `, `${url}\n`, `${url}\r\n`,
  ])("rejects URL variant %# without touching a database", (value) => {
    expect(() => bootstrapConnection(validateBootstrapTarget(target), "check", undefined,
      { ...environment, EXECUTIVE_BOOTSTRAP_DATABASE_URL: value, DATABASE_URL: url })).toThrow();
  });
  it.each([
    { NODE_ENV: undefined }, { NODE_ENV: "production" }, { EXECUTIVE_BOOTSTRAP_DATABASE_CONFIRM: undefined },
    { EXECUTIVE_BOOTSTRAP_DATABASE_CONFIRM: "msf_exec_m12_another" },
  ])("requires test mode and exact environment confirmation %#", (patch) => {
    expect(() => bootstrapConnection(validateBootstrapTarget(target), "check", undefined, { ...environment, ...patch })).toThrow();
  });
  it("requires separate apply confirmation even when the URL and env agree", () => {
    for (const confirmation of [undefined, "", "msf_exec_m12_another", `${database}\n`]) {
      expect(() => bootstrapConnection(validateBootstrapTarget(target), "apply", confirmation, environment)).toThrow();
    }
  });
});
