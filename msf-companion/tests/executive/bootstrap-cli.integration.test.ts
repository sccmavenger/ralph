import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const runner = join(root, 'node_modules/tsx/dist/cli.mjs');
const cli = join(root, 'scripts/executive/bootstrap.ts');
let scratch: string;
const privateMarker = 'PRIVATE_OWNER_MARKER_DO_NOT_LOG';
const database = 'msf_exec_m12_cli';
const sourceName = 'MSF_Toolkit_AI_CEO_Charter_and_Governance_Framework.docx';
const baseEnv: NodeJS.ProcessEnv = {
  SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
  PATH: process.env.PATH, NODE_ENV: 'test',
  EXECUTIVE_BOOTSTRAP_DATABASE_URL: `postgresql://exec_test_app:PRIVATE_PASSWORD_MARKER@127.0.0.1:55432/${database}`,
  EXECUTIVE_BOOTSTRAP_DATABASE_CONFIRM: database,
};

function command(args: string[], env = baseEnv, cwd = root) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveResult, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('CLI_TEST_TIMEOUT')); }, 15000);
    child.stdout.on('data', bytes => { stdout += bytes; });
    child.stderr.on('data', bytes => { stderr += bytes; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => { clearTimeout(timeout); resolveResult({ code, stdout, stderr }); });
  });
}
function invocation(...args: string[]) { return [runner, cli, ...args]; }
function checkArgs() {
  return ['--check', '--input', join(scratch, 'owner.json'), '--source-file', join(scratch, sourceName), '--target', join(scratch, 'target.json')];
}
function redacted(result: { stdout: string; stderr: string }) {
  expect(result.stderr).toBe('');
  for (const value of [privateMarker, 'PRIVATE_PASSWORD_MARKER', 'postgresql://', scratch, 'SELECT ', 'INSERT ']) {
    expect(result.stdout).not.toContain(value);
  }
  const lines = result.stdout.trim().split('\n');
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]);
}
beforeAll(async () => {
  expect(process.versions.node.split('.')[0]).toBe('24');
  scratch = await mkdtemp(join(tmpdir(), 'msf-m13-cli-test-'));
  await writeFile(join(scratch, 'owner.json'), JSON.stringify({ inputVersion: 1, owner: { displayName: privateMarker, contactEmail: null } }));
  await writeFile(join(scratch, 'target.json'), JSON.stringify({ targetVersion: 1, environment: 'disposable', host: '127.0.0.1',
    port: 55432, database, role: 'exec_test_app', tls: 'disabled', runId: 'synthetic-cli-test' }));
  await writeFile(join(scratch, sourceName), 'Synthetic invalid source, not the private Charter');
});
afterAll(async () => {
  // Only this test's mkdtemp directory, never the checkout or any database.
  if (scratch && scratch.startsWith(join(tmpdir(), 'msf-m13-cli-test-'))) await rm(scratch, { recursive: true, force: true });
});

describe('BOOT-14 actual Node24/local-tsx operator process before connection', () => {
  it('help needs no input, environment, generated client or connection', async () => {
    const result = await command(invocation('--help'), { ...baseEnv, EXECUTIVE_BOOTSTRAP_DATABASE_URL: undefined,
      EXECUTIVE_BOOTSTRAP_DATABASE_CONFIRM: undefined });
    expect(result.code).toBe(0);
    expect(redacted(result).status).toBe('HELP');
  });
  it.each([[], ['--force'], ['--check', '--apply'], ['--help', '--check'], ['--source-file']].map(args => ({ args })))('rejects malformed flags without echo: $args', async ({ args }) => {
    const result = await command(invocation(...args));
    expect(result.code).toBe(2);
    expect(redacted(result)).toMatchObject({ reasonCode: 'INPUT_INVALID', diagnostic: { auditPersisted: false } });
  });
  it('rejects bad source provenance before constructing a database client', async () => {
    const result = await command(invocation(...checkArgs()));
    expect(result.code).toBe(2);
    expect(redacted(result).reasonCode).toBe('PROVENANCE_INVALID');
  });
  it.each([
    { NODE_ENV: 'production' }, { EXECUTIVE_BOOTSTRAP_DATABASE_CONFIRM: 'wrong' },
    { EXECUTIVE_BOOTSTRAP_DATABASE_URL: 'postgresql://exec_test_app:PRIVATE_PASSWORD_MARKER@production.invalid/db' },
    { EXECUTIVE_BOOTSTRAP_DATABASE_URL: undefined, DATABASE_URL: baseEnv.EXECUTIVE_BOOTSTRAP_DATABASE_URL },
  ])('rejects dangerous/missing target without dotenv or app fallback: %j', async overrides => {
    const result = await command(invocation(...checkArgs()), { ...baseEnv, ...overrides } as NodeJS.ProcessEnv);
    expect(result.code).toBe(2);
    expect(redacted(result).reasonCode).toBe('TARGET_INVALID');
  });
  it('requires apply confirmation before source work', async () => {
    const args = checkArgs(); args[0] = '--apply';
    const result = await command(invocation(...args, '--confirm-target', 'wrong'));
    expect(result.code).toBe(2);
    expect(redacted(result).reasonCode).toBe('TARGET_INVALID');
  });
  it('missing local runner fails without a PATH/global/npx fallback', async () => {
    const missing = join(scratch, 'missing-runner'); await mkdir(missing);
    const result = await command(['./node_modules/tsx/dist/cli.mjs', 'scripts/executive/bootstrap.ts', '--help'], baseEnv, missing);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('MODULE_NOT_FOUND');
    expect(result.stdout).toBe('');
  });
  it('package command explicitly pins local runner and has no lifecycle bootstrap hook', async () => {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    expect(pkg.devDependencies.tsx).toBe('4.23.15');
    expect(pkg.scripts['executive:bootstrap']).toBe('node ./node_modules/tsx/dist/cli.mjs scripts/executive/bootstrap.ts');
    for (const [key, value] of Object.entries(pkg.scripts)) if (key !== 'executive:bootstrap') expect(value).not.toContain('executive/bootstrap');
    expect(await readFile(join(root, 'Dockerfile'), 'utf8')).not.toContain('executive:bootstrap');
  });
});
