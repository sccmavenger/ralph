-- M1.2 only: additive, empty foundation. No bootstrap, grants or existing-table changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public."ExecutiveOffice" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'FOUNDATION',
    "executionMode" TEXT NOT NULL DEFAULT 'DISABLED',
    "bootstrapVersion" INTEGER NOT NULL,
    "bootstrapHash" TEXT NOT NULL,
    "activeCharterAcceptanceId" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ExecutiveOffice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE public."ExecutiveOwner" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "officeId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_ENROLLMENT',
    "webauthnUserId" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ExecutiveOwner_pkey" PRIMARY KEY ("id")
);
CREATE TABLE public."ExecutiveOwnerCredential" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL,
    "rpId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "transports" JSONB NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    CONSTRAINT "ExecutiveOwnerCredential_pkey" PRIMARY KEY ("id")
);
CREATE TABLE public."ExecutiveOwnerEnrollment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "operatorReason" TEXT NOT NULL,
    CONSTRAINT "ExecutiveOwnerEnrollment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE public."ExecutiveOwnerChallenge" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "browserBindingHash" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "sessionId" TEXT,
    "authVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    CONSTRAINT "ExecutiveOwnerChallenge_pkey" PRIMARY KEY ("id")
);
CREATE TABLE public."ExecutiveOwnerSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "authVersion" INTEGER NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "idleExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    CONSTRAINT "ExecutiveOwnerSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE public."ExecutiveAuthRateLimit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bucketKeyHash" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "blockedUntil" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ExecutiveAuthRateLimit_pkey" PRIMARY KEY ("id")
);
CREATE TABLE public."ExecutiveAgent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "officeId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "reportsToOwnerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ONBOARDING',
    "roleDefinitionVersion" INTEGER NOT NULL,
    "roleDefinition" JSONB NOT NULL,
    "governingCharterAcceptanceId" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ExecutiveAgent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE public."ExecutiveCharter" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "officeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceFileHash" TEXT NOT NULL,
    "importedByOwnerId" TEXT,
    CONSTRAINT "ExecutiveCharter_pkey" PRIMARY KEY ("id")
);
CREATE TABLE public."ExecutiveCharterAcceptance" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "officeId" TEXT NOT NULL,
    "charterId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerCredentialId" TEXT NOT NULL,
    "ownerSessionRef" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3) NOT NULL,
    "requestKey" TEXT NOT NULL,
    CONSTRAINT "ExecutiveCharterAcceptance_pkey" PRIMARY KEY ("id")
);
CREATE TABLE public."ExecutiveActivityEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "officeId" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorOwnerId" TEXT,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "requestId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutiveActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CASE protects array operations from malformed JSON; COALESCE closes SQL NULL
-- and missing-key escape paths. Only row-local immutable built-ins are used.
CREATE FUNCTION public.exec_foundation_json_valid(kind TEXT, payload JSONB)
RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
    SELECT COALESCE(CASE
        WHEN kind = 'TRANSPORTS' THEN CASE
            WHEN jsonb_typeof(payload) = 'array' THEN NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(payload) AS item(value)
                WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
            ) ELSE FALSE END
        WHEN kind = 'ROLE_DEFINITION' THEN CASE
            WHEN jsonb_typeof(payload) = 'object' THEN
                payload ?& ARRAY['schemaVersion', 'mission', 'responsibilities',
                    'nonResponsibilities', 'tools', 'permissions', 'spendingAuthority']
                AND payload - ARRAY['schemaVersion', 'mission', 'responsibilities',
                    'nonResponsibilities', 'tools', 'permissions', 'spendingAuthority'] = '{}'::jsonb
                AND payload -> 'schemaVersion' = '1'::jsonb
                AND jsonb_typeof(payload -> 'mission') = 'string'
                AND (payload ->> 'mission') ~ '[^[:space:]]'
                AND CASE WHEN jsonb_typeof(payload -> 'responsibilities') = 'array'
                    THEN NOT EXISTS (
                        SELECT 1 FROM jsonb_array_elements(payload -> 'responsibilities') AS item(value)
                        WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
                    ) ELSE FALSE END
                AND CASE WHEN jsonb_typeof(payload -> 'nonResponsibilities') = 'array'
                    THEN NOT EXISTS (
                        SELECT 1 FROM jsonb_array_elements(payload -> 'nonResponsibilities') AS item(value)
                        WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
                    ) ELSE FALSE END
                AND payload -> 'tools' = '[]'::jsonb
                AND payload -> 'permissions' = '[]'::jsonb
                AND payload -> 'spendingAuthority' = 'false'::jsonb
            ELSE FALSE END
        ELSE FALSE
    END, FALSE)
