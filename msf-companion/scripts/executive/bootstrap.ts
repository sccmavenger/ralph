import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { buildBootstrapDiagnostic, type BootstrapReasonCode } from '../../src/lib/executive/audit';
import { bootstrapConnection, parseBootstrapArguments, readBoundedFile, readPrivateJson,
  validateBootstrapInput, validateBootstrapTarget } from '../../src/lib/executive/bootstrap-config';
import { loadApprovedBootstrap } from '../../src/lib/executive/charter';
import { decodeUtf8, parseStrictJson } from '../../src/lib/executive/canonical';
import type { BootstrapOutcome } from '../../src/lib/executive/bootstrap';

async function verifyRuntime(): Promise<void> {
  if (process.versions.node.split('.')[0] !== '24') throw new Error('INVALID_RUNTIME');
  const root = resolve(__dirname, '../..');
  const versions: Record<string, string> = { prisma: '7.6.0', '@prisma/client': '7.6.0',
    '@prisma/adapter-pg': '7.6.0', tsx: '4.23.15' };
  const lock = parseStrictJson(decodeUtf8(await readBoundedFile(resolve(root, 'package-lock.json'), 2 * 1024 * 1024))) as {
    packages?: Record<string, { version?: unknown }>;
  };
  for (const [name, version] of Object.entries(versions)) {
    const installed = parseStrictJson(decodeUtf8(await readBoundedFile(resolve(root, 'node_modules', name, 'package.json'), 256 * 1024))) as { version?: unknown };
    if (installed?.version !== version || lock?.packages?.[`node_modules/${name}`]?.version !== version) throw new Error('INVALID_RUNTIME');
  }
  await readBoundedFile(resolve(root, 'node_modules/tsx/dist/cli.mjs'), 1024 * 1024);
}

async function main(): Promise<void> {
  const requestId = randomUUID();
  let reasonCode: BootstrapReasonCode = 'INPUT_INVALID';
  let transactionInvoked = false;
  try {
    const args = parseBootstrapArguments(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(JSON.stringify({ status: 'HELP', usage: 'npm run --silent executive:bootstrap -- (--check | --apply) --input <private-file> --source-file <original-docx> --target <disposable-target-file> [--confirm-target <database>]',
        boundary: 'Disposable targets only. Does not enroll, accept the Charter, or enable execution.' }) + '\n');
      return;
    }
    await verifyRuntime();
    const input = validateBootstrapInput(await readPrivateJson(args.inputPath));
    reasonCode = 'TARGET_INVALID';
    const target = validateBootstrapTarget(await readPrivateJson(args.targetPath));
    const connection = bootstrapConnection(target, args.mode, args.confirmTarget);
    reasonCode = 'PROVENANCE_INVALID';
    const prepared = await loadApprovedBootstrap(input, args.sourcePath);
    // All files, provenance, runtime and target guards complete before importing
    // or constructing either database client. Never import the app singleton.
    reasonCode = 'INPUT_INVALID';
    const [{ PrismaClient }, { PrismaPg }, { runBootstrap, BootstrapRejectionError }, { checkExecutiveReadiness }] = await Promise.all([
      import('../../src/generated/prisma/client'), import('@prisma/adapter-pg'),
      import('../../src/lib/executive/bootstrap'), import('../../src/lib/executive/readiness'),
    ]);
    const client = new PrismaClient({ adapter: new PrismaPg(connection), log: [] });
    transactionInvoked = true;
    let outcome: BootstrapOutcome;
    try { outcome = await runBootstrap({ client, mode: args.mode, prepared, requestId,
      readiness: async tx => {
        const result = await checkExecutiveReadiness(async <T extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) =>
          tx.$queryRawUnsafe<T[]>(sql, ...(values ?? [])),
        { expectedDatabase: target.database, expectedRole: target.role, mode: args.mode });
        if (!result.ready) throw new BootstrapRejectionError(result.diagnostics.some(item => item.category === 'privilege') ? 'PRIVILEGE_FAILED' : 'READINESS_FAILED');
      },
    }); } finally {
      // A disconnect error must not relabel an already confirmed commit as failed.
      try { await client.$disconnect(); } catch { /* No raw driver error output. */ }
    }
    process.stdout.write(JSON.stringify(outcome) + '\n');
    process.exitCode = outcome.exitCode;
  } catch {
    // Defensive outer boundary: unexpected errors after service invocation cannot
    // justify a "no writes" claim, even if ordinary transaction failures are handled.
    if (transactionInvoked) {
      process.stdout.write(JSON.stringify({ status: 'FAILED', requestId, reasonCode: 'COMMIT_OUTCOME_UNKNOWN', exitCode: 6,
        diagnostic: buildBootstrapDiagnostic({ requestId, reasonCode: 'COMMIT_OUTCOME_UNKNOWN', phase: 'COMMIT' }) }) + '\n');
      process.exitCode = 6;
      return;
    }
    process.stdout.write(JSON.stringify({ status: 'REJECTED', requestId, reasonCode, exitCode: 2,
      diagnostic: buildBootstrapDiagnostic({ requestId, reasonCode, phase: 'INPUT', auditPersisted: false }) }) + '\n');
    process.exitCode = 2;
  }
}

void main();
