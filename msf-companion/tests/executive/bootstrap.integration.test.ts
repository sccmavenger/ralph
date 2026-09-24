import { beforeAll, describe, expect, it } from "vitest";
import { canonicalHash, sha256 } from "../../src/lib/executive/canonical";
import { runBootstrap, type BootstrapPrepared } from "../../src/lib/executive/bootstrap";
import { businessSnapshot, createBootstrapFixture, executiveSnapshot } from "./bootstrap-fixtures";
import { connectTestDatabase, EXECUTIVE_TABLES, expectSqlFailure, validateTestEnvironment } from "./test-database";

beforeAll(() => { validateTestEnvironment(); });

describe("BOOT-04/05/06/11/16 typed bootstrap, inertness, continuity and unchanged business data", () => {
  it("minimal non-owner grants support readonly check, exact atomic creation and write-free replay", async () => {
    const fixture = await createBootstrapFixture("main", { business: true });
    try {
      const business = await businessSnapshot(fixture.env);
      const empty = await executiveSnapshot(fixture.env);
      expect(await fixture.run("check")).toMatchObject({ status: "READY_EMPTY", exitCode: 0 });
      expect(await executiveSnapshot(fixture.env)).toEqual(empty);
      const result = await fixture.run();
      expect(result).toMatchObject({ status: "CREATED", exitCode: 0, currentlyInert: true, ownerStatus: "PENDING_ENROLLMENT",
        ceoStatus: "ONBOARDING", activeCharterAcceptanceId: null, governingCharterAcceptanceId: null });
      if (!("officeId" in result)) throw new Error("Expected committed identity result");
      for (const id of [result.officeId, result.ownerId, result.ceoId, result.charterId]) expect(id).toMatch(/^c[a-z0-9]{24}$/);
      const after = await executiveSnapshot(fixture.env);
      for (const table of EXECUTIVE_TABLES) {
        const expected = ["ExecutiveOffice", "ExecutiveOwner", "ExecutiveAgent", "ExecutiveCharter"].includes(table) ? 1
          : table === "ExecutiveActivityEvent" ? 2 : 0;
        expect(after.rows[table]).toHaveLength(expected);
      }
      const eventRows = after.rows.ExecutiveActivityEvent.map((record) => record.row as Record<string, unknown>);
      expect(eventRows.map((event) => event.eventType).sort()).toEqual(["executive.bootstrap.completed", "executive.charter.imported"]);
      expect(new Set(eventRows.map((event) => event.requestId)).size).toBe(1);
      const identityTimes = ["ExecutiveOffice", "ExecutiveOwner", "ExecutiveAgent", "ExecutiveCharter"].map((table) => (after.rows[table][0].row as Record<string, unknown>).createdAt);
      expect(new Set([...identityTimes, ...eventRows.map((event) => event.createdAt), ...eventRows.map((event) => event.occurredAt)]).size).toBe(1);
      expect((after.rows.ExecutiveOwner[0].row as Record<string, unknown>).webauthnUserId).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const replay = await fixture.run();
      expect(replay).toMatchObject({ status: "ALREADY_BOOTSTRAPPED", officeId: result.officeId, ownerId: result.ownerId, ceoId: result.ceoId, charterId: result.charterId });
      expect(await fixture.run("check")).toMatchObject({ status: "ALREADY_BOOTSTRAPPED", currentlyInert: true });
      expect(await executiveSnapshot(fixture.env)).toEqual(after);
      expect(await businessSnapshot(fixture.env)).toEqual(business);
    } finally { await fixture.close(); }
  });

  const changedInputs: [string, (value: BootstrapPrepared) => void][] = [
    ["Owner name", (value) => { value.envelope.owner.displayName = "Different synthetic Owner"; }],
    ["Owner contact", (value) => { value.envelope.owner.contactEmail = null; }],
    ["Office name", (value) => { value.envelope.office.name += " changed"; }],
    ["CEO name", (value) => { value.envelope.ceo.displayName += " changed"; }],
    ["role mission", (value) => { value.envelope.ceo.roleDefinition.mission += " changed"; }],
    ["responsibility", (value) => { value.envelope.ceo.roleDefinition.responsibilities.push("Another synthetic responsibility"); }],
    ["non-responsibility", (value) => { value.envelope.ceo.roleDefinition.nonResponsibilities.push("Another synthetic boundary"); }],
    ["Charter content", (value) => { value.charter.contentMarkdown += "Synthetic addition\n"; value.charter.contentHash = sha256(value.charter.contentMarkdown); value.envelope.charter.contentHash = value.charter.contentHash; }],
    ["Charter title", (value) => { value.charter.title += " changed"; value.envelope.charter.title = value.charter.title; }],
    ["source name", (value) => { value.charter.sourceFileName = "different-synthetic.docx"; value.envelope.charter.sourceFileName = value.charter.sourceFileName; }],
    ["source hash", (value) => { value.charter.sourceFileHash = sha256("different synthetic source"); value.envelope.charter.sourceFileHash = value.charter.sourceFileHash; }],
    ["manifest hash", (value) => { value.charter.manifestHash = sha256("different synthetic manifest"); value.envelope.charter.manifestHash = value.charter.manifestHash; }],
  ];
  it("every permitted canonical creation choice conflicts without overwriting and emits only bounded rejection metadata", async () => {
    const fixture = await createBootstrapFixture("conflicts");
    try {
      expect(await fixture.run()).toMatchObject({ status: "CREATED" });
      const baseline = await executiveSnapshot(fixture.env);
      for (const [name, change] of changedInputs) {
        const changed = structuredClone(fixture.prepared);
        change(changed);
        changed.bootstrapHash = canonicalHash(changed.envelope);
        expect(await fixture.run("apply", changed), name).toMatchObject({ reasonCode: "BOOTSTRAP_CONFLICT", exitCode: 4, diagnostic: { auditPersisted: true } });
      }
      const after = await executiveSnapshot(fixture.env);
      for (const table of EXECUTIVE_TABLES.filter((table) => table !== "ExecutiveActivityEvent")) expect(after.rows[table]).toEqual(baseline.rows[table]);
      expect(after.rows.ExecutiveActivityEvent).toHaveLength(2 + changedInputs.length);
      const rejected = after.rows.ExecutiveActivityEvent.map((record) => record.row as Record<string, unknown>).filter((event) => event.outcome === "REJECTED");
      expect(rejected).toHaveLength(changedInputs.length);
      for (const event of rejected) expect(event.metadata).toEqual({ schemaVersion: 1, reasonCode: "BOOTSTRAP_CONFLICT", bootstrapVersion: 1, auditPersisted: true });
      const checkInput = structuredClone(fixture.prepared);
      checkInput.envelope.owner.displayName = "Check-only conflict";
      checkInput.bootstrapHash = canonicalHash(checkInput.envelope);
      expect(await fixture.run("check", checkInput)).toMatchObject({ reasonCode: "BOOTSTRAP_CONFLICT", diagnostic: { auditPersisted: false } });
      expect(await executiveSnapshot(fixture.env)).toEqual(after);
    } finally { await fixture.close(); }
  }, 60_000);

  it("replay preserves genuine database progression fixtures, credentials and accepted paired pointers", async () => {
    const fixture = await createBootstrapFixture("advanced");
    try {
      const original = await fixture.run();
      if (!("officeId" in original)) throw new Error("Creation failed");
      const owner = await connectTestDatabase("migrator", fixture.env);
      try {
        await owner.query("BEGIN");
        const current = (await owner.query("SELECT clock_timestamp()::timestamptz(3) AS now")).rows[0].now;
        await owner.query('UPDATE public."ExecutiveOffice" SET name=$1,"updatedAt"=$2', ["Synthetic renamed Office", current]);
        await owner.query(`UPDATE public."ExecutiveOwner" SET "displayName"='Synthetic renamed Owner',"contactEmail"=NULL,
          status='ACTIVE',"authVersion"=4,"updatedAt"=$1`, [current]);
        await owner.query(`INSERT INTO public."ExecutiveOwnerCredential" (id,"ownerId","credentialId","publicKey",counter,"rpId",label,transports,"deviceType","backedUp","createdAt")
          VALUES ('advanced_credential',$1,'YWR2YW5jZWQ',decode('010203','hex'),0,'localhost','Synthetic','["internal"]','singleDevice',false,$2)`, [original.ownerId, current]);
        await owner.query(`INSERT INTO public."ExecutiveOwnerSession" (id,"ownerId","credentialId","tokenHash","authVersion","verifiedAt","lastSeenAt","idleExpiresAt","absoluteExpiresAt","createdAt")
          VALUES ('advanced_session',$1,'advanced_credential',$2,4,$3,$3,$3::timestamptz+interval '10 minutes',$3::timestamptz+interval '1 hour',$3)`, [original.ownerId, sha256("synthetic session"), current]);
        await owner.query(`INSERT INTO public."ExecutiveCharterAcceptance" (id,"officeId","charterId","ownerId","ownerCredentialId","ownerSessionRef","contentHash","verifiedAt","acceptedAt","requestKey","createdAt")
          VALUES ('advanced_acceptance',$1,$2,$3,'advanced_credential','advanced_session',$4,$5,$5,'advanced_request',$5)`, [original.officeId, original.charterId, original.ownerId, fixture.prepared.charter.contentHash, current]);
        await owner.query('UPDATE public."ExecutiveOffice" SET "activeCharterAcceptanceId"=\'advanced_acceptance\'');
        await owner.query(`UPDATE public."ExecutiveAgent" SET "displayName"='Synthetic renamed CEO',"governingCharterAcceptanceId"='advanced_acceptance',"updatedAt"=$1`, [current]);
        await owner.query(`INSERT INTO public."ExecutiveActivityEvent" (id,"officeId","eventType","actorType","subjectType","requestId",outcome,metadata)
          VALUES ('later_synthetic_event',$1,'fixture.later','SYSTEM','Fixture','synthetic_later','SUCCESS','{"synthetic":true}')`, [original.officeId]);
        await owner.query("COMMIT");
      } finally { await owner.end(); }
      const beforeReplay = await executiveSnapshot(fixture.env);
      expect(await fixture.run()).toMatchObject({ status: "ALREADY_BOOTSTRAPPED", ownerId: original.ownerId, ceoId: original.ceoId,
        currentlyInert: true, ownerStatus: "ACTIVE", activeCharterAcceptanceId: "advanced_acceptance", governingCharterAcceptanceId: "advanced_acceptance" });
      expect(await executiveSnapshot(fixture.env)).toEqual(beforeReplay);
    } finally { await fixture.close(); }
  });

  it("immutable identity/birth mutations fail at PostgreSQL guards and do not interfere with replay", async () => {
    const fixture = await createBootstrapFixture("immutable");
    try {
      expect(await fixture.run()).toMatchObject({ status: "CREATED" });
      const owner = await connectTestDatabase("migrator", fixture.env);
      try {
        await owner.query("BEGIN");
        const mutations = [
          'UPDATE public."ExecutiveOffice" SET "bootstrapHash"=repeat(\'0\',64)',
          'UPDATE public."ExecutiveOwner" SET "webauthnUserId"=repeat(\'x\',43)',
          'UPDATE public."ExecutiveOwner" SET "officeId"=\'different\'',
          'UPDATE public."ExecutiveAgent" SET "roleDefinitionVersion"=2',
          'UPDATE public."ExecutiveAgent" SET "reportsToOwnerId"=\'different\'',
          'UPDATE public."ExecutiveCharter" SET title=title',
          'DELETE FROM public."ExecutiveActivityEvent" WHERE false',
          'DELETE FROM public."ExecutiveOwner" WHERE false',
        ];
        for (const sql of mutations) await expectSqlFailure(owner, sql);
        await owner.query("ROLLBACK");
      } finally { await owner.end(); }
      expect(await fixture.run()).toMatchObject({ status: "ALREADY_BOOTSTRAPPED" });
    } finally { await fixture.close(); }
  });

  it("partial foundation and duplicated birth receipts fail closed without repair or rejection-audit fabrication", async () => {
    const partial = await createBootstrapFixture("partial");
    const duplicate = await createBootstrapFixture("duplicate");
    try {
      await partial.client.executiveOffice.createManyAndReturn({ data: [{ key: "msf-toolkit", name: "Synthetic partial",
        bootstrapVersion: 1, bootstrapHash: partial.prepared.bootstrapHash }] });
      const before = await executiveSnapshot(partial.env);
      expect(await partial.run()).toMatchObject({ reasonCode: "FOUNDATION_INCONSISTENT", diagnostic: { auditPersisted: false } });
      expect(await executiveSnapshot(partial.env)).toEqual(before);
      expect(await duplicate.run()).toMatchObject({ status: "CREATED" });
      const event = await duplicate.client.executiveActivityEvent.findFirstOrThrow({ where: { eventType: "executive.charter.imported" } });
      const { id: originalId, sequence: originalSequence, ...copy } = event;
      expect(originalId).toBeTruthy(); expect(originalSequence).toBeGreaterThan(BigInt(0));
      await duplicate.client.executiveActivityEvent.create({ data: { ...copy, metadata: copy.metadata as Exclude<typeof copy.metadata, null> } });
      const duplicated = await executiveSnapshot(duplicate.env);
      expect(await duplicate.run()).toMatchObject({ reasonCode: "FOUNDATION_INCONSISTENT", diagnostic: { auditPersisted: false } });
      expect(await executiveSnapshot(duplicate.env)).toEqual(duplicated);
    } finally { await partial.close(); await duplicate.close(); }
  });

  it("unsupported protocol versions fail before the readiness callback opens the database", async () => {
    const fixture = await createBootstrapFixture("version");
    try {
      const prepared = structuredClone(fixture.prepared);
      Object.assign(prepared.envelope, { bootstrapVersion: 2 });
      prepared.bootstrapHash = canonicalHash(prepared.envelope);
      let checks = 0;
      expect(await runBootstrap({ client: fixture.client, mode: "apply", prepared,
        readiness: async (tx) => { checks++; await fixture.readiness(tx); } })).toMatchObject({ reasonCode: "INPUT_INVALID" });
      expect(checks).toBe(0);
      expect((await executiveSnapshot(fixture.env)).rows.ExecutiveOffice).toEqual([]);
    } finally { await fixture.close(); }
  });
});
