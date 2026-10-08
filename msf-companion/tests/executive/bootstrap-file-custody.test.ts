import { afterEach, describe, expect, it } from 'vitest';
import { link, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBoundedFile } from '../../src/lib/executive/bootstrap-config';

const ownedDirectories: string[] = [];

async function fixture(): Promise<{ directory: string; source: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'executive-bootstrap-custody-'));
  ownedDirectories.push(directory);
  const source = join(directory, 'private-input.json');
  await writeFile(source, '{"inputVersion":1}\n', { mode: 0o600 });
  return { directory, source };
}

afterEach(async () => {
  await Promise.all(ownedDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('private bootstrap file custody', () => {
  it('accepts a regular, single-link file within the bound', async () => {
    const { source } = await fixture();
    expect((await readBoundedFile(source, 1024)).toString('utf8')).toBe('{"inputVersion":1}\n');
  });

  it('rejects a hard-linked file even when the content and size are valid', async () => {
    const { directory, source } = await fixture();
    await link(source, join(directory, 'second-path.json'));
    await expect(readBoundedFile(source, 1024)).rejects.toThrow('INVALID_FILE');
  });

  it('rejects a symbolic link to an otherwise valid private file', async () => {
    const { directory, source } = await fixture();
    const alias = join(directory, 'alias.json');
    await symlink(source, alias);
    await expect(readBoundedFile(alias, 1024)).rejects.toThrow('INVALID_FILE');
  });
});
