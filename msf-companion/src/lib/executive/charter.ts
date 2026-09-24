import { basename, resolve } from 'node:path';
import { canonicalHash, decodeUtf8, exactObject, parseStrictJson, sha256 } from './canonical';
import { readBoundedFile } from './bootstrap-config';
import type { BootstrapInput, BootstrapEnvelope, BootstrapPrepared } from './contracts';

export const APPROVED_CHARTER = Object.freeze({
  sourceFileName: 'MSF_Toolkit_AI_CEO_Charter_and_Governance_Framework.docx',
  sourceFileHash: '654a4baa4e86743af373f620a8dc156519dada487f3288811b39ae42e5413660',
  sourceByteLength: 40485,
  contentFileName: 'charter-v1.md',
  contentHash: '673560486fa44a687dcddc6395bd4439848225c40f0f42831dc3a21daee3b3e5',
  contentByteLength: 6557,
  manifestHash: 'f452fb4bfa0850bbb2f0d3789db46f1011c8c0de38f6229e00914e49a8985fe6',
  roleHash: '3165fa4f4cf09096952ad6ecfb964bf1ba8f2e5783f8bd11d40358bafdc65827',
  reviewReference: 'https://github.com/sccmavenger/ralph/pull/11#issuecomment-5807081719',
  reviewer: 'sccmavenger',
});

export interface CharterReleasePolicy {
  sourceFileName: string; sourceFileHash: string; sourceByteLength: number;
  contentFileName: string; contentHash: string; contentByteLength: number;
  manifestHash: string; roleHash: string; reviewReference: string; reviewer: string;
}

/** Pure verifier: test policy injection is not exposed by the operator CLI. */
export function verifyCharterAssets(bytes: { source: Uint8Array; sourceFileName: string;
  content: Uint8Array; manifest: Uint8Array; role: Uint8Array }, policy: CharterReleasePolicy = APPROVED_CHARTER) {
  if (bytes.sourceFileName !== policy.sourceFileName || bytes.source.byteLength !== policy.sourceByteLength ||
      sha256(bytes.source) !== policy.sourceFileHash || bytes.content.byteLength < 1 ||
      bytes.content.byteLength > 256 * 1024 || bytes.manifest.byteLength > 16 * 1024 ||
      bytes.role.byteLength > 16 * 1024) throw new Error('INVALID_PROVENANCE');
  const contentMarkdown = decodeUtf8(bytes.content);
  if (contentMarkdown.includes('\r') || !contentMarkdown.endsWith('\n') || contentMarkdown.endsWith('\n\n') ||
      bytes.content.byteLength !== policy.contentByteLength || sha256(bytes.content) !== policy.contentHash) {
    throw new Error('INVALID_PROVENANCE');
  }
  const manifest = exactObject(parseStrictJson(decodeUtf8(bytes.manifest)), ['manifestVersion', 'charterVersion',
    'title', 'sourceFileName', 'sourceFileHash', 'sourceByteLength', 'contentFileName', 'contentHash',
    'contentByteLength', 'canonicalization', 'transcriptionMethod', 'sourceSectionCount', 'presentationChanges', 'review']);
  const review = exactObject(manifest.review, ['reference', 'reviewer', 'reviewedSourceFileHash', 'reviewedContentHash']);
  if (manifest.manifestVersion !== 1 || manifest.charterVersion !== 1 ||
      manifest.title !== 'AI CEO Charter & Governance Framework' || manifest.sourceSectionCount !== 12 ||
      manifest.canonicalization !== 'utf8-no-bom-lf-one-final-newline-v1' ||
      manifest.transcriptionMethod !== 'faithful-manual-ooxml-and-rendered-review-v1' ||
      manifest.sourceFileName !== policy.sourceFileName || manifest.sourceFileHash !== policy.sourceFileHash ||
      manifest.sourceByteLength !== policy.sourceByteLength || manifest.contentFileName !== policy.contentFileName ||
      manifest.contentHash !== policy.contentHash || manifest.contentByteLength !== policy.contentByteLength ||
      !/^[a-f0-9]{64}$/.test(policy.sourceFileHash) || !/^[a-f0-9]{64}$/.test(policy.contentHash) ||
      !Array.isArray(manifest.presentationChanges) || manifest.presentationChanges.length === 0 ||
      manifest.presentationChanges.some(value => typeof value !== 'string' || !value.trim()) ||
      review.reference !== policy.reviewReference || !policy.reviewReference ||
      review.reviewer !== policy.reviewer || !policy.reviewer ||
      review.reviewedSourceFileHash !== policy.sourceFileHash || review.reviewedContentHash !== policy.contentHash ||
      canonicalHash(manifest) !== policy.manifestHash) throw new Error('INVALID_PROVENANCE');
  const role = exactObject(parseStrictJson(decodeUtf8(bytes.role)), ['schemaVersion', 'mission', 'responsibilities',
    'nonResponsibilities', 'tools', 'permissions', 'spendingAuthority']);
  if (role.schemaVersion !== 1 || typeof role.mission !== 'string' || !role.mission ||
      !Array.isArray(role.responsibilities) || !role.responsibilities.length ||
      role.responsibilities.some(value => typeof value !== 'string' || !value) ||
      !Array.isArray(role.nonResponsibilities) || !role.nonResponsibilities.length ||
      role.nonResponsibilities.some(value => typeof value !== 'string' || !value) ||
      !Array.isArray(role.tools) || role.tools.length !== 0 || !Array.isArray(role.permissions) || role.permissions.length !== 0 ||
      role.spendingAuthority !== false || canonicalHash(role) !== policy.roleHash) throw new Error('INVALID_PROVENANCE');
  return {
    charter: { contentMarkdown, contentHash: policy.contentHash, sourceFileName: policy.sourceFileName,
      sourceFileHash: policy.sourceFileHash, title: manifest.title, manifestHash: policy.manifestHash },
    roleDefinition: role as unknown as BootstrapEnvelope['ceo']['roleDefinition'],
  };
}

