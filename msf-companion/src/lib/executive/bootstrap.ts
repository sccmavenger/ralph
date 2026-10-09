import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { canonicalHash } from "./canonical";
import {
  appendBootstrapEvent, buildBootstrapDiagnostic, createBootstrapEvents, createRejectionEvent,
  isBootstrapRequestId, type BootstrapDiagnostic, type BootstrapEventData,
  type BootstrapPhase, type BootstrapReasonCode,
} from "./audit";

export type BootstrapRoleDefinition = {
  schemaVersion: 1; mission: string; responsibilities: string[]; nonResponsibilities: string[];
  tools: []; permissions: []; spendingAuthority: false;
};
export type BootstrapEnvelope = {
  bootstrapVersion: 1;
  office: { key: "msf-toolkit"; name: string; phase: "FOUNDATION"; executionMode: "DISABLED"; activeCharterAcceptanceId: null };
  owner: { displayName: string; contactEmail: string | null; status: "PENDING_ENROLLMENT"; authVersion: 1 };
  ceo: { roleKey: "CEO"; displayName: string; status: "ONBOARDING"; roleDefinitionVersion: 1;
    roleDefinition: BootstrapRoleDefinition; governingCharterAcceptanceId: null };
  charter: { version: 1; title: string; contentHash: string; sourceFileName: string; sourceFileHash: string;
    manifestHash: string; importedByOwnerId: null };
  auditSchemaVersion: 1;
};
export type BootstrapPrepared = {
  envelope: BootstrapEnvelope;
  bootstrapHash: string;
  charter: { contentMarkdown: string; contentHash: string; sourceFileName: string; sourceFileHash: string; title: string; manifestHash: string };
};
export type BootstrapIdentityState = {
  officeId: string; ownerId: string; ceoId: string; charterId: string;
  currentlyInert: boolean; ownerStatus: string; ceoStatus: string;
  activeCharterAcceptanceId: string | null; governingCharterAcceptanceId: string | null;
  eventSequences: { charterImported: string; bootstrapCompleted: string };
};
export type BootstrapOutcome =
  | ({ status: "CREATED" | "ALREADY_BOOTSTRAPPED"; requestId: string; bootstrapVersion: 1; exitCode: 0 } & BootstrapIdentityState)
  | { status: "READY_EMPTY"; requestId: string; bootstrapVersion: 1; currentlyInert: true; exitCode: 0 }
  | { status: "REJECTED" | "FAILED"; requestId: string; reasonCode: BootstrapReasonCode; exitCode: 2 | 3 | 4 | 5 | 6; diagnostic: BootstrapDiagnostic };
export type BootstrapOptions = {
  client: PrismaClient;
  mode: "check" | "apply";
  prepared: BootstrapPrepared;
  /** Mandatory real readiness check on this transaction; tests must not bypass it. */
  readiness: (transaction: Prisma.TransactionClient) => Promise<void>;
  /** Server-generated correlation only, never accepted from private Owner input. */
  requestId?: string;
};

/** Safe typed rejection for readiness/validation composition; never holds raw errors. */
export class BootstrapRejectionError extends Error {
  readonly reasonCode: BootstrapReasonCode;
  constructor(reasonCode: BootstrapReasonCode) {
    super(reasonCode);
    this.name = "BootstrapRejectionError";
    this.reasonCode = reasonCode;
  }
}

type StoredRow = Record<string, unknown>;
type FoundationSnapshot = {
  offices: StoredRow[]; owners: StoredRow[]; agents: StoredRow[]; charters: StoredRow[];
  births: StoredRow[]; counts: Record<string, number>;
};
const tables = ["ExecutiveOffice", "ExecutiveOwner", "ExecutiveAgent", "ExecutiveCharter",
  "ExecutiveOwnerCredential", "ExecutiveOwnerEnrollment", "ExecutiveOwnerChallenge", "ExecutiveOwnerSession",
  "ExecutiveAuthRateLimit", "ExecutiveCharterAcceptance", "ExecutiveActivityEvent"] as const;
const authTables = ["ExecutiveOwnerCredential", "ExecutiveOwnerEnrollment", "ExecutiveOwnerChallenge",
  "ExecutiveOwnerSession", "ExecutiveAuthRateLimit", "ExecutiveCharterAcceptance"] as const;
