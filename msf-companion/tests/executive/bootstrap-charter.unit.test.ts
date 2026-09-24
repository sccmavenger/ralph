import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  APPROVED_CHARTER, loadApprovedBootstrap, prepareBootstrap, verifyCharterAssets, type CharterReleasePolicy,
} from "../../src/lib/executive/charter";

const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
// Independent test serializer of JSON-only fixture values. The canonical module's
// stricter rejection rules and golden literal bytes are tested in BOOT-02.
function jsonBytes(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonBytes).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${jsonBytes(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function syntheticFixture() {
  const source = Buffer.from("Synthetic test source only; NOT the Owner's DOCX.\n");
  const content = Buffer.from("# Synthetic Charter\n\nCommander Ω — 资源 🚀\n\nLine 1\nLine 2\n");
  const role = {
    schemaVersion: 1, mission: "Synthetic inert role Ω", responsibilities: ["Learn", "Report"],
    nonResponsibilities: ["Do not execute"], tools: [], permissions: [], spendingAuthority: false,
  };
  const review = { reference: "https://example.invalid/synthetic-approval", reviewer: "synthetic-reviewer",
    reviewedSourceFileHash: digest(source), reviewedContentHash: digest(content) };
  const document: Record<string, unknown> = {
    manifestVersion: 1, charterVersion: 1, title: "AI CEO Charter & Governance Framework",
    sourceFileName: "synthetic-charter.docx", sourceFileHash: digest(source), sourceByteLength: source.length,
    contentFileName: "charter-v1.md", contentHash: digest(content), contentByteLength: content.length,
    canonicalization: "utf8-no-bom-lf-one-final-newline-v1",
    transcriptionMethod: "faithful-manual-ooxml-and-rendered-review-v1", sourceSectionCount: 12,
    presentationChanges: ["Synthetic test fixture only; no fidelity approval implied."], review,
  };
  const policy: CharterReleasePolicy = {
    sourceFileName: "synthetic-charter.docx", sourceFileHash: digest(source), sourceByteLength: source.length,
    contentFileName: "charter-v1.md", contentHash: digest(content), contentByteLength: content.length,
    manifestHash: digest(jsonBytes(document)), roleHash: digest(jsonBytes(role)),
    reviewReference: review.reference, reviewer: review.reviewer,
  };
  const bytes: { source: Buffer; sourceFileName: string; content: Buffer; manifest: Buffer; role: Buffer } = {
    source, sourceFileName: policy.sourceFileName, content,
    manifest: Buffer.from(JSON.stringify(document)), role: Buffer.from(JSON.stringify(role)) };
  return { bytes, policy, document, role };
}
type Fixture = ReturnType<typeof syntheticFixture>;

/** Test-only policy resealing isolates schema validation from digest rejection.
 * There is no file, env variable or CLI switch to change production trust pins. */
function resealManifest(fixture: Fixture) {
  fixture.bytes.manifest = Buffer.from(JSON.stringify(fixture.document));
  fixture.policy.manifestHash = digest(jsonBytes(fixture.document));
}
function replaceContent(fixture: Fixture, content: Buffer) {
  fixture.bytes.content = content;
  fixture.policy.contentHash = digest(content);
  fixture.policy.contentByteLength = content.length;
  fixture.document.contentHash = fixture.policy.contentHash;
  fixture.document.contentByteLength = content.length;
  (fixture.document.review as Record<string, unknown>).reviewedContentHash = fixture.policy.contentHash;
  resealManifest(fixture);
}

describe("BOOT-03 pure Charter byte/provenance/role verification", () => {
  it("round-trips multiline Unicode from synthetic bytes through the same pure verifier", () => {
    const fixture = syntheticFixture();
    const result = verifyCharterAssets(fixture.bytes, fixture.policy);
    expect(result.charter).toEqual({ contentMarkdown: fixture.bytes.content.toString("utf8"),
      contentHash: fixture.policy.contentHash, sourceFileName: fixture.policy.sourceFileName,
      sourceFileHash: fixture.policy.sourceFileHash, title: "AI CEO Charter & Governance Framework",
      manifestHash: fixture.policy.manifestHash });
    expect(result.roleDefinition).toEqual(fixture.role);
    expect(result.roleDefinition.tools).toEqual([]);
    expect(result.roleDefinition.permissions).toEqual([]);
    expect(result.roleDefinition.spendingAuthority).toBe(false);
  });

  it("refuses synthetic provenance with actual trusted release defaults", () => {
    const fixture = syntheticFixture();
    expect(() => verifyCharterAssets(fixture.bytes)).toThrow();
    expect(Object.isFrozen(APPROVED_CHARTER)).toBe(true);
  });

  it.each(["name", "source byte", "source length", "content byte", "manifest digest", "role digest"])(
    "rejects tampering: %s", (mutation) => {
      const fixture = syntheticFixture();
      switch (mutation) {
        case "name": fixture.bytes.sourceFileName = "technical-implementation-package.docx"; break;
        case "source byte": fixture.bytes.source[0] ^= 1; break;
        case "source length": fixture.bytes.source = Buffer.concat([fixture.bytes.source, Buffer.from("x")]); break;
        case "content byte": fixture.bytes.content[2] ^= 1; break;
        case "manifest digest": fixture.policy.manifestHash = "0".repeat(64); break;
        case "role digest": fixture.policy.roleHash = "0".repeat(64); break;
      }
      expect(() => verifyCharterAssets(fixture.bytes, fixture.policy)).toThrow();
    },
  );

  it.each([
    Buffer.from("# Synthetic\r\n"), Buffer.from("# Synthetic\r"), Buffer.from("# Synthetic"),
    Buffer.from("# Synthetic\n\n"), Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0a]),
    Buffer.from([0xed, 0xa0, 0x80, 0x0a]), Buffer.from([0xff, 0x0a]), Buffer.alloc(0),
    Buffer.from("a".repeat(256 * 1024) + "\n"),
  ])("rejects noncanonical/oversized Markdown even with matching synthetic digests %#", (content) => {
    const fixture = syntheticFixture();
    replaceContent(fixture, content);
    expect(() => verifyCharterAssets(fixture.bytes, fixture.policy)).toThrow();
  });

  it("accepts exactly the canonical content limit without normalization", () => {
    const fixture = syntheticFixture();
    replaceContent(fixture, Buffer.from("a".repeat(256 * 1024 - 1) + "\n"));
    expect(verifyCharterAssets(fixture.bytes, fixture.policy).charter.contentMarkdown.length).toBe(256 * 1024);
  });

  it.each([
    ["manifestVersion", 2], ["charterVersion", 2], ["title", "Changed Charter"],
    ["sourceFileName", "different.docx"], ["sourceFileHash", "A".repeat(64)], ["sourceByteLength", 0],
    ["contentFileName", "alternate.md"], ["contentHash", "0".repeat(64)], ["contentByteLength", -1],
    ["canonicalization", "normalize-anything"], ["transcriptionMethod", "LLM-summary"], ["sourceSectionCount", 11],
    ["presentationChanges", []], ["presentationChanges", [" "]], ["presentationChanges", [7]],
    ["approved", true],
  ])("rejects closed manifest mismatch %s even after test-only digest resealing", (key, value) => {
    const fixture = syntheticFixture();
    fixture.document[key] = value;
    resealManifest(fixture);
    expect(() => verifyCharterAssets(fixture.bytes, fixture.policy)).toThrow();
  });

  it.each(["reference", "reviewer", "reviewedSourceFileHash", "reviewedContentHash"])(
    "rejects missing/pending/wrong review binding %s", (key) => {
      for (const replacement of [undefined, "", "unapproved"]) {
        const fixture = syntheticFixture();
        const review = fixture.document.review as Record<string, unknown>;
        if (replacement === undefined) delete review[key]; else review[key] = replacement;
        resealManifest(fixture);
        expect(() => verifyCharterAssets(fixture.bytes, fixture.policy)).toThrow();
      }
    },
  );

  it("does not accept a self-asserted review status or missing provenance field", () => {
    const fixture = syntheticFixture();
    (fixture.document.review as Record<string, unknown>).approved = true;
    resealManifest(fixture);
    expect(() => verifyCharterAssets(fixture.bytes, fixture.policy)).toThrow();
    delete (fixture.document.review as Record<string, unknown>).approved;
    delete fixture.document.sourceFileHash;
    resealManifest(fixture);
    expect(() => verifyCharterAssets(fixture.bytes, fixture.policy)).toThrow();
  });

  it.each([
    ["schemaVersion", 2], ["mission", ""], ["responsibilities", []], ["responsibilities", [true]],
    ["nonResponsibilities", []], ["nonResponsibilities", [null]], ["tools", ["network"]],
    ["permissions", ["admin"]], ["spendingAuthority", true], ["executionEnabled", true],
  ])("rejects non-inert or unknown role field %s despite a test-only matching role digest", (key, value) => {
    const fixture = syntheticFixture();
    const role: Record<string, unknown> = { ...fixture.role, [key]: value };
    fixture.bytes.role = Buffer.from(JSON.stringify(role));
    fixture.policy.roleHash = digest(jsonBytes(role));
    expect(() => verifyCharterAssets(fixture.bytes, fixture.policy)).toThrow();
  });

  it.each(["manifest", "role"] as const)("rejects duplicate keys/BOM/invalid UTF-8/oversize in %s", (part) => {
    for (const replacement of [Buffer.from('{"a":1,"\\u0061":2}'), Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]),
      Buffer.from([0xff]), Buffer.from(" ".repeat(16 * 1024 + 1))]) {
      const fixture = syntheticFixture();
      fixture.bytes[part] = replacement;
      expect(() => verifyCharterAssets(fixture.bytes, fixture.policy)).toThrow();
    }
  });

  it("JSON formatting/key-order changes do not change trust; any actual source/content/role change does", () => {
    const fixture = syntheticFixture();
    const reversed = Object.fromEntries(Object.entries(fixture.document).reverse());
    fixture.bytes.manifest = Buffer.from(JSON.stringify(reversed, null, 2) + "\n");
    fixture.bytes.role = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(fixture.role).reverse()), null, 2));
    expect(verifyCharterAssets(fixture.bytes, fixture.policy).charter.manifestHash).toBe(fixture.policy.manifestHash);
    fixture.role.responsibilities.reverse();
    fixture.bytes.role = Buffer.from(JSON.stringify(fixture.role));
    expect(() => verifyCharterAssets(fixture.bytes, fixture.policy)).toThrow();
  });

  it("pins real checked-in release bytes without pretending the original DOCX was available in this test", async () => {
    const content = await readFile(new URL("../../docs/executive-office/charter/charter-v1.md", import.meta.url));
    const document = JSON.parse(await readFile(new URL("../../docs/executive-office/charter/charter-v1.manifest.json", import.meta.url), "utf8"));
    const role = JSON.parse(await readFile(new URL("../../src/lib/executive/bootstrap-role-v1.json", import.meta.url), "utf8"));
    expect(content.length).toBe(APPROVED_CHARTER.contentByteLength);
    expect(digest(content)).toBe(APPROVED_CHARTER.contentHash);
    expect(digest(jsonBytes(document))).toBe(APPROVED_CHARTER.manifestHash);
    expect(digest(jsonBytes(role))).toBe(APPROVED_CHARTER.roleHash);
    expect(document.review).toEqual({ reference: APPROVED_CHARTER.reviewReference, reviewer: APPROVED_CHARTER.reviewer,
      reviewedSourceFileHash: APPROVED_CHARTER.sourceFileHash, reviewedContentHash: APPROVED_CHARTER.contentHash });
    expect(document.sourceByteLength).toBe(40485);
    expect(document.sourceFileName).toBe("MSF_Toolkit_AI_CEO_Charter_and_Governance_Framework.docx");
  });

  it("actual loader refuses an alternate source basename without test-policy override", async () => {
    await expect(loadApprovedBootstrap({ inputVersion: 1, owner: { displayName: "Synthetic", contactEmail: null } },
      "/synthetic/not-the-approved-source.docx")).rejects.toThrow("INVALID_PROVENANCE");
  });
});

