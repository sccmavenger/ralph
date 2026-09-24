import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import type { PoolConfig } from 'pg';
import { assertUnicode, decodeUtf8, exactObject, parseStrictJson } from './canonical';
import type { BootstrapArguments, BootstrapInput, BootstrapTarget } from './contracts';

export async function readBoundedFile(path: string, limit: number): Promise<Buffer> {
  const resolved = resolve(path);
  // A handle binds metadata and contents; no streams/devices, symlinks or unbounded reads.
  const before = await lstat(resolved);
  if (!before.isFile() || before.size > limit || before.size === 0) throw new Error('INVALID_FILE');
  const flags = process.platform === 'win32' ? constants.O_RDONLY :
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const handle = await open(resolved, flags);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit || stat.size === 0 || stat.dev !== before.dev || stat.ino !== before.ino ||
        stat.size !== before.size || stat.mtimeMs !== before.mtimeMs || stat.ctimeMs !== before.ctimeMs) throw new Error('INVALID_FILE');
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > limit || length !== stat.size) throw new Error('INVALID_FILE');
    const after = await handle.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new Error('INVALID_FILE');
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

export async function readPrivateJson(path: string): Promise<unknown> {
  return parseStrictJson(decodeUtf8(await readBoundedFile(path, 16 * 1024)));
}

export function parseBootstrapArguments(args: string[]): BootstrapArguments {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const flags = new Map<string, string>();
  const valueFlags = new Set(['--input', '--source-file', '--target', '--confirm-target']);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flags.has(flag)) throw new Error('INVALID_ARGUMENTS');
    if (flag === '--check' || flag === '--apply') flags.set(flag, '');
    else if (valueFlags.has(flag)) {
      const value = args[++index];
      if (!value || value.startsWith('--') || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) throw new Error('INVALID_ARGUMENTS');
      assertUnicode(value);
      flags.set(flag, value);
    } else throw new Error('INVALID_ARGUMENTS');
  }
  if (flags.has('--check') === flags.has('--apply') ||
      !flags.has('--input') || !flags.has('--source-file') || !flags.has('--target') ||
      flags.has('--apply') !== flags.has('--confirm-target')) throw new Error('INVALID_ARGUMENTS');
  return { help: false, mode: flags.has('--apply') ? 'apply' : 'check',
    inputPath: flags.get('--input')!, sourcePath: flags.get('--source-file')!,
    targetPath: flags.get('--target')!, confirmTarget: flags.get('--confirm-target') };
}

export function validateBootstrapInput(value: unknown): BootstrapInput {
  const input = exactObject(value, ['inputVersion', 'owner']);
  const owner = exactObject(input.owner, ['displayName', 'contactEmail']);
  if (input.inputVersion !== 1 || typeof owner.displayName !== 'string') throw new Error('INVALID_INPUT');
  assertUnicode(owner.displayName);
  if (owner.displayName.trim() !== owner.displayName || [...owner.displayName].length < 1 ||
      [...owner.displayName].length > 200 || /[\p{Cc}\p{Cf}]/u.test(owner.displayName)) throw new Error('INVALID_INPUT');
  if (owner.contactEmail !== null) {
    if (typeof owner.contactEmail !== 'string') throw new Error('INVALID_INPUT');
    assertUnicode(owner.contactEmail);
    // Metadata only: one plain ASCII mailbox, not an authentication credential.
    if (owner.contactEmail.length > 320 || /\s/.test(owner.contactEmail) || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(owner.contactEmail)) {
      throw new Error('INVALID_INPUT');
    }
  }
  return { inputVersion: 1, owner: { displayName: owner.displayName, contactEmail: owner.contactEmail as string | null } };
}

export function validateBootstrapTarget(value: unknown): BootstrapTarget {
  const target = exactObject(value, ['targetVersion', 'environment', 'host', 'port', 'database', 'role', 'tls', 'runId']);
  if (target.targetVersion !== 1 || target.environment !== 'disposable' || target.host !== '127.0.0.1' ||
      target.port !== 55432 || target.role !== 'exec_test_app' || target.tls !== 'disabled' ||
      typeof target.database !== 'string' || /^msf_exec_m12_[a-z0-9][a-z0-9_]{0,49}$/.exec(target.database)?.[0] !== target.database ||
      typeof target.runId !== 'string' || /^[A-Za-z0-9-]{1,100}$/.exec(target.runId)?.[0] !== target.runId) throw new Error('INVALID_TARGET');
  return target as unknown as BootstrapTarget;
}

export function bootstrapConnection(target: BootstrapTarget, mode: 'check' | 'apply', confirmTarget: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env): PoolConfig {
  if (env.NODE_ENV !== 'test' || Boolean(env.PGBINARY) || env.EXECUTIVE_BOOTSTRAP_DATABASE_CONFIRM !== target.database ||
      (mode === 'apply' && confirmTarget !== target.database)) throw new Error('INVALID_TARGET');
  const match = /^(postgresql|postgres):\/\/([^:@/?#\s]+):([^@/?#\s]+)@127\.0\.0\.1:55432\/(msf_exec_m12_[a-z0-9][a-z0-9_]{0,49})$/.exec(env.EXECUTIVE_BOOTSTRAP_DATABASE_URL ?? '');
  if (!match || match[0] !== env.EXECUTIVE_BOOTSTRAP_DATABASE_URL || match[2] !== target.role || match[4] !== target.database) throw new Error('INVALID_TARGET');
  let password: string;
  try { password = decodeURIComponent(match[3]); } catch { throw new Error('INVALID_TARGET'); }
  if (!password.trim() || /[\x00-\x1f\x7f]/.test(password)) throw new Error('INVALID_TARGET');
  const configuration: PoolConfig & { replication: 'false' } = {
    host: target.host, port: target.port, user: target.role, password, database: target.database,
    ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 10000, query_timeout: 20000,
    lock_timeout: 5000, idle_in_transaction_session_timeout: 15000,
    options: '-c search_path=pg_catalog', client_encoding: 'UTF8', replication: 'false',
    application_name: 'msf-executive-bootstrap-v1', max: 1 };
  return configuration;
}
