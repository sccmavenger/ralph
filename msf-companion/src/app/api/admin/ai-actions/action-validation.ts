export const AI_ACTION_SOURCE_TYPES = [
  "advisor_question",
  "advisor_feedback",
  "knowledge_gap",
  "token_usage",
  "kb_health",
  "kpi_anomaly",
] as const;

export const AI_ACTION_PRIORITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export const AI_ACTION_STATUSES = [
  "open",
  "investigating",
  "planned",
  "completed",
  "dismissed",
] as const;

export type AiActionSourceType = (typeof AI_ACTION_SOURCE_TYPES)[number];
export type AiActionPriority = (typeof AI_ACTION_PRIORITIES)[number];
export type AiActionStatus = (typeof AI_ACTION_STATUSES)[number];

const SOURCE_TYPE_SET = new Set<string>(AI_ACTION_SOURCE_TYPES);
const PRIORITY_SET = new Set<string>(AI_ACTION_PRIORITIES);
const STATUS_SET = new Set<string>(AI_ACTION_STATUSES);

const CREATE_FIELDS = new Set([
  "sourceType",
  "sourceId",
  "title",
  "description",
  "priority",
  "status",
  "owner",
  "notes",
  "actionUrl",
  "successMeasure",
  "baselineValue",
  "targetValue",
  "resultValue",
  "metricUnit",
  "reviewAt",
]);

const UPDATE_FIELDS = new Set([
  "title",
  "description",
  "priority",
  "status",
  "owner",
  "notes",
  "actionUrl",
  "successMeasure",
  "baselineValue",
  "targetValue",
  "resultValue",
  "metricUnit",
  "reviewAt",
]);

const LIMITS = {
  sourceId: 255,
  title: 240,
  description: 4_000,
  owner: 120,
  notes: 8_000,
  actionUrl: 1_000,
  successMeasure: 2_000,
  metricUnit: 80,
} as const;

export class AiActionValidationError extends Error {}

export interface CreateAiActionInput {
  sourceType: AiActionSourceType;
  sourceId: string;
  title: string;
  description?: string | null;
  priority?: AiActionPriority;
  status?: AiActionStatus;
  owner?: string | null;
  notes?: string | null;
  actionUrl?: string | null;
  successMeasure?: string | null;
  baselineValue?: number | null;
  targetValue?: number | null;
  resultValue?: number | null;
  metricUnit?: string | null;
  reviewAt?: Date | null;
}

export interface UpdateAiActionInput {
  title?: string;
  description?: string | null;
  priority?: AiActionPriority;
  status?: AiActionStatus;
  owner?: string | null;
  notes?: string | null;
  actionUrl?: string | null;
  successMeasure?: string | null;
  baselineValue?: number | null;
  targetValue?: number | null;
  resultValue?: number | null;
  metricUnit?: string | null;
  reviewAt?: Date | null;
}

