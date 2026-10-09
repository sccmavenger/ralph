import { describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { canonicalHash, sha256 } from "../../src/lib/executive/canonical";
import { BootstrapRejectionError, bootstrapSqlState, runBootstrap, type BootstrapOptions, type BootstrapPrepared } from "../../src/lib/executive/bootstrap";
import {
  appendBootstrapEvent, buildBootstrapDiagnostic, createBootstrapEvents, createRejectionEvent,
  validateBootstrapEvent, type BootstrapEventData, type BootstrapEventInput,
} from "../../src/lib/executive/audit";

const requestId = "02eb56f3-908f-46f9-bb95-b997ae38797c";
const at = new Date("2026-09-24T12:34:56.789Z");
function eventInput(): BootstrapEventInput {
  return {
    officeId: "synthetic_office", ownerId: "synthetic_owner", ceoId: "synthetic_ceo", charterId: "synthetic_charter",
    requestId, at, bootstrapHash: "a".repeat(64), contentHash: "b".repeat(64),
    sourceFileName: "synthetic-charter.docx", sourceFileHash: "c".repeat(64), manifestHash: "d".repeat(64),
  };
}

describe("BOOT-14 closed audit registry, attribution and public diagnostics", () => {
  it("builds exactly the two approved success events with OPERATOR attribution and no allocated ids/sequence", () => {
    const input = eventInput();
    const [imported, completed] = createBootstrapEvents(input);
    expect(imported).toEqual({
      officeId: input.officeId, requestId, createdAt: at, occurredAt: at, actorType: "OPERATOR", actorOwnerId: null,
      eventType: "executive.charter.imported", outcome: "SUCCESS", subjectType: "ExecutiveCharter", subjectId: input.charterId,
      metadata: { schemaVersion: 1, bootstrapVersion: 1, charterVersion: 1, contentHash: input.contentHash,
        sourceFileName: input.sourceFileName, sourceFileHash: input.sourceFileHash, manifestHash: input.manifestHash,
        importMethod: "OPERATOR_BOOTSTRAP" },
    });
    expect(completed).toEqual({
      officeId: input.officeId, requestId, createdAt: at, occurredAt: at, actorType: "OPERATOR", actorOwnerId: null,
      eventType: "executive.bootstrap.completed", outcome: "SUCCESS", subjectType: "ExecutiveOffice", subjectId: input.officeId,
      metadata: { schemaVersion: 1, bootstrapVersion: 1, bootstrapHash: input.bootstrapHash, ownerId: input.ownerId,
        ceoId: input.ceoId, charterId: input.charterId, charterContentHash: input.contentHash, manifestHash: input.manifestHash,
        phase: "FOUNDATION", executionMode: "DISABLED", ownerStatus: "PENDING_ENROLLMENT", ceoStatus: "ONBOARDING", acceptanceCreated: false },
    });
    expect(imported.createdAt).not.toBe(input.at);
    for (const event of [imported, completed]) {
      expect(event).not.toHaveProperty("id");
      expect(event).not.toHaveProperty("sequence");
      expect(Buffer.byteLength(JSON.stringify(event.metadata))).toBeLessThanOrEqual(8192);
    }
  });

  it("builds a conflict rejection without attempted hash, Owner input or authentication claims", () => {
    const event = createRejectionEvent({ officeId: "synthetic_office", requestId, at });
    expect(event.metadata).toEqual({ schemaVersion: 1, reasonCode: "BOOTSTRAP_CONFLICT", bootstrapVersion: 1, auditPersisted: true });
    expect(event.actorType).toBe("OPERATOR");
    expect(event.actorOwnerId).toBeNull();
    expect(event.eventType).toBe("executive.bootstrap.rejected");
    expect(event.subjectId).toBe(event.officeId);
    expect(event.outcome).toBe("REJECTED");
  });

  it.each([
    ["bootstrapHash", "UPPERCASE"], ["contentHash", "b".repeat(63)], ["manifestHash", "z".repeat(64)],
    ["sourceFileHash", null], ["sourceFileName", "/private/synthetic-charter.docx"],
    ["sourceFileName", "../synthetic-charter.docx"], ["requestId", "user@example.invalid"],
    ["officeId", "user@example.invalid"], ["at", new Date("invalid")],
    ["bootstrapHash", "a".repeat(64) + "\n"], ["officeId", "office\n"],
    ["requestId", requestId + "\n"], ["sourceFileName", "synthetic.docx\n"],
  ])("rejects invalid %s without incorporating its raw value", (key, value) => {
    expect(() => createBootstrapEvents({ ...eventInput(), [key]: value } as BootstrapEventInput)).toThrow("AUDIT_EVENT_INVALID");
  });

  it("rejects unknown constructor/metadata/event keys rather than silently deleting secrets", () => {
    expect(() => createBootstrapEvents({ ...eventInput(), email: "secret@example.invalid" } as BootstrapEventInput)).toThrow("AUDIT_EVENT_INVALID");
    const [imported] = createBootstrapEvents(eventInput());
    expect(() => validateBootstrapEvent({ ...imported, metadata: { ...imported.metadata, token: "synthetic-secret" } })).toThrow("AUDIT_EVENT_INVALID");
    expect(() => validateBootstrapEvent({ ...imported, sequence: 1 } as BootstrapEventData)).toThrow("AUDIT_EVENT_INVALID");
  });

  it.each([
    { actorType: "OWNER" }, { actorOwnerId: "synthetic_owner" }, { outcome: "FAILED" },
    { eventType: "executive.charter.accepted" }, { subjectType: "ExecutiveOffice" },
    { occurredAt: new Date(at.getTime() + 1) }, { metadata: null },
  ])("rejects forged event shape %o", (override) => {
    const [event] = createBootstrapEvents(eventInput());
    expect(() => validateBootstrapEvent({ ...event, ...override } as BootstrapEventData)).toThrow("AUDIT_EVENT_INVALID");
  });

  it("append uses only the supplied transaction and validates before attempting a write", async () => {
    const [event] = createBootstrapEvents(eventInput());
    const row = { ...event, id: "event_id", sequence: BigInt(1) };
    const create = vi.fn().mockResolvedValue(row);
    const findUnique = vi.fn().mockResolvedValue(row);
    const tx = { executiveActivityEvent: { create, findUnique } } as unknown as Prisma.TransactionClient;
    expect(await appendBootstrapEvent(tx, event)).toEqual(row);
    expect(findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: "event_id" } });
    expect(create).toHaveBeenCalledExactlyOnceWith({ data: event });
    await expect(appendBootstrapEvent(tx, { ...event, metadata: { ...event.metadata, secret: "sensitive" } })).rejects.toThrow("AUDIT_EVENT_INVALID");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each(["missing", "metadata", "request", "time", "sequence", "identity"])(
    "rejects %s persisted audit mismatch without a persistence claim", async kind => {
      const event = createRejectionEvent({ officeId: "synthetic_office", requestId, at });
      const inserted = { ...structuredClone(event), id: "event_id", sequence: 1n };
      const persisted = { ...structuredClone(inserted) };
      if (kind === "metadata") persisted.metadata = { ...persisted.metadata, secret: "synthetic-private-marker" };
      if (kind === "request") persisted.requestId = "251e89b2-9dad-44cc-801f-cf991bcd50de";
      if (kind === "time") persisted.occurredAt = new Date(at.getTime() + 1);
      if (kind === "sequence") persisted.sequence = 2n;
      if (kind === "identity") persisted.id = "different_id";
      const create = vi.fn().mockResolvedValue(inserted);
      const findUnique = vi.fn().mockResolvedValue(kind === "missing" ? null : persisted);
      const tx = { executiveActivityEvent: { create, findUnique } } as unknown as Prisma.TransactionClient;
      await expect(appendBootstrapEvent(tx, event)).rejects.toThrow("AUDIT_EVENT_INVALID");
    },
  );

  it("never substitutes successful audit output after the transaction writer rejects", async () => {
    const create = vi.fn().mockRejectedValue(new Error("Synthetic write failed"));
    const tx = { executiveActivityEvent: { create } } as unknown as Prisma.TransactionClient;
    await expect(appendBootstrapEvent(tx, createRejectionEvent({ officeId: "synthetic_office", requestId, at }))).rejects.toThrow("Synthetic write failed");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("diagnostics contain only allowlisted fields and omit audit persistence when commit is unknown", () => {
    expect(buildBootstrapDiagnostic({ requestId, reasonCode: "COMMIT_OUTCOME_UNKNOWN", phase: "COMMIT" })).toEqual({
      kind: "executive.bootstrap.failed", requestId, reasonCode: "COMMIT_OUTCOME_UNKNOWN", phase: "COMMIT",
    });
    expect(buildBootstrapDiagnostic({ requestId, reasonCode: "BOOTSTRAP_CONFLICT", phase: "REPLAY", auditPersisted: true })).toEqual({
      kind: "executive.bootstrap.rejected", requestId, reasonCode: "BOOTSTRAP_CONFLICT", phase: "REPLAY", auditPersisted: true,
    });
    expect(buildBootstrapDiagnostic({ requestId, reasonCode: "AUDIT_WRITE_FAILED", phase: "AUDIT", auditPersisted: false })).toEqual({
      kind: "executive.bootstrap.failed", requestId, reasonCode: "AUDIT_WRITE_FAILED", phase: "AUDIT", auditPersisted: false,
    });
    expect(() => buildBootstrapDiagnostic({ requestId, reasonCode: "COMMIT_OUTCOME_UNKNOWN", phase: "COMMIT", auditPersisted: false })).toThrow("AUDIT_EVENT_INVALID");
    expect(() => buildBootstrapDiagnostic({ requestId, reasonCode: "TRANSACTION_FAILED", phase: "CREATE", stack: "private details" } as Parameters<typeof buildBootstrapDiagnostic>[0])).toThrow("AUDIT_EVENT_INVALID");
    expect(() => buildBootstrapDiagnostic({ requestId, reasonCode: "secret@example.invalid", phase: "CREATE" } as unknown as Parameters<typeof buildBootstrapDiagnostic>[0])).toThrow("AUDIT_EVENT_INVALID");
  });
});

function preparedInput(): BootstrapPrepared {
  const charter = { contentMarkdown: "# Synthetic Charter\n", contentHash: sha256("# Synthetic Charter\n"),
    sourceFileName: "synthetic.docx", sourceFileHash: "c".repeat(64), title: "Synthetic Charter", manifestHash: "d".repeat(64) };
  const envelope: BootstrapPrepared["envelope"] = {
    bootstrapVersion: 1, auditSchemaVersion: 1,
    office: { key: "msf-toolkit", name: "MSF Toolkit Executive Office", phase: "FOUNDATION", executionMode: "DISABLED", activeCharterAcceptanceId: null },
    owner: { displayName: "Synthetic Owner", contactEmail: null, status: "PENDING_ENROLLMENT", authVersion: 1 },
    ceo: { roleKey: "CEO", displayName: "MSF Toolkit CEO", status: "ONBOARDING", roleDefinitionVersion: 1,
      governingCharterAcceptanceId: null, roleDefinition: { schemaVersion: 1, mission: "Synthetic mission",
        responsibilities: ["Learn"], nonResponsibilities: ["No actions"], tools: [], permissions: [], spendingAuthority: false } },
    charter: { version: 1, title: charter.title, contentHash: charter.contentHash, sourceFileName: charter.sourceFileName,
      sourceFileHash: charter.sourceFileHash, manifestHash: charter.manifestHash, importedByOwnerId: null },
  };
  return { charter, envelope, bootstrapHash: canonicalHash(envelope) };
}

/** Orchestration doubles only; real rollback/locking/adapter proof lives in PG tests. */
function serviceDouble() {
  type Row = Record<string, unknown>;
  const state = { offices: [] as Row[], owners: [] as Row[], agents: [] as Row[], charters: [] as Row[], births: [] as Row[],
    counts: Object.fromEntries(["ExecutiveOffice", "ExecutiveOwner", "ExecutiveAgent", "ExecutiveCharter", "ExecutiveOwnerCredential",
      "ExecutiveOwnerEnrollment", "ExecutiveOwnerChallenge", "ExecutiveOwnerSession", "ExecutiveAuthRateLimit", "ExecutiveCharterAcceptance",
      "ExecutiveActivityEvent"].map((table) => [table, 0])) };
  const order: string[] = [];
  const auditRows = new Map<string, Row>();
  const insert = (collection: "offices" | "owners" | "agents" | "charters", table: string, letter: string) => vi.fn(async ({ data }: { data: Row }) => {
    order.push(table);
    const row = { ...structuredClone(data), id: `c${letter.repeat(24)}` };
    state[collection].push(row);
    state.counts[table]++;
    return row;
  });
  const officeInsert = insert("offices", "ExecutiveOffice", "a");
  const tx = {
    $executeRawUnsafe: vi.fn(async (sql: string) => { order.push(sql); return 0; }),
    $queryRawUnsafe: vi.fn(async (sql: string) => {
      order.push(sql.includes("pg_advisory_xact_lock") ? "advisoryLock" : sql.includes("clock_timestamp") ? "databaseTime" : "readSnapshot");
      if (sql.includes("pg_advisory_xact_lock")) return [{ locked: 1 }];
      if (sql.includes("clock_timestamp")) return [{ at }];
      return [{ snapshot: structuredClone(state) }];
    }),
    executiveOffice: { createManyAndReturn: vi.fn(async ({ data }: { data: Row[] }) => [await officeInsert({ data: data[0] })]) },
    executiveOwner: { create: insert("owners", "ExecutiveOwner", "b") },
    executiveCharter: { create: insert("charters", "ExecutiveCharter", "c") },
    executiveAgent: { create: insert("agents", "ExecutiveAgent", "d") },
    executiveActivityEvent: { create: vi.fn(async ({ data }: { data: Row }) => {
      order.push(String(data.eventType));
      state.counts.ExecutiveActivityEvent++;
      const event = { ...structuredClone(data), id: `event_${state.counts.ExecutiveActivityEvent}`, sequence: String(state.counts.ExecutiveActivityEvent) };
      if (data.eventType !== "executive.bootstrap.rejected") state.births.push(event);
      const persisted = { ...event, sequence: BigInt(event.sequence) };
      auditRows.set(event.id, persisted);
      return persisted;
    }), findUnique: vi.fn(async ({ where }: { where: { id: string } }) => auditRows.get(where.id) ?? null) },
  };
  const transaction = vi.fn(async (operation: (value: Prisma.TransactionClient) => Promise<unknown>) => operation(tx as unknown as Prisma.TransactionClient));
  const client = { $transaction: transaction } as unknown as PrismaClient;
  const readiness = vi.fn(async () => { order.push("readiness"); });
  const options = { client, mode: "apply" as const, prepared: preparedInput(), requestId, readiness };
  return { state, order, tx, transaction, readiness, options };
}

describe("BOOT-04/05/06/08/13/14 pure transaction orchestration and safe error outcomes", () => {
  it.each(["check", "apply"] as const)("retains %s mode when caller options change during readiness", async (mode) => {
    const fixture = serviceDouble();
    const options: BootstrapOptions = { ...fixture.options, mode };
    fixture.readiness.mockImplementationOnce(async () => {
      options.mode = mode === "check" ? "apply" : "check";
      options.prepared.envelope.owner.displayName = "Changed while waiting";
    });
    expect(await runBootstrap(options)).toMatchObject({ status: mode === "check" ? "READY_EMPTY" : "CREATED" });
    expect(fixture.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: mode === "check" ? "RepeatableRead" : "ReadCommitted", maxWait: 5000, timeout: 30000,
    });
    expect(fixture.tx.executiveOffice.createManyAndReturn).toHaveBeenCalledTimes(mode === "check" ? 0 : 1);
    expect(fixture.tx.executiveActivityEvent.create).toHaveBeenCalledTimes(mode === "check" ? 0 : 2);
    if (mode === "apply") expect(fixture.state.owners[0].displayName).toBe("Synthetic Owner");
  });

  it("a bounded retry retains the original client, readiness, mode, input and correlation", async () => {
    const fixture = serviceDouble();
    const replacement = serviceDouble();
    const options: BootstrapOptions = { ...fixture.options };
    // Fail before writes: this double does not model PostgreSQL rollback.
    fixture.readiness.mockImplementationOnce(async () => {
      options.client = replacement.options.client;
      options.readiness = replacement.readiness;
      options.mode = "check";
      options.requestId = "251e89b2-9dad-44cc-801f-cf991bcd50de";
      options.prepared.envelope.owner.displayName = "Changed while waiting";
      throw { code: "40001" };
    });
    expect(await runBootstrap(options)).toMatchObject({ status: "CREATED", requestId, exitCode: 0 });
    expect(fixture.transaction).toHaveBeenCalledTimes(2);
    expect(fixture.readiness).toHaveBeenCalledTimes(2);
    expect(replacement.transaction).not.toHaveBeenCalled();
    expect(replacement.readiness).not.toHaveBeenCalled();
    expect(fixture.state.owners[0].displayName).toBe("Synthetic Owner");
    expect(fixture.state.births.every(event => event.requestId === requestId)).toBe(true);
    expect(fixture.transaction).toHaveBeenNthCalledWith(2, expect.any(Function), {
      isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 30000,
    });
  });

  it("check uses read-only RepeatableRead, no write lock or sequence allocation", async () => {
    const fixture = serviceDouble();
    expect(await runBootstrap({ ...fixture.options, mode: "check" })).toEqual({ status: "READY_EMPTY", requestId,
      bootstrapVersion: 1, currentlyInert: true, exitCode: 0 });
    expect(fixture.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30000 });
    expect(fixture.order[0]).toBe("SET TRANSACTION READ ONLY");
    expect(fixture.order).not.toContain("advisoryLock");
    expect(fixture.tx.executiveActivityEvent.create).not.toHaveBeenCalled();
    expect(fixture.tx.executiveOffice.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("creation locks before readiness/reads and writes Office, Owner, Charter, CEO, both events with the same trusted time", async () => {
    const fixture = serviceDouble();
    const result = await runBootstrap(fixture.options);
    expect(result).toMatchObject({ status: "CREATED", exitCode: 0, currentlyInert: true, ownerStatus: "PENDING_ENROLLMENT", ceoStatus: "ONBOARDING" });
    expect(fixture.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 30000 });
    expect(fixture.tx.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"), 1297303109, 1);
    expect(fixture.order.indexOf("advisoryLock")).toBeLessThan(fixture.order.indexOf("readiness"));
    expect(fixture.order.indexOf("readiness")).toBeLessThan(fixture.order.indexOf("readSnapshot"));
    expect(fixture.order.slice(fixture.order.indexOf("ExecutiveOffice"), fixture.order.indexOf("ExecutiveOffice") + 6)).toEqual([
      "ExecutiveOffice", "ExecutiveOwner", "ExecutiveCharter", "ExecutiveAgent", "executive.charter.imported", "executive.bootstrap.completed",
    ]);
    const data = fixture.tx.executiveOffice.createManyAndReturn.mock.calls[0][0].data;
    expect(data).toHaveLength(1);
    expect(data[0]).not.toHaveProperty("id");
    expect(data[0].createdAt).toEqual(at);
    expect(fixture.state.owners[0].webauthnUserId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fixture.order.at(-1)).toBe("SET CONSTRAINTS ALL IMMEDIATE");
    expect(fixture.state.births.every((event) => event.requestId === requestId)).toBe(true);
  });

  it("replay preserves evolved display/contact/status/authVersion/paired acceptance and never appends history", async () => {
    const fixture = serviceDouble();
    const first = await runBootstrap(fixture.options);
    Object.assign(fixture.state.owners[0], { displayName: "Renamed", contactEmail: "synthetic@example.invalid", status: "ACTIVE", authVersion: 5, updatedAt: new Date(at.getTime() + 1) });
    Object.assign(fixture.state.offices[0], { name: "Renamed office", activeCharterAcceptanceId: "acceptance_1" });
    Object.assign(fixture.state.agents[0], { displayName: "Renamed CEO", governingCharterAcceptanceId: "acceptance_1" });
    fixture.state.counts.ExecutiveOwnerCredential = 1;
    fixture.state.counts.ExecutiveOwnerSession = 1;
    fixture.state.counts.ExecutiveCharterAcceptance = 1;
    fixture.state.counts.ExecutiveActivityEvent = 10;
    const snapshot = structuredClone(fixture.state);
    const result = await runBootstrap(fixture.options);
    expect(result).toMatchObject({ status: "ALREADY_BOOTSTRAPPED", exitCode: 0, currentlyInert: true, ownerStatus: "ACTIVE", activeCharterAcceptanceId: "acceptance_1" });
    expect("officeId" in result && "officeId" in first && result.officeId === first.officeId).toBe(true);
    expect(fixture.state).toEqual(snapshot);
    expect(fixture.tx.executiveOffice.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(fixture.tx.executiveActivityEvent.create).toHaveBeenCalledTimes(2);
  });

  it("conflict audit readback failure stops without retry or a persisted-audit claim", async () => {
    const fixture = serviceDouble();
    await runBootstrap(fixture.options);
    const prepared = preparedInput();
    prepared.envelope.owner.displayName = "Conflicting synthetic Owner";
    prepared.bootstrapHash = canonicalHash(prepared.envelope);
    fixture.tx.executiveActivityEvent.findUnique.mockResolvedValueOnce(null);
    const result = await runBootstrap({ ...fixture.options, prepared });
    expect(result).toMatchObject({ reasonCode: "AUDIT_WRITE_FAILED", exitCode: 5,
      diagnostic: { phase: "AUDIT", auditPersisted: false } });
    expect(fixture.transaction).toHaveBeenCalledTimes(2);
    // This double proves classification only; PostgreSQL rollback is tested separately.
  });

  it("changed inputs commit one rejection event before returning a nonzero conflict; check never writes it", async () => {
    const fixture = serviceDouble();
    await runBootstrap(fixture.options);
    const prepared = preparedInput();
    prepared.envelope.owner.displayName = "Different synthetic Owner";
    prepared.bootstrapHash = canonicalHash(prepared.envelope);
    const result = await runBootstrap({ ...fixture.options, prepared });
    expect(result).toMatchObject({ status: "REJECTED", reasonCode: "BOOTSTRAP_CONFLICT", exitCode: 4, diagnostic: { auditPersisted: true } });
    expect(fixture.tx.executiveActivityEvent.create).toHaveBeenCalledTimes(3);
    expect(fixture.tx.executiveOffice.createManyAndReturn).toHaveBeenCalledTimes(1);
    const checked = await runBootstrap({ ...fixture.options, prepared, mode: "check" });
    expect(checked).toMatchObject({ reasonCode: "BOOTSTRAP_CONFLICT", diagnostic: { auditPersisted: false } });
    expect(fixture.tx.executiveActivityEvent.create).toHaveBeenCalledTimes(3);
  });

  it.each(["missing", "duplicate", "metadata", "role", "pair", "order"])("rejects %s birth inconsistency without repairing or appending", async (kind) => {
    const fixture = serviceDouble();
    await runBootstrap(fixture.options);
    if (kind === "missing") fixture.state.births.pop();
    if (kind === "duplicate") fixture.state.births.push(structuredClone(fixture.state.births[0]));
    if (kind === "metadata") fixture.state.births[0].metadata = { secret: "sensitive@example.invalid" };
    if (kind === "role") (fixture.state.agents[0].roleDefinition as { mission: string }).mission = "Corrupted mission";
    if (kind === "pair") fixture.state.offices[0].activeCharterAcceptanceId = "split_acceptance";
    if (kind === "order") fixture.state.births[0].sequence = "99";
    expect(await runBootstrap(fixture.options)).toMatchObject({ reasonCode: "FOUNDATION_INCONSISTENT", exitCode: 4, diagnostic: { auditPersisted: false } });
    expect(fixture.tx.executiveActivityEvent.create).toHaveBeenCalledTimes(2);
    expect(fixture.tx.executiveOffice.createManyAndReturn).toHaveBeenCalledTimes(1);
  });

  it("rejects a mismatched prepared digest before even opening an interactive transaction", async () => {
    const fixture = serviceDouble();
    fixture.options.prepared.envelope.owner.displayName = "Changed without rehash";
    expect(await runBootstrap(fixture.options)).toMatchObject({ reasonCode: "INPUT_INVALID", exitCode: 2 });
    expect(fixture.transaction).not.toHaveBeenCalled();
  });

  it.each(["accessor", "hidden", "symbol", "prototype", "array accessor", "array extra", "cycle"])(
    "rejects supplied %s without cloning away evidence or opening a transaction", async kind => {
      const fixture = serviceDouble();
      const prepared = fixture.options.prepared;
      const getter = vi.fn(() => "Synthetic Owner");
      if (kind === "accessor") Object.defineProperty(prepared.envelope.owner, "displayName", { enumerable: true, get: getter });
      if (kind === "hidden") Object.defineProperty(prepared.envelope.owner, "privateMarker", { value: "synthetic-private-marker" });
      if (kind === "symbol") Object.defineProperty(prepared, Symbol("privateMarker"), { value: "synthetic-private-marker" });
      if (kind === "prototype") Object.setPrototypeOf(prepared.envelope.owner, { inherited: true });
      const responsibilities = prepared.envelope.ceo.roleDefinition.responsibilities;
      if (kind === "array accessor") Object.defineProperty(responsibilities, "0", { enumerable: true, get: getter });
      if (kind === "array extra") Object.defineProperty(responsibilities, "privateMarker", { value: "synthetic-private-marker" });
      if (kind === "cycle") Object.assign(prepared, { cycle: prepared });
      const outcome = await runBootstrap(fixture.options);
      expect(outcome).toMatchObject({ reasonCode: "INPUT_INVALID", exitCode: 2, diagnostic: { auditPersisted: false } });
      expect(JSON.stringify(outcome)).not.toContain("synthetic-private-marker");
      expect(getter).not.toHaveBeenCalled();
      expect(fixture.transaction).not.toHaveBeenCalled();
    },
  );

  it("captures nested own data without executing ordinary read traps", async () => {
    const fixture = serviceDouble();
    const read = vi.fn(() => { throw new Error("synthetic-private-marker"); });
    fixture.options.prepared.envelope.owner = new Proxy(fixture.options.prepared.envelope.owner, { get: read });
    expect(await runBootstrap(fixture.options)).toMatchObject({ status: "CREATED", exitCode: 0 });
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["noncanonical content", "empty responsibilities"])(
    "rejects persisted %s before a conflicting attempt can append a rejection", async kind => {
      const fixture = serviceDouble();
      expect(await runBootstrap(fixture.options)).toMatchObject({ status: "CREATED" });
      // Returned-data corruption only; never mutate permanent DB history or
      // disable guards. Keep birth hashes consistent to isolate semantic checks.
      if (kind === "noncanonical content") {
        const content = "# Synthetic Charter\r\n";
        fixture.state.charters[0].contentMarkdown = content;
        fixture.state.charters[0].contentHash = sha256(content);
        (fixture.state.births[0].metadata as Record<string, unknown>).contentHash = sha256(content);
        (fixture.state.births[1].metadata as Record<string, unknown>).charterContentHash = sha256(content);
      } else {
        (fixture.state.agents[0].roleDefinition as { responsibilities: string[] }).responsibilities = [];
      }
      const attempted = preparedInput();
      attempted.envelope.owner.displayName = "Different synthetic Owner";
      attempted.bootstrapHash = canonicalHash(attempted.envelope);
      expect(await runBootstrap({ ...fixture.options, prepared: attempted })).toMatchObject({
        reasonCode: "FOUNDATION_INCONSISTENT", exitCode: 4, diagnostic: { auditPersisted: false },
      });
      expect(fixture.tx.executiveActivityEvent.create).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["extra envelope key", "extra owner key", "extra artifact key", "empty owner", "control character", "invalid contact"])(
    "rejects %s even with a recomputed digest before opening a transaction", async kind => {
      const fixture = serviceDouble();
      const prepared = fixture.options.prepared;
      if (kind === "extra envelope key") Object.assign(prepared.envelope, { secret: "synthetic-private-marker" });
      if (kind === "extra owner key") Object.assign(prepared.envelope.owner, { token: "synthetic-private-marker" });
      if (kind === "extra artifact key") Object.assign(prepared.charter, { sourcePath: "/synthetic-private-marker" });
      if (kind === "empty owner") prepared.envelope.owner.displayName = "";
      if (kind === "control character") prepared.envelope.owner.displayName = "Synthetic\nOwner";
      if (kind === "invalid contact") prepared.envelope.owner.contactEmail = "synthetic-private-marker";
      prepared.bootstrapHash = canonicalHash(prepared.envelope);
      const result = await runBootstrap(fixture.options);
      expect(result).toMatchObject({ reasonCode: "INPUT_INVALID", exitCode: 2, diagnostic: { auditPersisted: false } });
      expect(fixture.transaction).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain("synthetic-private-marker");
    },
  );

  it.each([
    ["BOM", "\uFEFF# Synthetic Charter\n"], ["CRLF", "# Synthetic Charter\r\n"],
    ["missing final LF", "# Synthetic Charter"], ["extra final LF", "# Synthetic Charter\n\n"],
    ["empty", ""], ["whitespace only", " \n"], ["NUL", "# Synthetic\0Charter\n"],
    ["unpaired surrogate", "# Synthetic \ud800\n"],
    ["oversized UTF-8", "é".repeat(128 * 1024) + "\n"],
  ])("rejects %s Markdown with a matching recomputed digest before any transaction", async (_kind, contentMarkdown) => {
    const fixture = serviceDouble();
    const prepared = fixture.options.prepared;
    prepared.charter.contentMarkdown = contentMarkdown;
    prepared.charter.contentHash = sha256(contentMarkdown);
    prepared.envelope.charter.contentHash = prepared.charter.contentHash;
    prepared.bootstrapHash = canonicalHash(prepared.envelope);
    expect(await runBootstrap(fixture.options)).toMatchObject({ reasonCode: "INPUT_INVALID", exitCode: 2,
      diagnostic: { phase: "INPUT", auditPersisted: false } });
    expect(fixture.transaction).not.toHaveBeenCalled();
    expect(fixture.readiness).not.toHaveBeenCalled();
  });

  it.each(["empty responsibilities", "empty boundaries", "blank responsibility", "NUL mission", "oversized role",
    "empty Office", "non-string CEO", "blank title", "private source path"])(
    "rejects %s prepared release data before any transaction", async kind => {
      const fixture = serviceDouble();
      const prepared = fixture.options.prepared;
      const role = prepared.envelope.ceo.roleDefinition;
      if (kind === "empty responsibilities") role.responsibilities = [];
      if (kind === "empty boundaries") role.nonResponsibilities = [];
      if (kind === "blank responsibility") role.responsibilities = [" "];
      if (kind === "NUL mission") role.mission = "Synthetic\0mission";
      if (kind === "oversized role") role.mission = "é".repeat(8192);
      if (kind === "empty Office") prepared.envelope.office.name = "";
      if (kind === "non-string CEO") Object.assign(prepared.envelope.ceo, { displayName: { secret: "synthetic-private-marker" } });
      if (kind === "blank title") prepared.charter.title = prepared.envelope.charter.title = " ";
      if (kind === "private source path") prepared.charter.sourceFileName = prepared.envelope.charter.sourceFileName = "/synthetic-private-marker.docx";
      prepared.bootstrapHash = canonicalHash(prepared.envelope);
      const result = await runBootstrap(fixture.options);
      expect(result).toMatchObject({ reasonCode: "INPUT_INVALID", exitCode: 2, diagnostic: { auditPersisted: false } });
      expect(fixture.transaction).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain("synthetic-private-marker");
    },
  );

  it("retains exact valid Unicode Markdown bytes through creation and replay at the byte limit", async () => {
    const fixture = serviceDouble();
    const prepared = fixture.options.prepared;
    // 2 bytes per é, 3 per em dash and 1 final LF: exactly 256 KiB.
    prepared.charter.contentMarkdown = "é".repeat(131070) + "—\n";
    prepared.charter.contentHash = sha256(prepared.charter.contentMarkdown);
    prepared.envelope.charter.contentHash = prepared.charter.contentHash;
    prepared.bootstrapHash = canonicalHash(prepared.envelope);
    expect(Buffer.byteLength(prepared.charter.contentMarkdown)).toBe(256 * 1024);
    expect(await runBootstrap(fixture.options)).toMatchObject({ status: "CREATED" });
    expect(fixture.state.charters[0].contentMarkdown).toBe(prepared.charter.contentMarkdown);
    expect(await runBootstrap(fixture.options)).toMatchObject({ status: "ALREADY_BOOTSTRAPPED" });
    expect(fixture.tx.executiveActivityEvent.create).toHaveBeenCalledTimes(2);
  });

  it("readiness rejection and lock timeout expose only stable diagnostics, with no writes/retry", async () => {
    const fixture = serviceDouble();
    fixture.readiness.mockRejectedValueOnce(new BootstrapRejectionError("PRIVILEGE_FAILED"));
    expect(await runBootstrap(fixture.options)).toMatchObject({ reasonCode: "PRIVILEGE_FAILED", exitCode: 3, diagnostic: { phase: "PREFLIGHT", auditPersisted: false } });
    fixture.tx.$queryRawUnsafe.mockRejectedValueOnce({ code: "55P03", message: "postgresql://secret:password/private" });
    const result = await runBootstrap(fixture.options);
    expect(result).toMatchObject({ reasonCode: "LOCK_TIMEOUT", exitCode: 5, diagnostic: { phase: "LOCK", auditPersisted: false } });
    expect(JSON.stringify(result)).not.toContain("password");
    expect(fixture.transaction).toHaveBeenCalledTimes(2);
    expect(fixture.tx.executiveOffice.createManyAndReturn).not.toHaveBeenCalled();
  });

  it.each(["40P01", "40001"])("retries server-confirmed %s once, then stops with the same fixed lock/request", async (code) => {
    const fixture = serviceDouble();
    fixture.tx.$queryRawUnsafe.mockRejectedValue({ code, message: "private SQL detail" });
    expect(await runBootstrap(fixture.options)).toMatchObject({ reasonCode: "TRANSACTION_FAILED", requestId, exitCode: 5 });
    expect(fixture.transaction).toHaveBeenCalledTimes(2);
    for (const call of fixture.tx.$queryRawUnsafe.mock.calls) expect(call).toEqual([
      "SELECT 1 AS locked FROM pg_catalog.pg_advisory_xact_lock($1::int, $2::int)", 1297303109, 1,
    ]);
  });

  it("an audit deadlock is not retried and raw provider details never escape", async () => {
    const fixture = serviceDouble();
    fixture.tx.executiveActivityEvent.create.mockRejectedValueOnce({ code: "40P01", message: "private SQL with synthetic@example.invalid and token" });
    const result = await runBootstrap(fixture.options);
    expect(result).toMatchObject({ reasonCode: "AUDIT_WRITE_FAILED", exitCode: 5, diagnostic: { phase: "AUDIT", auditPersisted: false } });
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/private|example.invalid|token/);
  });

  it.each([
    { code: "ECONNRESET" }, { code: "08007" }, { code: "40003" },
    { code: "P2010", meta: { code: "40003" } },
    { meta: { driverAdapterError: { cause: { originalCode: "40003" } } } },
  ])("a lost acknowledgment (%j) after callback completion is unknown, never success or confirmed absent audit", async error => {
    const fixture = serviceDouble();
    fixture.transaction.mockImplementationOnce(async (operation) => {
      await operation(fixture.tx as unknown as Prisma.TransactionClient);
      throw { ...error, message: "private connection string" };
    });
    const outcome = await runBootstrap(fixture.options);
    expect(outcome).toMatchObject({ status: "FAILED", reasonCode: "COMMIT_OUTCOME_UNKNOWN", exitCode: 6, diagnostic: { phase: "COMMIT" } });
    expect("diagnostic" in outcome && Object.hasOwn(outcome.diagnostic, "auditPersisted")).toBe(false);
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
    expect(await runBootstrap(fixture.options)).toMatchObject({ status: "ALREADY_BOOTSTRAPPED", exitCode: 0 });
    expect(fixture.tx.executiveActivityEvent.create).toHaveBeenCalledTimes(2);
  });

  it.each(["40003", "08007"])("uncertain %s rejection commit omits persistence and never retries the audit", async code => {
    const fixture = serviceDouble();
    expect(await runBootstrap(fixture.options)).toMatchObject({ status: "CREATED" });
    const prepared = preparedInput();
    prepared.envelope.owner.displayName = "Conflicting synthetic Owner";
    prepared.bootstrapHash = canonicalHash(prepared.envelope);
    fixture.transaction.mockImplementationOnce(async operation => {
      await operation(fixture.tx as unknown as Prisma.TransactionClient);
      throw { code, message: "synthetic-private-marker" };
    });
    const result = await runBootstrap({ ...fixture.options, prepared });
    expect(result).toMatchObject({ reasonCode: "COMMIT_OUTCOME_UNKNOWN", exitCode: 6, diagnostic: { phase: "COMMIT" } });
    if (!("diagnostic" in result)) throw new Error("Expected unknown outcome diagnostic");
    expect(result.diagnostic).not.toHaveProperty("auditPersisted");
    expect(JSON.stringify(result)).not.toContain("synthetic-private-marker");
    expect(fixture.transaction).toHaveBeenCalledTimes(2);
    expect(fixture.tx.executiveActivityEvent.create).toHaveBeenCalledTimes(3);
    expect(await runBootstrap(fixture.options)).toMatchObject({ status: "ALREADY_BOOTSTRAPPED" });
    // Repeat conflict is a separate bounded attempt, not exactly-once delivery.
    expect(await runBootstrap({ ...fixture.options, prepared })).toMatchObject({
      reasonCode: "BOOTSTRAP_CONFLICT", diagnostic: { auditPersisted: true },
    });
    expect(fixture.tx.executiveActivityEvent.create).toHaveBeenCalledTimes(4);
  });

  it.each(["40001", "40P01", "23514", "57014"])("confirmed %s rejection commit abort reports the audit gap without retry", async code => {
    const fixture = serviceDouble();
    expect(await runBootstrap(fixture.options)).toMatchObject({ status: "CREATED" });
    const prepared = preparedInput();
    prepared.envelope.owner.displayName = "Conflicting synthetic Owner";
    prepared.bootstrapHash = canonicalHash(prepared.envelope);
    const before = structuredClone(fixture.state);
    fixture.transaction.mockImplementationOnce(async operation => {
      await operation(fixture.tx as unknown as Prisma.TransactionClient);
      // Model confirmed rollback only for classification. Real PostgreSQL
      // rollback/adapter checks remain in the guarded integration suite.
      Object.assign(fixture.state, before);
      throw { code, message: "synthetic-private-marker" };
    });
    const outcome = await runBootstrap({ ...fixture.options, prepared });
    expect(outcome).toMatchObject({ reasonCode: "AUDIT_WRITE_FAILED", exitCode: 5,
      diagnostic: { phase: "COMMIT", auditPersisted: false } });
    expect(fixture.transaction).toHaveBeenCalledTimes(2);
    expect(fixture.tx.executiveActivityEvent.create).toHaveBeenCalledTimes(3);
    expect(fixture.state).toEqual(before);
    expect(JSON.stringify(outcome)).not.toContain("synthetic-private-marker");
  });

  it.each(["23514\n", "40001\n", "40P01\n"])("malformed SQLSTATE %j cannot establish rollback after commit", async code => {
    const fixture = serviceDouble();
    fixture.transaction.mockImplementationOnce(async operation => {
      await operation(fixture.tx as unknown as Prisma.TransactionClient);
      throw { code };
    });
    expect(bootstrapSqlState({ code })).toBeUndefined();
    const outcome = await runBootstrap(fixture.options);
    expect(outcome).toMatchObject({ reasonCode: "COMMIT_OUTCOME_UNKNOWN", exitCode: 6 });
    expect("diagnostic" in outcome && Object.hasOwn(outcome.diagnostic, "auditPersisted")).toBe(false);
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
  });

  it.each(["40000", "40002", "23514", "57014"])("confirmed %s commit abort retains the bounded failure diagnostic", async code => {
    const fixture = serviceDouble();
    fixture.transaction.mockImplementationOnce(async operation => {
      await operation(fixture.tx as unknown as Prisma.TransactionClient);
      throw { code };
    });
    // Classification only: this double does not simulate server rollback.
    expect(await runBootstrap(fixture.options)).toMatchObject({
      reasonCode: "TRANSACTION_FAILED", exitCode: 5, diagnostic: { phase: "COMMIT", auditPersisted: false },
    });
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
  });

  it("structural SQLSTATE extraction never guesses retryability from raw message text", () => {
    expect(bootstrapSqlState({ code: "P2010", meta: { code: "40P01" } })).toBe("40P01");
    expect(bootstrapSqlState({ meta: { driverAdapterError: { cause: { originalCode: "40001" } } } })).toBe("40001");
    expect(bootstrapSqlState({ code: "P2034", message: "deadlock 40P01" })).toBeUndefined();
    expect(bootstrapSqlState({ message: "40001" })).toBeUndefined();
    expect(bootstrapSqlState(null)).toBeUndefined();
  });

  it.each([
    { code: "40001", meta: { code: "40003" } },
    { code: "23514", cause: { originalCode: "08007" } },
    { meta: { code: "40P01", driverAdapterError: { cause: { originalCode: "40003" } } } },
    { cause: { originalCode: "40003", code: "40001" } },
  ])("conflicting SQLSTATE evidence cannot authorize a retry or claim rollback", async error => {
    expect(bootstrapSqlState(error)).toBeUndefined();
    const fixture = serviceDouble();
    fixture.transaction.mockRejectedValueOnce(error);
    expect(await runBootstrap(fixture.options)).toMatchObject({ reasonCode: "TRANSACTION_FAILED", exitCode: 5 });
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
  });

  it.each(["creation", "rejection"])("conflicting %s commit evidence preserves uncertainty and replay", async lane => {
    const fixture = serviceDouble();
    const prepared = preparedInput();
    if (lane === "rejection") {
      expect(await runBootstrap(fixture.options)).toMatchObject({ status: "CREATED" });
      prepared.envelope.owner.displayName = "Conflicting synthetic Owner";
      prepared.bootstrapHash = canonicalHash(prepared.envelope);
    }
    fixture.transaction.mockImplementationOnce(async operation => {
      await operation(fixture.tx as unknown as Prisma.TransactionClient);
      throw { code: "40001", meta: { code: "40003" }, message: "synthetic-private-marker" };
    });
    const beforeAttempts = fixture.transaction.mock.calls.length;
    const result = await runBootstrap({ ...fixture.options, prepared });
    expect(result).toMatchObject({ reasonCode: "COMMIT_OUTCOME_UNKNOWN", exitCode: 6 });
    expect("diagnostic" in result && Object.hasOwn(result.diagnostic, "auditPersisted")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("synthetic-private-marker");
    expect(fixture.transaction).toHaveBeenCalledTimes(beforeAttempts + 1);
    const before = structuredClone(fixture.state);
    expect(await runBootstrap(fixture.options)).toMatchObject({ status: "ALREADY_BOOTSTRAPPED" });
    expect(fixture.state).toEqual(before);
  });

  it("matching structural codes retain the verified adapter mapping", () => {
    expect(bootstrapSqlState({ code: "P2010", meta: { code: "40001",
      driverAdapterError: { cause: { originalCode: "40001", code: "40001" } } } })).toBe("40001");
    expect(bootstrapSqlState(Object.create({ code: "40001" }))).toBeUndefined();
  });

  it.each(["code", "meta", "cause"])("error %s getters never execute or escape a safe outcome", async key => {
    const getter = vi.fn(() => { throw new Error("synthetic-private-marker"); });
    const error = Object.defineProperty({}, key, { get: getter });
    expect(bootstrapSqlState(error)).toBeUndefined();
    const fixture = serviceDouble();
    fixture.transaction.mockImplementationOnce(async operation => {
      await operation(fixture.tx as unknown as Prisma.TransactionClient);
      throw error;
    });
    const result = await runBootstrap(fixture.options);
    expect(result).toMatchObject({ reasonCode: "COMMIT_OUTCOME_UNKNOWN", exitCode: 6 });
    expect(getter).not.toHaveBeenCalled();
    expect("diagnostic" in result && Object.hasOwn(result.diagnostic, "auditPersisted")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("synthetic-private-marker");
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("a revoked error proxy cannot escape classification after callback=%s", async afterCallback => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(bootstrapSqlState(proxy)).toBeUndefined();
    const fixture = serviceDouble();
    fixture.transaction.mockImplementationOnce(async operation => {
      if (afterCallback) await operation(fixture.tx as unknown as Prisma.TransactionClient);
      throw proxy;
    });
    expect(await runBootstrap(fixture.options)).toMatchObject({
      reasonCode: afterCallback ? "COMMIT_OUTCOME_UNKNOWN" : "TRANSACTION_FAILED", exitCode: afterCallback ? 6 : 5,
    });
    expect(fixture.transaction).toHaveBeenCalledTimes(1);
  });
});