const reject = (reason: BootstrapReasonCode = "FOUNDATION_INCONSISTENT"): never => { throw new BootstrapRejectionError(reason); };
function requireCondition(value: unknown): asserts value { if (!value) reject(); }
const hashText = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const isHash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.exec(value)?.[0] === value;
const isId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.exec(value)?.[0] === value;
function milliseconds(value: unknown): number {
  const instant = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN;
  requireCondition(Number.isFinite(instant));
  return instant;
}
function object(value: unknown): StoredRow {
  requireCondition(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as StoredRow;
}

// A single SELECT gives the status/identity/pointer assessment one MVCC snapshot,
// even in READ COMMITTED. Counts avoid loading historical ephemeral auth data.
const snapshotSql = `SELECT pg_catalog.jsonb_build_object(
  'offices', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t)), '[]'::jsonb) FROM public."ExecutiveOffice" t),
  'owners', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t)), '[]'::jsonb) FROM public."ExecutiveOwner" t),
  'agents', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t)), '[]'::jsonb) FROM public."ExecutiveAgent" t),
  'charters', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t)), '[]'::jsonb) FROM public."ExecutiveCharter" t WHERE t."version"=1),
  'births', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) - 'sequence' || pg_catalog.jsonb_build_object('sequence', t."sequence"::text)), '[]'::jsonb)
    FROM public."ExecutiveActivityEvent" t WHERE t."eventType"='executive.bootstrap.completed'
    OR (t."eventType"='executive.charter.imported' AND t."subjectId" IN (SELECT c."id" FROM public."ExecutiveCharter" c WHERE c."version"=1))),
  'counts', pg_catalog.jsonb_build_object(${tables.map((table) => `'${table}', (SELECT count(*)::int FROM public."${table}")`).join(",")})
) AS snapshot`;

async function readFoundation(tx: Prisma.TransactionClient): Promise<FoundationSnapshot> {
  const rows = await tx.$queryRawUnsafe<{ snapshot: FoundationSnapshot }[]>(snapshotSql);
  requireCondition(rows.length === 1 && rows[0]?.snapshot);
  const state = rows[0].snapshot;
  for (const key of ["offices", "owners", "agents", "charters", "births"] as const) requireCondition(Array.isArray(state[key]));
  for (const table of tables) requireCondition(Number.isInteger(state.counts?.[table]) && state.counts[table] >= 0);
  return state;
}

function sameEvent(actual: StoredRow, expected: BootstrapEventData) {
  for (const key of ["officeId", "requestId", "actorType", "actorOwnerId", "eventType", "outcome", "subjectType", "subjectId"] as const) {
    requireCondition(actual[key] === expected[key]);
  }
  requireCondition(isId(actual.id) && typeof actual.sequence === "string" && /^[1-9][0-9]*$/.exec(actual.sequence)?.[0] === actual.sequence);
  requireCondition(milliseconds(actual.createdAt) === expected.createdAt.getTime()
    && milliseconds(actual.occurredAt) === expected.occurredAt.getTime());
  requireCondition(isDeepStrictEqual(actual.metadata, expected.metadata));
}

function validRole(value: unknown): value is BootstrapRoleDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const role = value as StoredRow;
  return Object.keys(role).sort().join("|") === ["schemaVersion", "mission", "responsibilities", "nonResponsibilities", "tools", "permissions", "spendingAuthority"].sort().join("|")
    && role.schemaVersion === 1 && typeof role.mission === "string" && role.mission.trim().length > 0
    && [role.responsibilities, role.nonResponsibilities].every((items) => Array.isArray(items) && items.every((entry) => typeof entry === "string"))
    && Array.isArray(role.tools) && role.tools.length === 0 && Array.isArray(role.permissions) && role.permissions.length === 0
    && role.spendingAuthority === false;
}