interface AiActionRecord {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  owner: string | null;
  notes: string | null;
  actionUrl: string | null;
  successMeasure: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  resultValue: number | null;
  metricUnit: string | null;
  reviewAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const aiActionSelect = {
  id: true,
  sourceType: true,
  sourceId: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  owner: true,
  notes: true,
  actionUrl: true,
  successMeasure: true,
  baselineValue: true,
  targetValue: true,
  resultValue: true,
  metricUnit: true,
  reviewAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AiActionValidationError("Request body must be an object");
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
) {
  const unexpected = Object.keys(value).find((key) => !allowedFields.has(key));
  if (unexpected) {
    throw new AiActionValidationError(`Unexpected field: ${unexpected}`);
  }
}

function requiredText(
  value: unknown,
  field: keyof typeof LIMITS,
): string {
  if (typeof value !== "string") {
    throw new AiActionValidationError(`${field} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AiActionValidationError(`${field} is required`);
  }
  if (trimmed.length > LIMITS[field]) {
    throw new AiActionValidationError(
      `${field} must be ${LIMITS[field]} characters or fewer`,
    );
  }
  return trimmed;
}

function optionalText(
  value: unknown,
  field: keyof typeof LIMITS,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new AiActionValidationError(`${field} must be a string or null`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > LIMITS[field]) {
    throw new AiActionValidationError(
      `${field} must be ${LIMITS[field]} characters or fewer`,
    );
  }
  return trimmed;
}

function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: ReadonlySet<string>,
): T {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new AiActionValidationError(`Invalid ${field}`);
  }
  return value as T;
}

function optionalEnumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: ReadonlySet<string>,
): T | undefined {
  if (value === undefined) return undefined;
  return enumValue<T>(value, field, allowed);
}

function optionalFiniteNumber(
  value: unknown,
  field: string,
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AiActionValidationError(`${field} must be a finite number or null`);
  }
  return value;
}

function optionalDate(
  value: unknown,
  field: string,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new AiActionValidationError(`${field} must be an ISO date-time string or null`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) {
    throw new AiActionValidationError(`${field} must be an ISO date-time string or null`);
  }
  return parsed;
}

function validateActionUrl(value: string | null | undefined) {
  if (!value) return;

  if (value.startsWith("/")) {
    if (
      value.startsWith("//") ||
      value.includes("\\") ||
      /[\u0000-\u001f]/.test(value)
    ) {
      throw new AiActionValidationError(
        "actionUrl must be an http(s) URL or app path",
      );
    }
    return;
  }

  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("Invalid action URL");
    }
  } catch {
    throw new AiActionValidationError(
      "actionUrl must be an http(s) URL or app path",
    );
  }
}

export function parseCreateAiAction(value: unknown): CreateAiActionInput {
  const body = asRecord(value);
  rejectUnknownFields(body, CREATE_FIELDS);

  const sourceType = enumValue<AiActionSourceType>(
    body.sourceType,
    "sourceType",
    SOURCE_TYPE_SET,
  );
  const sourceId = requiredText(body.sourceId, "sourceId");
  const title = requiredText(body.title, "title");
  const description = optionalText(body.description, "description");
  const priority = optionalEnumValue<AiActionPriority>(
    body.priority,
    "priority",
    PRIORITY_SET,
  );
  const status = optionalEnumValue<AiActionStatus>(
    body.status,
    "status",
    STATUS_SET,
  );
  const owner = optionalText(body.owner, "owner");
  const notes = optionalText(body.notes, "notes");
  const actionUrl = optionalText(body.actionUrl, "actionUrl");
  validateActionUrl(actionUrl);
  const successMeasure = optionalText(body.successMeasure, "successMeasure");
  const baselineValue = optionalFiniteNumber(body.baselineValue, "baselineValue");
  const targetValue = optionalFiniteNumber(body.targetValue, "targetValue");
  const resultValue = optionalFiniteNumber(body.resultValue, "resultValue");
  const metricUnit = optionalText(body.metricUnit, "metricUnit");
  const reviewAt = optionalDate(body.reviewAt, "reviewAt");

  return {
    sourceType,
    sourceId,
    title,
    description,
    priority,
    status,
    owner,
    notes,
    actionUrl,
    successMeasure,
    baselineValue,
    targetValue,
    resultValue,
    metricUnit,
    reviewAt,
  };
}

export function parseUpdateAiAction(value: unknown): UpdateAiActionInput {
  const body = asRecord(value);
  rejectUnknownFields(body, UPDATE_FIELDS);
  if (Object.keys(body).length === 0) {
    throw new AiActionValidationError("At least one field is required");
  }

  const title =
    body.title === undefined ? undefined : requiredText(body.title, "title");
  const description = optionalText(body.description, "description");
  const priority = optionalEnumValue<AiActionPriority>(
    body.priority,
    "priority",
    PRIORITY_SET,
  );
  const status = optionalEnumValue<AiActionStatus>(
    body.status,
    "status",
    STATUS_SET,
  );
  const owner = optionalText(body.owner, "owner");
  const notes = optionalText(body.notes, "notes");
  const actionUrl = optionalText(body.actionUrl, "actionUrl");
  validateActionUrl(actionUrl);
  const successMeasure = optionalText(body.successMeasure, "successMeasure");
  const baselineValue = optionalFiniteNumber(body.baselineValue, "baselineValue");
  const targetValue = optionalFiniteNumber(body.targetValue, "targetValue");
  const resultValue = optionalFiniteNumber(body.resultValue, "resultValue");
  const metricUnit = optionalText(body.metricUnit, "metricUnit");
  const reviewAt = optionalDate(body.reviewAt, "reviewAt");

  return {
    title,
    description,
    priority,
    status,
    owner,
    notes,
    actionUrl,
    successMeasure,
    baselineValue,
    targetValue,
    resultValue,
    metricUnit,
    reviewAt,
  };
}

export function serializeAiAction(action: AiActionRecord) {
  return {
    id: action.id,
    sourceType: action.sourceType,
    sourceId: action.sourceId,
    title: action.title,
    description: action.description,
    priority: action.priority,
    status: action.status,
    owner: action.owner,
    notes: action.notes,
    actionUrl: action.actionUrl,
    successMeasure: action.successMeasure,
    baselineValue: action.baselineValue,
    targetValue: action.targetValue,
    resultValue: action.resultValue,
    metricUnit: action.metricUnit,
    reviewAt: action.reviewAt?.toISOString() ?? null,
    completedAt: action.completedAt?.toISOString() ?? null,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
  };
}
