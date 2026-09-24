import type { Prisma } from "../../generated/prisma/client";

export const BOOTSTRAP_PHASES = ["INPUT", "PREFLIGHT", "LOCK", "CREATE", "AUDIT", "COMMIT", "REPLAY"] as const;
export type BootstrapPhase = typeof BOOTSTRAP_PHASES[number];
export const BOOTSTRAP_REASON_CODES = [
  "INPUT_INVALID", "TARGET_INVALID", "PROVENANCE_INVALID", "READINESS_FAILED", "PRIVILEGE_FAILED",
  "BOOTSTRAP_CONFLICT", "FOUNDATION_INCONSISTENT", "LOCK_TIMEOUT", "TRANSACTION_FAILED",
  "AUDIT_WRITE_FAILED", "COMMIT_OUTCOME_UNKNOWN",
] as const;
export type BootstrapReasonCode = typeof BOOTSTRAP_REASON_CODES[number];

export type BootstrapDiagnostic = {
  kind: "executive.bootstrap.rejected" | "executive.bootstrap.failed";
  requestId: string;
  reasonCode: BootstrapReasonCode;
  phase: BootstrapPhase;
  auditPersisted?: boolean;
};

export type BootstrapEventData = {
  officeId: string;
  createdAt: Date;
  occurredAt: Date;
  requestId: string;
  actorType: "OPERATOR";
  actorOwnerId: null;
  eventType: "executive.charter.imported" | "executive.bootstrap.completed" | "executive.bootstrap.rejected";
  outcome: "SUCCESS" | "REJECTED";
  subjectType: "ExecutiveCharter" | "ExecutiveOffice";
  subjectId: string;
  metadata: Prisma.InputJsonObject;
};

export type BootstrapEventInput = {
  officeId: string;
  ownerId: string;
  ceoId: string;
  charterId: string;
  requestId: string;
  at: Date;
  bootstrapHash: string;
  contentHash: string;
  sourceFileName: string;
  sourceFileHash: string;
  manifestHash: string;
};