/** Check immutable persisted birth evidence first, independently of attempted inputs. */
function inspectExisting(state: FoundationSnapshot) {
  requireCondition(state.offices.length === 1 && state.owners.length === 1 && state.agents.length === 1 && state.charters.length === 1);
  const [office] = state.offices;
  const [owner] = state.owners;
  const [ceo] = state.agents;
  const [charter] = state.charters;
  requireCondition([office.id, owner.id, ceo.id, charter.id].every(isId));
  requireCondition(state.counts.ExecutiveOffice === 1 && state.counts.ExecutiveOwner === 1 && state.counts.ExecutiveAgent === 1);
  requireCondition(office.key === "msf-toolkit" && office.bootstrapVersion === 1 && isHash(office.bootstrapHash)
    && office.phase === "FOUNDATION" && office.executionMode === "DISABLED");
  requireCondition(owner.officeId === office.id && typeof owner.webauthnUserId === "string"
    && /^[A-Za-z0-9_-]{43}$/.exec(owner.webauthnUserId)?.[0] === owner.webauthnUserId);
  requireCondition(ceo.officeId === office.id && ceo.reportsToOwnerId === owner.id && ceo.roleKey === "CEO"
    && ceo.roleDefinitionVersion === 1 && validRole(ceo.roleDefinition));
  requireCondition(charter.officeId === office.id && charter.version === 1 && charter.importedByOwnerId === null
    && typeof charter.contentMarkdown === "string" && isHash(charter.contentHash)
    && hashText(charter.contentMarkdown) === charter.contentHash && isHash(charter.sourceFileHash)
    && typeof charter.sourceFileName === "string" && typeof charter.title === "string");
  requireCondition(office.activeCharterAcceptanceId === ceo.governingCharterAcceptanceId);
  requireCondition(office.activeCharterAcceptanceId === null || isId(office.activeCharterAcceptanceId));
  requireCondition(typeof owner.status === "string" && ["PENDING_ENROLLMENT", "ACTIVE", "LOCKED"].includes(owner.status)
    && Number.isInteger(owner.authVersion) && (owner.authVersion as number) >= 1 && ceo.status === "ONBOARDING");
  const at = new Date(milliseconds(office.createdAt));
  for (const row of [owner, ceo, charter]) requireCondition(milliseconds(row.createdAt) === at.getTime());
  for (const row of [office, owner, ceo]) requireCondition(milliseconds(row.updatedAt) >= at.getTime());
  const imports = state.births.filter((event) => event.eventType === "executive.charter.imported");
  const completions = state.births.filter((event) => event.eventType === "executive.bootstrap.completed");
  requireCondition(imports.length === 1 && completions.length === 1);
  const imported = imports[0];
  const completed = completions[0];
  const importMetadata = object(imported.metadata);
  requireCondition(isHash(importMetadata.manifestHash) && isBootstrapRequestId(imported.requestId));
  let expectedEvents: [BootstrapEventData, BootstrapEventData];
  try {
    expectedEvents = createBootstrapEvents({
      officeId: office.id as string, ownerId: owner.id as string, ceoId: ceo.id as string, charterId: charter.id as string,
      requestId: imported.requestId, at, bootstrapHash: office.bootstrapHash,
      contentHash: charter.contentHash, sourceFileName: charter.sourceFileName, sourceFileHash: charter.sourceFileHash,
      manifestHash: importMetadata.manifestHash,
    });
  } catch { return reject(); }
  const [expectedImport, expectedCompletion] = expectedEvents;
  sameEvent(imported, expectedImport);
  sameEvent(completed, expectedCompletion);
  requireCondition(imported.id !== completed.id && BigInt(imported.sequence as string) < BigInt(completed.sequence as string));
  const identity: BootstrapIdentityState = {
    officeId: office.id as string, ownerId: owner.id as string, ceoId: ceo.id as string, charterId: charter.id as string,
    currentlyInert: office.executionMode === "DISABLED" && ceo.roleDefinition.tools.length === 0
      && ceo.roleDefinition.permissions.length === 0 && ceo.roleDefinition.spendingAuthority === false,
    ownerStatus: owner.status, ceoStatus: ceo.status,
    activeCharterAcceptanceId: office.activeCharterAcceptanceId as string | null,
    governingCharterAcceptanceId: ceo.governingCharterAcceptanceId as string | null,
    eventSequences: { charterImported: imported.sequence as string, bootstrapCompleted: completed.sequence as string },
  };
  return { office, owner, ceo, charter, identity, manifestHash: importMetadata.manifestHash };
}

