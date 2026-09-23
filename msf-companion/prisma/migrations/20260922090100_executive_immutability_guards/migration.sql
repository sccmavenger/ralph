-- Both foundation migrations are required before any later bootstrap is ready.
-- These invoker guards do not defend against a privileged DDL administrator.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.exec_reject_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'ExecHistory_append_only', CONSTRAINT = 'ExecHistory_append_only';
END
$function$;

CREATE FUNCTION public.exec_reject_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'ExecFoundation_no_truncate', CONSTRAINT = 'ExecFoundation_no_truncate';
END
$function$;

CREATE FUNCTION public.exec_reject_identity_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'ExecIdentity_no_delete', CONSTRAINT = 'ExecIdentity_no_delete';
END
$function$;

CREATE FUNCTION public.exec_guard_foundation_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
    mutable_columns TEXT[];
    transition_invalid BOOLEAN := FALSE;
BEGIN
    -- Remove only the exhaustive allowed fields. Any other changed field,
    -- including id/createdAt or a future new column, fails closed.
    CASE TG_TABLE_NAME
        WHEN 'ExecutiveOffice' THEN
            mutable_columns := ARRAY['name', 'activeCharterAcceptanceId', 'updatedAt'];
            transition_invalid := OLD."activeCharterAcceptanceId" IS NOT NULL
                AND NEW."activeCharterAcceptanceId" IS NULL;
        WHEN 'ExecutiveOwner' THEN
            mutable_columns := ARRAY['displayName', 'contactEmail', 'status', 'authVersion', 'updatedAt'];
            transition_invalid := NEW."authVersion" < OLD."authVersion";
        WHEN 'ExecutiveOwnerCredential' THEN
            mutable_columns := ARRAY['counter', 'label', 'transports', 'backedUp', 'lastUsedAt', 'revokedAt'];
            transition_invalid := (OLD."lastUsedAt" IS NOT NULL
                AND (NEW."lastUsedAt" IS NULL OR NEW."lastUsedAt" < OLD."lastUsedAt"))
                OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt");
        WHEN 'ExecutiveOwnerEnrollment' THEN
            mutable_columns := ARRAY['consumedAt', 'revokedAt'];
            transition_invalid := (OLD."consumedAt" IS NOT NULL AND NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt")
                OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt");
        WHEN 'ExecutiveOwnerChallenge' THEN
            mutable_columns := ARRAY['consumedAt'];
            transition_invalid := OLD."consumedAt" IS NOT NULL AND NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt";
        WHEN 'ExecutiveOwnerSession' THEN
            mutable_columns := ARRAY['verifiedAt', 'lastSeenAt', 'idleExpiresAt', 'revokedAt'];
            transition_invalid := NEW."verifiedAt" < OLD."verifiedAt"
                OR NEW."lastSeenAt" < OLD."lastSeenAt" OR NEW."idleExpiresAt" < OLD."idleExpiresAt"
                OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt");
        WHEN 'ExecutiveAuthRateLimit' THEN
            mutable_columns := ARRAY['attemptCount', 'windowStartedAt', 'blockedUntil', 'expiresAt', 'updatedAt'];
            transition_invalid := NEW."windowStartedAt" < OLD."windowStartedAt"
                OR (NEW."attemptCount" < OLD."attemptCount" AND NEW."windowStartedAt" <= OLD."windowStartedAt");
        WHEN 'ExecutiveAgent' THEN
            mutable_columns := ARRAY['displayName', 'governingCharterAcceptanceId', 'updatedAt'];
            transition_invalid := OLD."governingCharterAcceptanceId" IS NOT NULL
                AND NEW."governingCharterAcceptanceId" IS NULL;
        ELSE
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'ExecFoundation_unknown_update', CONSTRAINT = 'ExecFoundation_unknown_update';
    END CASE;

    IF (to_jsonb(NEW) - mutable_columns) IS DISTINCT FROM (to_jsonb(OLD) - mutable_columns) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'ExecFoundation_immutable_field', CONSTRAINT = 'ExecFoundation_immutable_field';
    END IF;
    IF transition_invalid THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'ExecFoundation_terminal_or_monotonic', CONSTRAINT = 'ExecFoundation_terminal_or_monotonic';
    END IF;
    RETURN NEW;
END
$function$;

CREATE FUNCTION public.exec_check_challenge_grant()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
    expected_purpose TEXT;
    grant_purpose TEXT;
BEGIN
    expected_purpose := CASE NEW."purpose"
        WHEN 'INITIAL_ENROLLMENT' THEN 'INITIAL'
        WHEN 'RECOVERY_ENROLLMENT' THEN 'RECOVERY'
        ELSE NULL END;
    IF expected_purpose IS NOT NULL THEN
        SELECT enrollment."purpose" INTO grant_purpose
        FROM public."ExecutiveOwnerEnrollment" AS enrollment
        WHERE enrollment."ownerId" = NEW."ownerId" AND enrollment."id" = NEW."enrollmentId";
        IF grant_purpose IS DISTINCT FROM expected_purpose THEN
            RAISE EXCEPTION USING ERRCODE = '23514',
                MESSAGE = 'ExecChallenge_grant_purpose', CONSTRAINT = 'ExecChallenge_grant_purpose';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;

CREATE FUNCTION public.exec_lock_agent_office()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
    -- Serialize Agent writes with Office updates. Later services must acquire
    -- the Office row first; a deadlock/serialization failure must be retried.
    PERFORM 1 FROM public."ExecutiveOffice" AS office
    WHERE office."id" = NEW."officeId" FOR UPDATE;
    RETURN NEW;
END
$function$;

CREATE FUNCTION public.exec_check_charter_pointer_pair()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
    office_id TEXT;
    office_acceptance TEXT;
    agent_acceptance TEXT;
    agent_exists BOOLEAN;
BEGIN
    -- Separate statements avoid resolving a field absent from the other row type.
    IF TG_TABLE_NAME = 'ExecutiveOffice' THEN
        office_id := NEW."id";
    ELSIF TG_TABLE_NAME = 'ExecutiveAgent' THEN
        office_id := NEW."officeId";
    END IF;
    IF office_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'ExecFoundation_unknown_pointer', CONSTRAINT = 'ExecFoundation_unknown_pointer';
    END IF;

    -- Query the final stored state, never an intermediate queued NEW pointer.
    SELECT office."activeCharterAcceptanceId" INTO office_acceptance
    FROM public."ExecutiveOffice" AS office WHERE office."id" = office_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'ExecFoundation_office_missing', CONSTRAINT = 'ExecFoundation_office_missing';
    END IF;
    SELECT agent."governingCharterAcceptanceId" INTO agent_acceptance
    FROM public."ExecutiveAgent" AS agent
    WHERE agent."officeId" = office_id AND agent."roleKey" = 'CEO';
    agent_exists := FOUND;

    IF (agent_exists AND agent_acceptance IS DISTINCT FROM office_acceptance)
        OR (NOT agent_exists AND office_acceptance IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = 'ExecFoundation_charter_pointer_pair', CONSTRAINT = 'ExecFoundation_charter_pointer_pair';
    END IF;
    RETURN NULL;
END
$function$;

CREATE TRIGGER exec_history_write_guard BEFORE UPDATE OR DELETE ON public."ExecutiveCharter"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_history_mutation();
CREATE TRIGGER exec_history_write_guard BEFORE UPDATE OR DELETE ON public."ExecutiveCharterAcceptance"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_history_mutation();
CREATE TRIGGER exec_history_write_guard BEFORE UPDATE OR DELETE ON public."ExecutiveActivityEvent"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_history_mutation();

CREATE TRIGGER exec_truncate_guard BEFORE TRUNCATE ON public."ExecutiveCharter"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_truncate();
CREATE TRIGGER exec_truncate_guard BEFORE TRUNCATE ON public."ExecutiveCharterAcceptance"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_truncate();
CREATE TRIGGER exec_truncate_guard BEFORE TRUNCATE ON public."ExecutiveActivityEvent"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_truncate();
CREATE TRIGGER exec_truncate_guard BEFORE TRUNCATE ON public."ExecutiveOffice"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_truncate();
CREATE TRIGGER exec_truncate_guard BEFORE TRUNCATE ON public."ExecutiveOwner"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_truncate();
CREATE TRIGGER exec_truncate_guard BEFORE TRUNCATE ON public."ExecutiveAgent"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_truncate();
CREATE TRIGGER exec_truncate_guard BEFORE TRUNCATE ON public."ExecutiveOwnerCredential"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_truncate();

CREATE TRIGGER exec_identity_delete_guard BEFORE DELETE ON public."ExecutiveOffice"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_identity_delete();
CREATE TRIGGER exec_identity_delete_guard BEFORE DELETE ON public."ExecutiveOwner"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_identity_delete();
CREATE TRIGGER exec_identity_delete_guard BEFORE DELETE ON public."ExecutiveAgent"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_identity_delete();
CREATE TRIGGER exec_identity_delete_guard BEFORE DELETE ON public."ExecutiveOwnerCredential"
    FOR EACH STATEMENT EXECUTE FUNCTION public.exec_reject_identity_delete();

CREATE TRIGGER exec_update_guard BEFORE UPDATE ON public."ExecutiveOffice"
    FOR EACH ROW EXECUTE FUNCTION public.exec_guard_foundation_update();
CREATE TRIGGER exec_update_guard BEFORE UPDATE ON public."ExecutiveOwner"
    FOR EACH ROW EXECUTE FUNCTION public.exec_guard_foundation_update();
CREATE TRIGGER exec_update_guard BEFORE UPDATE ON public."ExecutiveOwnerCredential"
    FOR EACH ROW EXECUTE FUNCTION public.exec_guard_foundation_update();
CREATE TRIGGER exec_update_guard BEFORE UPDATE ON public."ExecutiveOwnerEnrollment"
    FOR EACH ROW EXECUTE FUNCTION public.exec_guard_foundation_update();
CREATE TRIGGER exec_update_guard BEFORE UPDATE ON public."ExecutiveOwnerChallenge"
    FOR EACH ROW EXECUTE FUNCTION public.exec_guard_foundation_update();
CREATE TRIGGER exec_update_guard BEFORE UPDATE ON public."ExecutiveOwnerSession"
    FOR EACH ROW EXECUTE FUNCTION public.exec_guard_foundation_update();
CREATE TRIGGER exec_update_guard BEFORE UPDATE ON public."ExecutiveAuthRateLimit"
    FOR EACH ROW EXECUTE FUNCTION public.exec_guard_foundation_update();
CREATE TRIGGER exec_update_guard BEFORE UPDATE ON public."ExecutiveAgent"
    FOR EACH ROW EXECUTE FUNCTION public.exec_guard_foundation_update();

CREATE TRIGGER exec_challenge_grant_guard BEFORE INSERT OR UPDATE ON public."ExecutiveOwnerChallenge"
    FOR EACH ROW EXECUTE FUNCTION public.exec_check_challenge_grant();
CREATE TRIGGER exec_agent_office_lock BEFORE INSERT OR UPDATE ON public."ExecutiveAgent"
    FOR EACH ROW EXECUTE FUNCTION public.exec_lock_agent_office();

CREATE CONSTRAINT TRIGGER exec_charter_pair_guard AFTER INSERT OR UPDATE ON public."ExecutiveOffice"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.exec_check_charter_pointer_pair();
CREATE CONSTRAINT TRIGGER exec_charter_pair_guard AFTER INSERT OR UPDATE ON public."ExecutiveAgent"
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.exec_check_charter_pointer_pair();

COMMIT;