describe("BOOT-02 canonical bootstrap envelope", () => {
  it("binds descriptive identity and provenance but contains no target/random identity/acceptance", () => {
    const fixture = syntheticFixture();
    const assets = verifyCharterAssets(fixture.bytes, fixture.policy);
    const input = { inputVersion: 1 as const, owner: { displayName: "Synthetic Owner", contactEmail: "Owner@Example.INVALID" } };
    const prepared = prepareBootstrap(input, assets);
    expect(prepared.bootstrapHash).toBe(digest(jsonBytes(prepared.envelope)));
    expect(prepared.envelope).toMatchObject({ bootstrapVersion: 1, auditSchemaVersion: 1,
      office: { key: "msf-toolkit", phase: "FOUNDATION", executionMode: "DISABLED", activeCharterAcceptanceId: null },
      owner: { ...input.owner, status: "PENDING_ENROLLMENT", authVersion: 1 },
      ceo: { roleKey: "CEO", status: "ONBOARDING", governingCharterAcceptanceId: null },
      charter: { version: 1, importedByOwnerId: null, manifestHash: fixture.policy.manifestHash } });
    const serialized = jsonBytes(prepared.envelope);
    for (const excluded of ["createdAt", "updatedAt", "requestId", "webauthnUserId", "database", "runId", "sourcePath", "ownerId"]) {
      expect(serialized).not.toContain(`"${excluded}":`);
    }
    expect(prepareBootstrap(input, assets)).toEqual(prepared);
    expect(prepareBootstrap({ ...input, owner: { ...input.owner, displayName: "Other" } }, assets).bootstrapHash)
      .not.toBe(prepared.bootstrapHash);
    expect(prepareBootstrap({ ...input, owner: { ...input.owner, contactEmail: "owner@example.invalid" } }, assets).bootstrapHash)
      .not.toBe(prepared.bootstrapHash);
    expect(prepareBootstrap({ ...input, owner: { ...input.owner, contactEmail: null } }, assets).bootstrapHash)
      .not.toBe(prepared.bootstrapHash);
  });
});