function assertSameRelease(existing: ReturnType<typeof inspectExisting>, prepared: BootstrapPrepared) {
  const { envelope, charter } = prepared;
  requireCondition(canonicalHash(existing.ceo.roleDefinition) === canonicalHash(envelope.ceo.roleDefinition)
    && existing.charter.title === charter.title && existing.charter.contentMarkdown === charter.contentMarkdown
    && existing.charter.contentHash === charter.contentHash && existing.charter.sourceFileName === charter.sourceFileName
    && existing.charter.sourceFileHash === charter.sourceFileHash && existing.manifestHash === charter.manifestHash);
}

function assertFresh(state: FoundationSnapshot, prepared: BootstrapPrepared, expectedIds: string[], handle: string, at: Date, requestId: string) {
  const existing = inspectExisting(state);
  assertSameRelease(existing, prepared);
  requireCondition(isDeepStrictEqual([existing.identity.officeId, existing.identity.ownerId, existing.identity.ceoId, existing.identity.charterId], expectedIds));
  requireCondition(existing.office.bootstrapHash === prepared.bootstrapHash
    && existing.office.name === prepared.envelope.office.name && existing.owner.displayName === prepared.envelope.owner.displayName
    && existing.owner.contactEmail === prepared.envelope.owner.contactEmail && existing.owner.status === "PENDING_ENROLLMENT"
    && existing.owner.authVersion === 1 && existing.owner.webauthnUserId === handle
    && existing.ceo.displayName === prepared.envelope.ceo.displayName && existing.ceo.status === "ONBOARDING"
    && existing.office.activeCharterAcceptanceId === null && existing.ceo.governingCharterAcceptanceId === null
    && state.counts.ExecutiveCharter === 1 && state.counts.ExecutiveActivityEvent === 2);
  for (const table of authTables) requireCondition(state.counts[table] === 0);
  requireCondition(state.births.every((event) => event.requestId === requestId));
  for (const row of [existing.office, existing.owner, existing.ceo, existing.charter]) requireCondition(milliseconds(row.createdAt) === at.getTime());
  for (const row of [existing.office, existing.owner, existing.ceo]) requireCondition(milliseconds(row.updatedAt) === at.getTime());
  return existing.identity;
}

async function databaseInstant(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRawUnsafe<{ at: Date }[]>("SELECT pg_catalog.clock_timestamp()::timestamptz(3) AS at");
  requireCondition(rows.length === 1 && rows[0].at instanceof Date && Number.isFinite(rows[0].at.getTime()));
  return rows[0].at;
}

function safeFailure(requestId: string, reasonCode: BootstrapReasonCode, phase: BootstrapPhase, auditPersisted?: boolean): BootstrapOutcome {
  const diagnostic = buildBootstrapDiagnostic({ requestId, reasonCode, phase, ...(auditPersisted === undefined ? {} : { auditPersisted }) });
  const exitCode = reasonCode === "COMMIT_OUTCOME_UNKNOWN" ? 6
    : ["INPUT_INVALID", "TARGET_INVALID", "PROVENANCE_INVALID"].includes(reasonCode) ? 2
      : ["READINESS_FAILED", "PRIVILEGE_FAILED"].includes(reasonCode) ? 3
        : ["BOOTSTRAP_CONFLICT", "FOUNDATION_INCONSISTENT"].includes(reasonCode) ? 4 : 5;
  return { status: diagnostic.kind === "executive.bootstrap.rejected" ? "REJECTED" : "FAILED", requestId, reasonCode, exitCode, diagnostic };
}

/** Only structural error codes are inspected. Never parse messages/SQL/parameters. */
export function bootstrapSqlState(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  const entry = error as Record<string, unknown>;
  const meta = entry.meta && typeof entry.meta === "object" ? entry.meta as Record<string, unknown> : {};
  const adapter = meta.driverAdapterError && typeof meta.driverAdapterError === "object"
    ? meta.driverAdapterError as Record<string, unknown> : {};
  const cause = adapter.cause && typeof adapter.cause === "object" ? adapter.cause as Record<string, unknown> : {};
  const directCause = entry.cause && typeof entry.cause === "object" ? entry.cause as Record<string, unknown> : {};
  for (const code of [entry.code, meta.code, cause.originalCode, cause.code, directCause.originalCode, directCause.code]) {
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) && !/^P\d{4}$/.test(code)) return code;
  }
}