export function prepareBootstrap(input: BootstrapInput, assets: ReturnType<typeof verifyCharterAssets>): BootstrapPrepared {
  const { charter, roleDefinition } = assets;
  const envelope: BootstrapEnvelope = {
    bootstrapVersion: 1,
    office: { key: 'msf-toolkit', name: 'MSF Toolkit Executive Office', phase: 'FOUNDATION',
      executionMode: 'DISABLED', activeCharterAcceptanceId: null },
    owner: { ...input.owner, status: 'PENDING_ENROLLMENT', authVersion: 1 },
    ceo: { roleKey: 'CEO', displayName: 'MSF Toolkit CEO', status: 'ONBOARDING',
      roleDefinitionVersion: 1, roleDefinition, governingCharterAcceptanceId: null },
    charter: { version: 1, title: charter.title, contentHash: charter.contentHash,
      sourceFileName: charter.sourceFileName, sourceFileHash: charter.sourceFileHash,
      manifestHash: charter.manifestHash, importedByOwnerId: null },
    auditSchemaVersion: 1,
  };
  return { envelope, bootstrapHash: canonicalHash(envelope), charter };
}

export async function loadApprovedBootstrap(input: BootstrapInput, sourcePath: string): Promise<BootstrapPrepared> {
  // Fixed release paths: neither cwd discovery nor an operator-controlled asset override.
  const contentRoot = resolve(__dirname, '../../../docs/executive-office/charter');
  if (basename(sourcePath) !== APPROVED_CHARTER.sourceFileName) throw new Error('INVALID_PROVENANCE');
  const [source, content, manifest, role] = await Promise.all([
    readBoundedFile(sourcePath, APPROVED_CHARTER.sourceByteLength),
    readBoundedFile(resolve(contentRoot, 'charter-v1.md'), 256 * 1024),
    readBoundedFile(resolve(contentRoot, 'charter-v1.manifest.json'), 16 * 1024),
    readBoundedFile(resolve(__dirname, 'bootstrap-role-v1.json'), 16 * 1024),
  ]);
  return prepareBootstrap(input, verifyCharterAssets({ source, sourceFileName: basename(sourcePath), content, manifest, role }));
}
