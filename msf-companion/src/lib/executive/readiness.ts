import manifestJson from "./m1-2-readiness-manifest.json";

/** Supplied by the caller's already guarded, explicit transaction connection. */
export type ExecutiveReadinessQuery = <T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string, values?: readonly unknown[],
) => Promise<T[]>;

export type ReadinessDiagnostic = {
  category: "runtime" | "migration" | "catalog" | "guard" | "privilege";
  reason: string;
};
export type ReadinessOptions = {
  expectedDatabase: string;
  expectedRole: string;
  mode: "check" | "apply";
};
export type ReadinessResult = { ready: boolean; diagnostics: ReadinessDiagnostic[] };
type CatalogRow = Record<string, unknown>;

// Keep these queries SELECT-only. No runtime expectation generation, scratch
// tables, SET, migration, grants, nextval, or reads of application/user data.
// pg_get_* output is compared byte-for-byte with PG16 and search_path=pg_catalog.
const CATALOG_QUERIES = {
  tables: `SELECT pg_catalog.jsonb_build_object(
    'name', c.relname, 'kind', c.relkind::text, 'persistence', c.relpersistence::text,
    'rowSecurity', c.relrowsecurity, 'forceRowSecurity', c.relforcerowsecurity,
    'replicaIdentity', c.relreplident::text, 'partition', c.relispartition,
    'options', c.reloptions, 'accessMethod', am.amname,
    'parents', (SELECT count(*)::int FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid),
    'children', (SELECT count(*)::int FROM pg_catalog.pg_inherits i WHERE i.inhparent=c.oid),
    'rules', (SELECT count(*)::int FROM pg_catalog.pg_rewrite r WHERE r.ev_class=c.oid),
    'policies', (SELECT count(*)::int FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid)
    ) AS item
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_catalog.pg_am am ON am.oid=c.relam
    WHERE n.nspname='public' AND left(c.relname,9)='Executive'
      AND c.relkind NOT IN ('i','I','S')`,
  columns: `SELECT pg_catalog.jsonb_build_object(
    'table', c.relname, 'position', a.attnum, 'name', a.attname,
    'type', pg_catalog.format_type(a.atttypid,a.atttypmod),
    'notNull', a.attnotnull, 'identity', a.attidentity::text, 'generated', a.attgenerated::text,
    'default', pg_catalog.pg_get_expr(d.adbin,d.adrelid,false),
    'collation', CASE WHEN co.oid IS NULL THEN NULL ELSE cn.nspname||'.'||co.collname END,
    'dimensions', a.attndims, 'inherited', a.attinhcount, 'local', a.attislocal
    ) AS item
    FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    LEFT JOIN pg_catalog.pg_collation co ON co.oid=a.attcollation
    LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=co.collnamespace
    WHERE n.nspname='public' AND left(c.relname,9)='Executive'
      AND c.relkind NOT IN ('i','I','S') AND a.attnum>0 AND NOT a.attisdropped`,
  constraints: `SELECT pg_catalog.jsonb_build_object(
    'table', c.relname, 'name', k.conname, 'type', k.contype::text,
    'definition', pg_catalog.pg_get_constraintdef(k.oid,false),
    'validated', k.convalidated, 'deferrable', k.condeferrable, 'deferred', k.condeferred,
    'noInherit', k.connoinherit, 'local', k.conislocal, 'inherited', k.coninhcount,
    'parent', k.conparentid<>0, 'match', k.confmatchtype::text,
    'update', k.confupdtype::text, 'delete', k.confdeltype::text,
    'columns', ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY x(num,pos)
      JOIN pg_catalog.pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.num ORDER BY x.pos),
    'targetSchema', rn.nspname, 'targetTable', r.relname,
    'targetColumns', ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY x(num,pos)
      JOIN pg_catalog.pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=x.num ORDER BY x.pos)
    ) AS item
    FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_catalog.pg_class r ON r.oid=k.confrelid
    LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid=r.relnamespace
    WHERE n.nspname='public' AND left(c.relname,9)='Executive'`,
  indexes: `SELECT pg_catalog.jsonb_build_object(
    'table', t.relname, 'name', i.relname, 'method', am.amname,
    'definition', pg_catalog.pg_get_indexdef(i.oid,0,false),
    'unique', x.indisunique, 'primary', x.indisprimary, 'valid', x.indisvalid,
    'ready', x.indisready, 'live', x.indislive, 'immediate', x.indimmediate,
    'exclusion', x.indisexclusion, 'nullsNotDistinct', x.indnullsnotdistinct,
    'keyCount', x.indnkeyatts, 'attributeCount', x.indnatts,
    'predicate', pg_catalog.pg_get_expr(x.indpred,x.indrelid,false),
    'expression', pg_catalog.pg_get_expr(x.indexprs,x.indrelid,false),
    'options', i.reloptions, 'columnOptions', x.indoption::text,
    'columns', ARRAY(SELECT a.attname::text FROM unnest(x.indkey) WITH ORDINALITY k(num,pos)
      LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.num ORDER BY k.pos),
    'operatorClasses', ARRAY(SELECT onsp.nspname||'.'||o.opcname FROM unnest(x.indclass) WITH ORDINALITY k(num,pos)
      JOIN pg_catalog.pg_opclass o ON o.oid=k.num JOIN pg_catalog.pg_namespace onsp ON onsp.oid=o.opcnamespace ORDER BY k.pos),
    'collations', ARRAY(SELECT CASE WHEN co.oid IS NULL THEN NULL ELSE cn.nspname||'.'||co.collname END
      FROM unnest(x.indcollation) WITH ORDINALITY k(num,pos)
      LEFT JOIN pg_catalog.pg_collation co ON co.oid=k.num
      LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=co.collnamespace ORDER BY k.pos)
    ) AS item
    FROM pg_catalog.pg_index x JOIN pg_catalog.pg_class t ON t.oid=x.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_catalog.pg_class i ON i.oid=x.indexrelid JOIN pg_catalog.pg_am am ON am.oid=i.relam
    WHERE n.nspname='public' AND left(t.relname,9)='Executive'`,
  functions: `SELECT pg_catalog.jsonb_build_object(
    'name', p.proname, 'schema', n.nspname, 'kind', p.prokind::text,
    'arguments', pg_catalog.pg_get_function_arguments(p.oid),
    'identityArguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
    'result', pg_catalog.pg_get_function_result(p.oid), 'body', p.prosrc,
    'binary', p.probin, 'sqlBody', p.prosqlbody IS NOT NULL,
    'language', l.lanname, 'securityDefiner', p.prosecdef,
    'volatility', p.provolatile::text, 'parallel', p.proparallel::text,
    'strict', p.proisstrict, 'leakproof', p.proleakproof, 'returnsSet', p.proretset,
    'config', p.proconfig, 'cost', p.procost, 'rows', p.prorows,
    'support', p.prosupport::text
    ) AS item
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND left(p.proname,5)='exec_'`,
  triggers: `SELECT pg_catalog.jsonb_build_object(
    'table', c.relname, 'name', CASE WHEN t.tgisinternal THEN NULL ELSE t.tgname END,
    'internal', t.tgisinternal, 'type', t.tgtype, 'enabled', t.tgenabled::text,
    'deferrable', t.tgdeferrable, 'deferred', t.tginitdeferred,
    'functionSchema', fn.nspname, 'function', p.proname,
    'functionArguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
    'constraint', k.conname, 'constraintType', k.contype::text,
    'constraintTable', kc.relname, 'constraintSchema', kn.nspname,
    'whenPresent', t.tgqual IS NOT NULL,
    'definition', CASE WHEN t.tgisinternal THEN NULL ELSE pg_catalog.pg_get_triggerdef(t.oid,false) END,
    'arguments', pg_catalog.encode(t.tgargs,'hex'), 'argumentCount', t.tgnargs,
    'columns', ARRAY(SELECT a.attname::text FROM unnest(t.tgattr) WITH ORDINALITY x(num,pos)
      JOIN pg_catalog.pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=x.num ORDER BY x.pos),
    'oldTransitionTable', t.tgoldtable, 'newTransitionTable', t.tgnewtable,
    'parent', t.tgparentid<>0
    ) AS item
    FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace fn ON fn.oid=p.pronamespace
    LEFT JOIN pg_catalog.pg_constraint k ON k.oid=t.tgconstraint
    LEFT JOIN pg_catalog.pg_class kc ON kc.oid=k.conrelid
    LEFT JOIN pg_catalog.pg_namespace kn ON kn.oid=kc.relnamespace
    WHERE n.nspname='public' AND left(c.relname,9)='Executive'`,
  sequences: `SELECT pg_catalog.jsonb_build_object(
    'schema', n.nspname, 'name', c.relname, 'persistence', c.relpersistence::text,
    'type', pg_catalog.format_type(s.seqtypid,NULL), 'start', s.seqstart::text,
    'increment', s.seqincrement::text, 'min', s.seqmin::text, 'max', s.seqmax::text,
    'cache', s.seqcache::text, 'cycle', s.seqcycle,
    'bindings', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema', tn.nspname, 'table', tc.relname, 'column', a.attname, 'dependency', d.deptype::text)
      ORDER BY tn.nspname,tc.relname,a.attname),'[]'::jsonb)
      FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_class tc ON tc.oid=d.refobjid
      JOIN pg_catalog.pg_namespace tn ON tn.oid=tc.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid=tc.oid AND a.attnum=d.refobjsubid
      WHERE d.classid='pg_catalog.pg_class'::regclass AND d.objid=c.oid
        AND d.refclassid='pg_catalog.pg_class'::regclass AND d.deptype IN ('a','i'))
    ) AS item
    FROM pg_catalog.pg_sequence s JOIN pg_catalog.pg_class c ON c.oid=s.seqrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND (left(c.relname,9)='Executive' OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_class t ON t.oid=d.refobjid
      JOIN pg_catalog.pg_namespace tn ON tn.oid=t.relnamespace
      WHERE d.classid='pg_catalog.pg_class'::regclass AND d.objid=c.oid
        AND d.refclassid='pg_catalog.pg_class'::regclass AND tn.nspname='public'
        AND left(t.relname,9)='Executive' AND d.deptype IN ('a','i')))`,
} as const;