function confirmedServerAbort(state: string | undefined) {
  return state !== undefined && (/^(22|23|25|40)/.test(state) || state === "55P03" || state === "57014");
}

/** Explicit operator service. No import-time client, environment read, logging or I/O. */
export async function runBootstrap(options: BootstrapOptions): Promise<BootstrapOutcome> {
  const requestId = options.requestId ?? randomUUID();
  if (!isBootstrapRequestId(requestId)) return safeFailure(randomUUID(), "INPUT_INVALID", "INPUT", false);
  if (!["check", "apply"].includes(options.mode) || typeof options.readiness !== "function") return safeFailure(requestId, "INPUT_INVALID", "INPUT", false);
  // Retain exactly these prevalidated bytes/values through both bounded attempts.
  let prepared: BootstrapPrepared;
  try {
    prepared = structuredClone(options.prepared);
    const { envelope, charter } = prepared;
    if (envelope.bootstrapVersion !== 1 || envelope.auditSchemaVersion !== 1
        || !isHash(prepared.bootstrapHash) || canonicalHash(envelope) !== prepared.bootstrapHash
        || !validRole(envelope.ceo.roleDefinition) || envelope.office.key !== "msf-toolkit"
        || envelope.office.phase !== "FOUNDATION" || envelope.office.executionMode !== "DISABLED"
        || envelope.office.activeCharterAcceptanceId !== null || envelope.owner.status !== "PENDING_ENROLLMENT"
        || envelope.owner.authVersion !== 1 || envelope.ceo.roleKey !== "CEO" || envelope.ceo.status !== "ONBOARDING"
        || envelope.ceo.roleDefinitionVersion !== 1 || envelope.ceo.governingCharterAcceptanceId !== null
        || envelope.charter.version !== 1 || envelope.charter.importedByOwnerId !== null
        || !isHash(charter.contentHash) || hashText(charter.contentMarkdown) !== charter.contentHash
        || !isHash(charter.sourceFileHash) || !isHash(charter.manifestHash)
        || !["contentHash", "sourceFileName", "sourceFileHash", "title", "manifestHash"].every(
          (key) => envelope.charter[key as keyof typeof envelope.charter] === charter[key as keyof typeof charter])) {
      return safeFailure(requestId, "INPUT_INVALID", "INPUT", false);
    }
  } catch {
    return safeFailure(requestId, "INPUT_INVALID", "INPUT", false);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    let phase: BootstrapPhase = "PREFLIGHT";
    let callbackReturned = false;
    try {
      return await options.client.$transaction(async (tx) => {
        if (options.mode === "check") await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        await tx.$executeRawUnsafe("SET LOCAL search_path = pg_catalog");
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5000ms'");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10000ms'");
        await tx.$executeRawUnsafe("SET LOCAL idle_in_transaction_session_timeout = '15000ms'");
        if (options.mode === "apply") {
          phase = "LOCK";
          await tx.$queryRawUnsafe("SELECT 1 AS locked FROM pg_catalog.pg_advisory_xact_lock($1::int, $2::int)", 1297303109, 1);
        }
        phase = "PREFLIGHT";
        await options.readiness(tx);
        phase = "REPLAY";
        const state = await readFoundation(tx);
        const empty = tables.every((table) => state.counts[table] === 0);
        let result: BootstrapOutcome;
        if (!empty) {
          const existing = inspectExisting(state);
          if (existing.office.bootstrapHash !== prepared.bootstrapHash || existing.office.bootstrapVersion !== prepared.envelope.bootstrapVersion) {
            if (options.mode === "apply") {
              phase = "AUDIT";
              await appendBootstrapEvent(tx, createRejectionEvent({ officeId: existing.identity.officeId, requestId, at: await databaseInstant(tx) }));
            }
            // Returning, not throwing, commits this bounded rejection audit.
            result = safeFailure(requestId, "BOOTSTRAP_CONFLICT", "REPLAY", options.mode === "apply");
          } else {
            assertSameRelease(existing, prepared);
            result = { status: "ALREADY_BOOTSTRAPPED", requestId, bootstrapVersion: 1, exitCode: 0, ...existing.identity };
          }
        } else if (options.mode === "check") {
          result = { status: "READY_EMPTY", requestId, bootstrapVersion: 1, currentlyInert: true, exitCode: 0 };
        } else {
          phase = "CREATE";
          const at = await databaseInstant(tx);
          const handle = randomBytes(32).toString("base64url");
          const { envelope, charter } = prepared;
          const offices = await tx.executiveOffice.createManyAndReturn({ data: [{
            key: "msf-toolkit", name: envelope.office.name, phase: "FOUNDATION", executionMode: "DISABLED",
            activeCharterAcceptanceId: null, bootstrapVersion: 1, bootstrapHash: prepared.bootstrapHash, createdAt: at, updatedAt: at,
          }] });
          requireCondition(offices.length === 1 && typeof offices[0].id === "string" && /^c[a-z0-9]{24}$/.exec(offices[0].id)?.[0] === offices[0].id);
          const office = offices[0];
          const owner = await tx.executiveOwner.create({ data: {
            displayName: envelope.owner.displayName, contactEmail: envelope.owner.contactEmail, status: "PENDING_ENROLLMENT",
            authVersion: 1, officeId: office.id, webauthnUserId: handle, createdAt: at, updatedAt: at,
          } });
          const imported = await tx.executiveCharter.create({ data: {
            officeId: office.id, version: 1, title: charter.title, contentMarkdown: charter.contentMarkdown,
            contentHash: charter.contentHash, sourceFileName: charter.sourceFileName, sourceFileHash: charter.sourceFileHash,
            importedByOwnerId: null, createdAt: at,
          } });
          const ceo = await tx.executiveAgent.create({ data: {
            roleKey: "CEO", displayName: envelope.ceo.displayName, status: "ONBOARDING", roleDefinitionVersion: 1,
            roleDefinition: envelope.ceo.roleDefinition, governingCharterAcceptanceId: null,
            officeId: office.id, reportsToOwnerId: owner.id, createdAt: at, updatedAt: at,
          } });
          phase = "AUDIT";
          const events = createBootstrapEvents({ officeId: office.id, ownerId: owner.id, ceoId: ceo.id, charterId: imported.id,
            requestId, at, bootstrapHash: prepared.bootstrapHash, contentHash: charter.contentHash,
            sourceFileName: charter.sourceFileName, sourceFileHash: charter.sourceFileHash, manifestHash: charter.manifestHash });
          await appendBootstrapEvent(tx, events[0]);
          await appendBootstrapEvent(tx, events[1]);
          phase = "CREATE";
          const identity = assertFresh(await readFoundation(tx), prepared, [office.id, owner.id, ceo.id, imported.id], handle, at, requestId);
          await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
          result = { status: "CREATED", requestId, bootstrapVersion: 1, exitCode: 0, ...identity };
        }
        phase = "COMMIT";
        callbackReturned = true;
        return result;
      }, { isolationLevel: options.mode === "check" ? "RepeatableRead" : "ReadCommitted", maxWait: 5000, timeout: 30_000 });
    } catch (error) {
      const state = bootstrapSqlState(error);
      // The interactive callback mutates phase; TS cannot follow that closure.
      const failedPhase = phase as BootstrapPhase;
      // A server-reported deadlock/serialization abort is not an unknown commit.
      // Audit failures are not retried, even when the underlying SQL is transient.
      if ((state === "40P01" || state === "40001") && failedPhase !== "AUDIT" && attempt === 0) {
        await delay(250);
        continue;
      }
      if (callbackReturned && !confirmedServerAbort(state)) return safeFailure(requestId, "COMMIT_OUTCOME_UNKNOWN", "COMMIT");
      if (error instanceof BootstrapRejectionError) return safeFailure(requestId, error.reasonCode, failedPhase, false);
      if (failedPhase === "LOCK" && state === "55P03") return safeFailure(requestId, "LOCK_TIMEOUT", failedPhase, false);
      if (failedPhase === "AUDIT") return safeFailure(requestId, "AUDIT_WRITE_FAILED", failedPhase, false);
      return safeFailure(requestId, "TRANSACTION_FAILED", failedPhase, false);
    }
  }
  return safeFailure(requestId, "TRANSACTION_FAILED", "CREATE", false);
}