const invalid = () => { throw new Error("AUDIT_EVENT_INVALID"); };
const matches = (value: unknown, pattern: RegExp): value is string => typeof value === "string" && pattern.exec(value)?.[0] === value;
const hash = (value: unknown) => matches(value, /^[0-9a-f]{64}$/);
const reference = (value: unknown) => matches(value, /^[A-Za-z0-9_-]{1,200}$/);
export const isBootstrapRequestId = (value: unknown): value is string => matches(value,
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

function exactKeys(value: object, expected: string[]) {
  if (Object.keys(value).sort().join("|") !== [...expected].sort().join("|")) invalid();
}

function validInstant(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function baseEvent(officeId: string, requestId: string, at: Date) {
  if (!reference(officeId) || !isBootstrapRequestId(requestId) || !validInstant(at)) invalid();
  return { officeId, requestId, createdAt: new Date(at.getTime()), occurredAt: new Date(at.getTime()),
    actorType: "OPERATOR" as const, actorOwnerId: null };
}

/** Closed constructors: no input/Owner text or arbitrary metadata can flow here. */
export function createBootstrapEvents(input: BootstrapEventInput): [BootstrapEventData, BootstrapEventData] {
  exactKeys(input, ["officeId", "ownerId", "ceoId", "charterId", "requestId", "at", "bootstrapHash",
    "contentHash", "sourceFileName", "sourceFileHash", "manifestHash"]);
  if (![input.ownerId, input.ceoId, input.charterId].every(reference)
      || ![input.bootstrapHash, input.contentHash, input.sourceFileHash, input.manifestHash].every(hash)
      || !matches(input.sourceFileName, /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$/)) invalid();
  const common = baseEvent(input.officeId, input.requestId, input.at);
  const imported: BootstrapEventData = {
    ...common, eventType: "executive.charter.imported", outcome: "SUCCESS",
    subjectType: "ExecutiveCharter", subjectId: input.charterId,
    metadata: { schemaVersion: 1, bootstrapVersion: 1, charterVersion: 1, contentHash: input.contentHash,
      sourceFileName: input.sourceFileName, sourceFileHash: input.sourceFileHash,
      manifestHash: input.manifestHash, importMethod: "OPERATOR_BOOTSTRAP" },
  };
  const completed: BootstrapEventData = {
    ...common, eventType: "executive.bootstrap.completed", outcome: "SUCCESS",
    subjectType: "ExecutiveOffice", subjectId: input.officeId,
    metadata: { schemaVersion: 1, bootstrapVersion: 1, bootstrapHash: input.bootstrapHash,
      ownerId: input.ownerId, ceoId: input.ceoId, charterId: input.charterId,
      charterContentHash: input.contentHash, manifestHash: input.manifestHash,
      phase: "FOUNDATION", executionMode: "DISABLED", ownerStatus: "PENDING_ENROLLMENT",
      ceoStatus: "ONBOARDING", acceptanceCreated: false },
  };
  validateBootstrapEvent(imported);
  validateBootstrapEvent(completed);
  return [imported, completed];
}

export function createRejectionEvent(input: { officeId: string; requestId: string; at: Date }): BootstrapEventData {
  exactKeys(input, ["officeId", "requestId", "at"]);
  const event: BootstrapEventData = {
    ...baseEvent(input.officeId, input.requestId, input.at),
    eventType: "executive.bootstrap.rejected", outcome: "REJECTED",
    subjectType: "ExecutiveOffice", subjectId: input.officeId,
    metadata: { schemaVersion: 1, reasonCode: "BOOTSTRAP_CONFLICT", bootstrapVersion: 1, auditPersisted: true },
  };
  validateBootstrapEvent(event);
  return event;
}

/** Defense in depth at append boundary; reject extra keys instead of redacting them. */
export function validateBootstrapEvent(event: BootstrapEventData): void {
  exactKeys(event, ["officeId", "createdAt", "occurredAt", "requestId", "actorType", "actorOwnerId",
    "eventType", "outcome", "subjectType", "subjectId", "metadata"]);
  if (!reference(event.officeId) || !reference(event.subjectId) || !isBootstrapRequestId(event.requestId)
      || !validInstant(event.createdAt) || !validInstant(event.occurredAt)
      || event.createdAt.getTime() !== event.occurredAt.getTime()
      || event.actorType !== "OPERATOR" || event.actorOwnerId !== null
      || !event.metadata || Array.isArray(event.metadata) || typeof event.metadata !== "object") invalid();
  const metadata = event.metadata;
  if (metadata.schemaVersion !== 1 || metadata.bootstrapVersion !== 1) invalid();
  if (event.eventType === "executive.charter.imported") {
    exactKeys(metadata, ["schemaVersion", "bootstrapVersion", "charterVersion", "contentHash",
      "sourceFileName", "sourceFileHash", "manifestHash", "importMethod"]);
    if (event.outcome !== "SUCCESS" || event.subjectType !== "ExecutiveCharter"
        || metadata.charterVersion !== 1 || metadata.importMethod !== "OPERATOR_BOOTSTRAP"
        || ![metadata.contentHash, metadata.sourceFileHash, metadata.manifestHash].every(hash)
        || typeof metadata.sourceFileName !== "string"
        || !matches(metadata.sourceFileName, /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$/)) invalid();
  } else if (event.eventType === "executive.bootstrap.completed") {
    exactKeys(metadata, ["schemaVersion", "bootstrapVersion", "bootstrapHash", "ownerId", "ceoId", "charterId",
      "charterContentHash", "manifestHash", "phase", "executionMode", "ownerStatus", "ceoStatus", "acceptanceCreated"]);
    if (event.outcome !== "SUCCESS" || event.subjectType !== "ExecutiveOffice" || event.subjectId !== event.officeId
        || ![metadata.bootstrapHash, metadata.charterContentHash, metadata.manifestHash].every(hash)
        || ![metadata.ownerId, metadata.ceoId, metadata.charterId].every(reference)
        || metadata.phase !== "FOUNDATION" || metadata.executionMode !== "DISABLED"
        || metadata.ownerStatus !== "PENDING_ENROLLMENT" || metadata.ceoStatus !== "ONBOARDING"
        || metadata.acceptanceCreated !== false) invalid();
  } else if (event.eventType === "executive.bootstrap.rejected") {
    exactKeys(metadata, ["schemaVersion", "reasonCode", "bootstrapVersion", "auditPersisted"]);
    if (event.outcome !== "REJECTED" || event.subjectType !== "ExecutiveOffice" || event.subjectId !== event.officeId
        || metadata.reasonCode !== "BOOTSTRAP_CONFLICT" || metadata.auditPersisted !== true) invalid();
  } else invalid();
  if (Buffer.byteLength(JSON.stringify(metadata), "utf8") > 8192) invalid();
}

/** The caller supplies its interactive transaction; this never opens a client. */
export async function appendBootstrapEvent(tx: Prisma.TransactionClient, event: BootstrapEventData) {
  validateBootstrapEvent(event);
  return tx.executiveActivityEvent.create({ data: event });
}

/** Unknown exception messages/stacks never enter this closed public diagnostic. */
export function buildBootstrapDiagnostic(input: {
  requestId: string; reasonCode: BootstrapReasonCode; phase: BootstrapPhase; auditPersisted?: boolean;
}): BootstrapDiagnostic {
  exactKeys(input, input.auditPersisted === undefined
    ? ["requestId", "reasonCode", "phase"] : ["requestId", "reasonCode", "phase", "auditPersisted"]);
  if (!isBootstrapRequestId(input.requestId) || !(BOOTSTRAP_REASON_CODES as readonly string[]).includes(input.reasonCode)
      || !(BOOTSTRAP_PHASES as readonly string[]).includes(input.phase)
      || (input.auditPersisted !== undefined && typeof input.auditPersisted !== "boolean")) invalid();
  if (input.reasonCode === "COMMIT_OUTCOME_UNKNOWN" && input.auditPersisted !== undefined) invalid();
  const rejected = ["INPUT_INVALID", "TARGET_INVALID", "PROVENANCE_INVALID", "READINESS_FAILED",
    "PRIVILEGE_FAILED", "BOOTSTRAP_CONFLICT", "FOUNDATION_INCONSISTENT"].includes(input.reasonCode);
  return {
    kind: rejected ? "executive.bootstrap.rejected" : "executive.bootstrap.failed",
    requestId: input.requestId, reasonCode: input.reasonCode, phase: input.phase,
    ...(input.auditPersisted === undefined ? {} : { auditPersisted: input.auditPersisted }),
  };
}