export type ExecutiveCatalog = Record<keyof typeof CATALOG_QUERIES, CatalogRow[]>;
type ReadinessManifest = {
  manifestVersion: number; postgresMajor: number; acceptedCommit: string; searchPath: string;
  migrations: { name: string; checksum: string }[];
  catalog: ExecutiveCatalog | null;
};
const manifest: ReadinessManifest = manifestJson as ReadinessManifest;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Exported solely for independently reviewed, disposable manifest preparation.
 * The checker NEVER substitutes this result for its checked-in expectations. */
export async function collectExecutiveCatalog(query: ExecutiveReadinessQuery): Promise<ExecutiveCatalog> {
  const catalog = {} as ExecutiveCatalog;
  for (const section of Object.keys(CATALOG_QUERIES) as (keyof ExecutiveCatalog)[]) {
    const rows = await query<{ item: CatalogRow }>(CATALOG_QUERIES[section]);
    catalog[section] = rows.map((row) => row.item).sort((a, b) => {
      const left = canonical(a); const right = canonical(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }
  return catalog;
}

function reviewedCatalogAvailable(): boolean {
  const c = manifest.catalog;
  return manifest.manifestVersion === 1 && manifest.postgresMajor === 16
    && manifest.searchPath === "pg_catalog" && c !== null
    && c.tables.length === 11 && c.columns.length === 116
    && c.constraints.filter((row) => row.type === "c").length === 43
    && c.constraints.filter((row) => row.type === "f").length === 20
    && c.constraints.filter((row) => row.type === "p").length === 11
    && c.indexes.length === 52 && c.functions.length === 8
    && c.triggers.filter((row) => row.internal === false).length === 26
    && c.triggers.filter((row) => row.internal === true).length === 80
    && c.sequences.length === 1;
}

const IDENTITY_QUERY = `SELECT current_database()::text AS database,
  current_user::text AS role, session_user::text AS session_role,
  current_setting('server_version_num') AS version,
  current_setting('server_encoding') AS encoding,
  current_setting('session_replication_role') AS replication,
  current_setting('transaction_read_only') AS read_only,
  current_setting('transaction_isolation') AS isolation,
  current_setting('search_path') AS search_path,
  pg_catalog.pg_is_in_recovery() AS recovery,
  pg_catalog.inet_server_addr()::text AS server_address,
  pg_catalog.inet_server_port() AS server_port`;

const PRIVILEGES_QUERY = `WITH candidates AS (
    SELECT r.oid,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls
    FROM pg_catalog.pg_roles r WHERE r.rolname=current_user
      OR pg_catalog.pg_has_role(current_user,r.oid,'SET')
  ), executive_relations AS (
    SELECT c.oid,c.relowner,c.relkind,c.relname FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND left(c.relname,9)='Executive'
  ), executive_functions AS (
    SELECT p.oid,p.proowner FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND left(p.proname,5)='exec_'
  ) SELECT
  NOT EXISTS (SELECT 1 FROM candidates c WHERE
    c.rolsuper OR c.rolcreatedb OR c.rolcreaterole OR c.rolreplication OR c.rolbypassrls
    OR pg_catalog.has_schema_privilege(c.oid,'public','CREATE')
    OR pg_catalog.has_database_privilege(c.oid,current_database(),'CREATE')
    OR pg_catalog.has_parameter_privilege(c.oid,'session_replication_role','SET')
    OR pg_catalog.pg_has_role(c.oid,'pg_read_server_files','USAGE')
    OR pg_catalog.pg_has_role(c.oid,'pg_write_server_files','USAGE')
    OR pg_catalog.pg_has_role(c.oid,'pg_execute_server_program','USAGE')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_database d WHERE d.datname=current_database()
      AND pg_catalog.pg_has_role(c.oid,d.datdba,'USAGE'))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='public'
      AND pg_catalog.pg_has_role(c.oid,n.nspowner,'USAGE'))
    OR EXISTS (SELECT 1 FROM executive_relations r WHERE pg_catalog.pg_has_role(c.oid,r.relowner,'USAGE')
      OR CASE WHEN r.relkind IN ('r','p','v','m','f')
        THEN pg_catalog.has_table_privilege(c.oid,r.oid,'TRIGGER') ELSE false END)
    OR EXISTS (SELECT 1 FROM executive_functions f WHERE pg_catalog.pg_has_role(c.oid,f.proowner,'USAGE'))
  ) AS safe_role,
  pg_catalog.has_database_privilege(current_database(),'CONNECT') AS connect,
  pg_catalog.has_schema_privilege('public','USAGE') AS schema_usage,
  (SELECT count(*)=11 AND bool_and(pg_catalog.has_table_privilege(r.oid,'SELECT'))
    FROM executive_relations r WHERE r.relkind='r') AS read_tables,
  pg_catalog.has_table_privilege('public._prisma_migrations','SELECT') AS read_history,
  (SELECT count(*)=5 AND bool_and(pg_catalog.has_table_privilege(r.oid,'INSERT'))
    FROM executive_relations r WHERE r.relname IN
    ('ExecutiveOffice','ExecutiveOwner','ExecutiveAgent','ExecutiveCharter','ExecutiveActivityEvent')) AS insert_tables,
  pg_catalog.has_column_privilege('public."ExecutiveOffice"','updatedAt','UPDATE') AS lock_office,
  pg_catalog.has_sequence_privilege('public."ExecutiveActivityEvent_sequence_seq"','USAGE') AS sequence_usage,
  (SELECT count(*)=8 AND bool_and(pg_catalog.has_function_privilege(f.oid,'EXECUTE'))
    FROM executive_functions f) AS execute_functions`;

/** Does not open a connection or transaction. The caller owns snapshot/locking.
 * All failures expose fixed codes only; catalog SQL, values and errors stay private. */
export async function checkExecutiveReadiness(
  query: ExecutiveReadinessQuery, options: ReadinessOptions,
): Promise<ReadinessResult> {
  const diagnostics: ReadinessDiagnostic[] = [];
  const add = (category: ReadinessDiagnostic["category"], reason: string) => diagnostics.push({ category, reason });
  let phase: ReadinessDiagnostic["category"] = "runtime";
  try {
    const identities = await query(IDENTITY_QUERY);
    const identity = identities[0];
    if (identities.length !== 1 || !identity
      || identity.database !== options.expectedDatabase
      || identity.role !== options.expectedRole || identity.session_role !== options.expectedRole
      || options.expectedRole !== "exec_test_app"
      || typeof identity.version !== "string" || !/^16\d{4}$/.test(identity.version)
      || identity.encoding !== "UTF8" || identity.replication !== "origin"
      || identity.search_path !== "pg_catalog" || identity.recovery !== false
      || typeof identity.server_address !== "string" || identity.server_port !== 5432
      || identity.read_only !== (options.mode === "check" ? "on" : "off")
      || identity.isolation !== (options.mode === "check" ? "repeatable read" : "read committed")) {
      add("runtime", "TRANSACTION_IDENTITY_OR_MODE_INVALID");
      return { ready: false, diagnostics };
    }
    if (!reviewedCatalogAvailable()) {
      add("catalog", "REVIEWED_MANIFEST_UNAVAILABLE");
      return { ready: false, diagnostics };
    }
    phase = "migration";
    const historyRelations = await query(`SELECT c.relkind::text AS kind,c.relpersistence::text AS persistence,
      c.relrowsecurity AS row_security,c.relforcerowsecurity AS forced
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='_prisma_migrations'`);
    if (historyRelations.length !== 1 || historyRelations[0].kind !== "r"
      || historyRelations[0].persistence !== "p" || historyRelations[0].row_security !== false
      || historyRelations[0].forced !== false) {
      add("migration", "MIGRATION_HISTORY_UNAVAILABLE");
      return { ready: false, diagnostics };
    }
    const history = await query(`SELECT migration_name,checksum,
      finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back,
      applied_steps_count FROM public._prisma_migrations`);
    if (history.some((row) => row.finished === false && row.rolled_back === false)) {
      add("migration", "UNRESOLVED_MIGRATION");
    }
    for (const migration of manifest.migrations) {
      const successful = history.filter((row) => row.migration_name === migration.name
        && row.finished === true && row.rolled_back === false);
      if (successful.length !== 1 || successful[0].checksum !== migration.checksum
        || typeof successful[0].applied_steps_count !== "number" || successful[0].applied_steps_count < 1) {
        add("migration", "REQUIRED_MIGRATION_INVALID");
      }
    }
    phase = "catalog";
    const observed = await collectExecutiveCatalog(query);
    for (const section of Object.keys(CATALOG_QUERIES) as (keyof ExecutiveCatalog)[]) {
      if (canonical(observed[section]) !== canonical(manifest.catalog![section])) {
        add(section === "triggers" || section === "functions" ? "guard" : "catalog", `CATALOG_${section.toUpperCase()}_MISMATCH`);
      }
    }
    // Avoid relation/function lookup exceptions on an already invalid catalog.
    if (diagnostics.some((item) => item.category === "catalog" || item.category === "guard")) {
      return { ready: false, diagnostics };
    }
    phase = "privilege";
    const privileges = await query(PRIVILEGES_QUERY);
    const required = ["safe_role", "connect", "schema_usage", "read_tables", "read_history", "insert_tables",
      "lock_office", "sequence_usage", "execute_functions"];
    if (privileges.length !== 1 || required.some((key) => privileges[0][key] !== true)) {
      add("privilege", "OPERATOR_PRIVILEGES_INVALID");
    }
  } catch {
    // Database errors may include connection strings, statements or row values.
    add(phase, "READINESS_QUERY_FAILED");
  }
  return { ready: diagnostics.length === 0, diagnostics };
}