$function$;

ALTER TABLE public."ExecutiveOffice"
    ADD CONSTRAINT "ExecOffice_shape_ck" CHECK (
        "id" ~ '[^[:space:]]' AND "name" ~ '[^[:space:]]'
        AND ("activeCharterAcceptanceId" IS NULL OR "activeCharterAcceptanceId" ~ '[^[:space:]]')),
    ADD CONSTRAINT "ExecOffice_state_ck" CHECK (
        "key" = 'msf-toolkit' AND "phase" = 'FOUNDATION' AND "executionMode" = 'DISABLED'),
    ADD CONSTRAINT "ExecOffice_count_ck" CHECK ("bootstrapVersion" >= 1),
    ADD CONSTRAINT "ExecOffice_hash_ck" CHECK ("bootstrapHash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "ExecOffice_time_ck" CHECK ("updatedAt" >= "createdAt");
ALTER TABLE public."ExecutiveOwner"
    ADD CONSTRAINT "ExecOwner_shape_ck" CHECK (
        "id" ~ '[^[:space:]]' AND "officeId" ~ '[^[:space:]]' AND "displayName" ~ '[^[:space:]]'
        AND "webauthnUserId" ~ '^[A-Za-z0-9_-]{43}$'
        AND ("contactEmail" IS NULL OR ("contactEmail" ~ '[^[:space:]]' AND char_length("contactEmail") <= 320))),
    ADD CONSTRAINT "ExecOwner_state_ck" CHECK ("status" IN ('PENDING_ENROLLMENT', 'ACTIVE', 'LOCKED')),
    ADD CONSTRAINT "ExecOwner_count_ck" CHECK ("authVersion" >= 1),
    ADD CONSTRAINT "ExecOwner_time_ck" CHECK ("updatedAt" >= "createdAt");
ALTER TABLE public."ExecutiveOwnerCredential"
    ADD CONSTRAINT "ExecCredential_shape_ck" CHECK (
        "id" ~ '[^[:space:]]' AND "ownerId" ~ '[^[:space:]]'
        AND "credentialId" ~ '^[A-Za-z0-9_-]+$'
        AND "rpId" ~ '[^[:space:]]' AND "label" ~ '[^[:space:]]'
        AND octet_length("publicKey") > 0
        AND public.exec_foundation_json_valid('TRANSPORTS', "transports")),
    ADD CONSTRAINT "ExecCredential_state_ck" CHECK ("deviceType" IN ('singleDevice', 'multiDevice')),
    ADD CONSTRAINT "ExecCredential_count_ck" CHECK ("counter" >= 0),
    ADD CONSTRAINT "ExecCredential_time_ck" CHECK (
        ("lastUsedAt" IS NULL OR "lastUsedAt" >= "createdAt")
        AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt"));
ALTER TABLE public."ExecutiveOwnerEnrollment"
    ADD CONSTRAINT "ExecEnrollment_shape_ck" CHECK (
        "id" ~ '[^[:space:]]' AND "ownerId" ~ '[^[:space:]]'
        AND "operatorReason" ~ '[^[:space:]]' AND char_length("operatorReason") <= 1000
        AND ("consumedAt" IS NULL OR "revokedAt" IS NULL)),
    ADD CONSTRAINT "ExecEnrollment_state_ck" CHECK ("purpose" IN ('INITIAL', 'RECOVERY')),
    ADD CONSTRAINT "ExecEnrollment_hash_ck" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "ExecEnrollment_time_ck" CHECK (
        "expiresAt" > "createdAt"
        AND ("consumedAt" IS NULL OR ("createdAt" <= "consumedAt" AND "consumedAt" < "expiresAt"))
        AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt"));
ALTER TABLE public."ExecutiveOwnerChallenge"
    ADD CONSTRAINT "ExecChallenge_shape_ck" CHECK (
        "id" ~ '[^[:space:]]' AND "ownerId" ~ '[^[:space:]]'
        AND "challenge" ~ '^[A-Za-z0-9_-]+$'
        AND ("enrollmentId" IS NULL OR "enrollmentId" ~ '[^[:space:]]')
        AND ("sessionId" IS NULL OR "sessionId" ~ '[^[:space:]]')
        AND CASE "purpose"
            WHEN 'INITIAL_ENROLLMENT' THEN "enrollmentId" IS NOT NULL AND "sessionId" IS NULL
            WHEN 'RECOVERY_ENROLLMENT' THEN "enrollmentId" IS NOT NULL AND "sessionId" IS NULL
            WHEN 'SIGN_IN' THEN "enrollmentId" IS NULL AND "sessionId" IS NULL
            WHEN 'ADD_CREDENTIAL' THEN "enrollmentId" IS NULL AND "sessionId" IS NOT NULL
            WHEN 'REVERIFY' THEN "enrollmentId" IS NULL AND "sessionId" IS NOT NULL
            ELSE FALSE END),
    ADD CONSTRAINT "ExecChallenge_state_ck" CHECK (
        "purpose" IN ('INITIAL_ENROLLMENT', 'RECOVERY_ENROLLMENT', 'SIGN_IN', 'ADD_CREDENTIAL', 'REVERIFY')),
    ADD CONSTRAINT "ExecChallenge_count_ck" CHECK ("authVersion" >= 1),
    ADD CONSTRAINT "ExecChallenge_hash_ck" CHECK ("browserBindingHash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "ExecChallenge_time_ck" CHECK (
        "expiresAt" > "createdAt"
        AND ("consumedAt" IS NULL OR ("createdAt" <= "consumedAt" AND "consumedAt" < "expiresAt")));
ALTER TABLE public."ExecutiveOwnerSession"
    ADD CONSTRAINT "ExecSession_shape_ck" CHECK (
        "id" ~ '[^[:space:]]' AND "ownerId" ~ '[^[:space:]]' AND "credentialId" ~ '[^[:space:]]'),
    ADD CONSTRAINT "ExecSession_count_ck" CHECK ("authVersion" >= 1),
    ADD CONSTRAINT "ExecSession_hash_ck" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "ExecSession_time_ck" CHECK (
        "absoluteExpiresAt" > "createdAt"
        AND "createdAt" <= "lastSeenAt" AND "lastSeenAt" < "idleExpiresAt"
        AND "idleExpiresAt" <= "absoluteExpiresAt" AND "verifiedAt" <= "lastSeenAt"
        AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt"));
ALTER TABLE public."ExecutiveAuthRateLimit"
    ADD CONSTRAINT "ExecRateLimit_shape_ck" CHECK ("id" ~ '[^[:space:]]'),
    ADD CONSTRAINT "ExecRateLimit_count_ck" CHECK ("attemptCount" >= 0),
    ADD CONSTRAINT "ExecRateLimit_hash_ck" CHECK ("bucketKeyHash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "ExecRateLimit_time_ck" CHECK (
        "updatedAt" >= "createdAt"
        AND "createdAt" <= "windowStartedAt" AND "windowStartedAt" < "expiresAt"
        AND ("blockedUntil" IS NULL OR ("windowStartedAt" <= "blockedUntil" AND "blockedUntil" <= "expiresAt")));
ALTER TABLE public."ExecutiveAgent"
    ADD CONSTRAINT "ExecAgent_shape_ck" CHECK (
        "id" ~ '[^[:space:]]' AND "officeId" ~ '[^[:space:]]'
        AND "displayName" ~ '[^[:space:]]' AND "reportsToOwnerId" ~ '[^[:space:]]'
        AND ("governingCharterAcceptanceId" IS NULL OR "governingCharterAcceptanceId" ~ '[^[:space:]]')
        AND public.exec_foundation_json_valid('ROLE_DEFINITION', "roleDefinition")),
    ADD CONSTRAINT "ExecAgent_state_ck" CHECK ("roleKey" = 'CEO' AND "status" = 'ONBOARDING'),
    ADD CONSTRAINT "ExecAgent_count_ck" CHECK ("roleDefinitionVersion" >= 1),
    ADD CONSTRAINT "ExecAgent_time_ck" CHECK ("updatedAt" >= "createdAt");
ALTER TABLE public."ExecutiveCharter"
    ADD CONSTRAINT "ExecCharter_shape_ck" CHECK (
        "id" ~ '[^[:space:]]' AND "officeId" ~ '[^[:space:]]'
        AND "title" ~ '[^[:space:]]' AND "contentMarkdown" ~ '[^[:space:]]'
        AND "sourceFileName" ~ '[^[:space:]]'
        AND "sourceFileName" NOT IN ('.', '..')
        AND strpos("sourceFileName", '/') = 0 AND strpos("sourceFileName", chr(92)) = 0
        AND ("importedByOwnerId" IS NULL OR "importedByOwnerId" ~ '[^[:space:]]')),
    ADD CONSTRAINT "ExecCharter_count_ck" CHECK ("version" >= 1),
    ADD CONSTRAINT "ExecCharter_hash_ck" CHECK (
        "contentHash" ~ '^[0-9a-f]{64}$' AND "sourceFileHash" ~ '^[0-9a-f]{64}$'
        AND "contentHash" = encode(sha256(convert_to("contentMarkdown", 'UTF8')), 'hex'));
ALTER TABLE public."ExecutiveCharterAcceptance"
    ADD CONSTRAINT "ExecAcceptance_shape_ck" CHECK (
        "id" ~ '[^[:space:]]' AND "officeId" ~ '[^[:space:]]'
        AND "charterId" ~ '[^[:space:]]' AND "ownerId" ~ '[^[:space:]]'
        AND "ownerCredentialId" ~ '[^[:space:]]' AND "ownerSessionRef" ~ '[^[:space:]]'
        AND "requestKey" ~ '[^[:space:]]'),
    ADD CONSTRAINT "ExecAcceptance_hash_ck" CHECK ("contentHash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "ExecAcceptance_time_ck" CHECK (
        "verifiedAt" <= "acceptedAt" AND "acceptedAt" <= "createdAt"
        AND "acceptedAt" - "verifiedAt" <= INTERVAL '5 minutes');
ALTER TABLE public."ExecutiveActivityEvent"
    ADD CONSTRAINT "ExecEvent_shape_ck" CHECK (
        "id" ~ '[^[:space:]]' AND "officeId" ~ '[^[:space:]]'
        AND "eventType" ~ '[^[:space:]]' AND char_length("eventType") <= 100
        AND "subjectType" ~ '[^[:space:]]' AND char_length("subjectType") <= 100
        AND "requestId" ~ '[^[:space:]]' AND char_length("requestId") <= 200
        AND ("subjectId" IS NULL OR "subjectId" ~ '[^[:space:]]')
        AND ("actorOwnerId" IS NULL OR "actorOwnerId" ~ '[^[:space:]]')
        AND (("actorType" = 'OWNER') = ("actorOwnerId" IS NOT NULL))
        AND COALESCE(jsonb_typeof("metadata") = 'object', FALSE)),
    ADD CONSTRAINT "ExecEvent_state_ck" CHECK (
        "actorType" IN ('OWNER', 'OPERATOR', 'SYSTEM', 'ANONYMOUS')
        AND "outcome" IN ('SUCCESS', 'REJECTED', 'FAILED')),
    ADD CONSTRAINT "ExecEvent_count_ck" CHECK ("sequence" > 0);

CREATE UNIQUE INDEX "ExecOffice_key_uq" ON public."ExecutiveOffice"("key");
CREATE UNIQUE INDEX "ExecOwner_office_uq" ON public."ExecutiveOwner"("officeId");
CREATE UNIQUE INDEX "ExecOwner_handle_uq" ON public."ExecutiveOwner"("webauthnUserId");
CREATE UNIQUE INDEX "ExecOwner_scope_id_uq" ON public."ExecutiveOwner"("officeId", "id");
CREATE UNIQUE INDEX "ExecCredential_external_uq" ON public."ExecutiveOwnerCredential"("credentialId");
CREATE UNIQUE INDEX "ExecCredential_owner_id_uq" ON public."ExecutiveOwnerCredential"("ownerId", "id");
CREATE INDEX "ExecCredential_owner_revoked_idx" ON public."ExecutiveOwnerCredential"("ownerId", "revokedAt");
CREATE UNIQUE INDEX "ExecEnrollment_token_uq" ON public."ExecutiveOwnerEnrollment"("tokenHash");
CREATE UNIQUE INDEX "ExecEnrollment_owner_id_uq" ON public."ExecutiveOwnerEnrollment"("ownerId", "id");
CREATE INDEX "ExecEnrollment_owner_purpose_idx" ON public."ExecutiveOwnerEnrollment"("ownerId", "purpose", "createdAt");
CREATE INDEX "ExecEnrollment_expiry_idx" ON public."ExecutiveOwnerEnrollment"("expiresAt");
CREATE UNIQUE INDEX "ExecChallenge_value_uq" ON public."ExecutiveOwnerChallenge"("challenge");
CREATE INDEX "ExecChallenge_owner_expiry_idx" ON public."ExecutiveOwnerChallenge"("ownerId", "expiresAt");
CREATE INDEX "ExecChallenge_enrollment_idx" ON public."ExecutiveOwnerChallenge"("ownerId", "enrollmentId");
CREATE INDEX "ExecChallenge_session_idx" ON public."ExecutiveOwnerChallenge"("ownerId", "sessionId");
CREATE INDEX "ExecChallenge_expiry_idx" ON public."ExecutiveOwnerChallenge"("expiresAt");
CREATE UNIQUE INDEX "ExecSession_token_uq" ON public."ExecutiveOwnerSession"("tokenHash");
CREATE UNIQUE INDEX "ExecSession_owner_id_uq" ON public."ExecutiveOwnerSession"("ownerId", "id");
CREATE INDEX "ExecSession_credential_idx" ON public."ExecutiveOwnerSession"("ownerId", "credentialId");
CREATE INDEX "ExecSession_owner_revoked_idx" ON public."ExecutiveOwnerSession"("ownerId", "revokedAt");
CREATE INDEX "ExecSession_absolute_idx" ON public."ExecutiveOwnerSession"("absoluteExpiresAt");
CREATE INDEX "ExecSession_idle_idx" ON public."ExecutiveOwnerSession"("idleExpiresAt");
CREATE UNIQUE INDEX "ExecRateLimit_bucket_uq" ON public."ExecutiveAuthRateLimit"("bucketKeyHash");
CREATE INDEX "ExecRateLimit_expiry_idx" ON public."ExecutiveAuthRateLimit"("expiresAt");
CREATE UNIQUE INDEX "ExecAgent_office_role_uq" ON public."ExecutiveAgent"("officeId", "roleKey");
CREATE INDEX "ExecAgent_owner_idx" ON public."ExecutiveAgent"("officeId", "reportsToOwnerId");
CREATE INDEX "ExecAgent_acceptance_idx" ON public."ExecutiveAgent"("officeId", "governingCharterAcceptanceId");
CREATE UNIQUE INDEX "ExecCharter_version_uq" ON public."ExecutiveCharter"("officeId", "version");
CREATE UNIQUE INDEX "ExecCharter_scope_hash_uq" ON public."ExecutiveCharter"("officeId", "id", "contentHash");
CREATE INDEX "ExecCharter_importer_idx" ON public."ExecutiveCharter"("officeId", "importedByOwnerId");
CREATE UNIQUE INDEX "ExecAcceptance_request_uq" ON public."ExecutiveCharterAcceptance"("requestKey");
CREATE UNIQUE INDEX "ExecAcceptance_scope_id_uq" ON public."ExecutiveCharterAcceptance"("officeId", "id");
CREATE INDEX "ExecAcceptance_time_idx" ON public."ExecutiveCharterAcceptance"("officeId", "acceptedAt", "id");
CREATE INDEX "ExecAcceptance_charter_idx" ON public."ExecutiveCharterAcceptance"("officeId", "charterId", "contentHash");
CREATE INDEX "ExecAcceptance_owner_idx" ON public."ExecutiveCharterAcceptance"("officeId", "ownerId");
CREATE INDEX "ExecAcceptance_credential_idx" ON public."ExecutiveCharterAcceptance"("ownerId", "ownerCredentialId");
CREATE UNIQUE INDEX "ExecEvent_sequence_uq" ON public."ExecutiveActivityEvent"("sequence");
CREATE INDEX "ExecEvent_feed_idx" ON public."ExecutiveActivityEvent"("officeId", "sequence");
CREATE INDEX "ExecEvent_type_idx" ON public."ExecutiveActivityEvent"("officeId", "eventType", "sequence");
CREATE INDEX "ExecEvent_actor_idx" ON public."ExecutiveActivityEvent"("officeId", "actorOwnerId", "sequence");
CREATE INDEX "ExecEvent_request_idx" ON public."ExecutiveActivityEvent"("officeId", "requestId");

-- All twenty FKs are immediate MATCH SIMPLE, explicitly RESTRICT in both directions.
ALTER TABLE public."ExecutiveOwner" ADD CONSTRAINT "ExecOwnerOffice_fk" FOREIGN KEY ("officeId") REFERENCES public."ExecutiveOffice"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveOwnerCredential" ADD CONSTRAINT "ExecCredentialOwner_fk" FOREIGN KEY ("ownerId") REFERENCES public."ExecutiveOwner"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveOwnerEnrollment" ADD CONSTRAINT "ExecEnrollmentOwner_fk" FOREIGN KEY ("ownerId") REFERENCES public."ExecutiveOwner"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveOwnerChallenge" ADD CONSTRAINT "ExecChallengeOwner_fk" FOREIGN KEY ("ownerId") REFERENCES public."ExecutiveOwner"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveOwnerSession" ADD CONSTRAINT "ExecSessionOwner_fk" FOREIGN KEY ("ownerId") REFERENCES public."ExecutiveOwner"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveOwnerSession" ADD CONSTRAINT "ExecSessionCredential_fk" FOREIGN KEY ("ownerId", "credentialId") REFERENCES public."ExecutiveOwnerCredential"("ownerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveOwnerChallenge" ADD CONSTRAINT "ExecChallengeEnrollment_fk" FOREIGN KEY ("ownerId", "enrollmentId") REFERENCES public."ExecutiveOwnerEnrollment"("ownerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveOwnerChallenge" ADD CONSTRAINT "ExecChallengeSession_fk" FOREIGN KEY ("ownerId", "sessionId") REFERENCES public."ExecutiveOwnerSession"("ownerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveAgent" ADD CONSTRAINT "ExecAgentOffice_fk" FOREIGN KEY ("officeId") REFERENCES public."ExecutiveOffice"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveAgent" ADD CONSTRAINT "ExecAgentOwner_fk" FOREIGN KEY ("officeId", "reportsToOwnerId") REFERENCES public."ExecutiveOwner"("officeId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveCharter" ADD CONSTRAINT "ExecCharterOffice_fk" FOREIGN KEY ("officeId") REFERENCES public."ExecutiveOffice"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveCharter" ADD CONSTRAINT "ExecCharterImporter_fk" FOREIGN KEY ("officeId", "importedByOwnerId") REFERENCES public."ExecutiveOwner"("officeId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveCharterAcceptance" ADD CONSTRAINT "ExecAcceptanceOffice_fk" FOREIGN KEY ("officeId") REFERENCES public."ExecutiveOffice"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveCharterAcceptance" ADD CONSTRAINT "ExecAcceptanceOwner_fk" FOREIGN KEY ("officeId", "ownerId") REFERENCES public."ExecutiveOwner"("officeId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveCharterAcceptance" ADD CONSTRAINT "ExecAcceptanceCredential_fk" FOREIGN KEY ("ownerId", "ownerCredentialId") REFERENCES public."ExecutiveOwnerCredential"("ownerId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveCharterAcceptance" ADD CONSTRAINT "ExecAcceptanceCharter_fk" FOREIGN KEY ("officeId", "charterId", "contentHash") REFERENCES public."ExecutiveCharter"("officeId", "id", "contentHash") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveOffice" ADD CONSTRAINT "ExecOfficeActiveAcceptance_fk" FOREIGN KEY ("id", "activeCharterAcceptanceId") REFERENCES public."ExecutiveCharterAcceptance"("officeId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveAgent" ADD CONSTRAINT "ExecAgentAcceptance_fk" FOREIGN KEY ("officeId", "governingCharterAcceptanceId") REFERENCES public."ExecutiveCharterAcceptance"("officeId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveActivityEvent" ADD CONSTRAINT "ExecEventOffice_fk" FOREIGN KEY ("officeId") REFERENCES public."ExecutiveOffice"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."ExecutiveActivityEvent" ADD CONSTRAINT "ExecEventOwner_fk" FOREIGN KEY ("officeId", "actorOwnerId") REFERENCES public."ExecutiveOwner"("officeId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
