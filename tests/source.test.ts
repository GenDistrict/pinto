import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  compareSnapshots,
  initializeBaseline,
  changes,
  backup,
  restore,
  updatePlan,
  applyUpdate,
} from '../scripts/lib/source.mjs';
test('update comparison preserves local edits and flags overlapping upstream changes', () => {
  const result = compareSnapshots(
    { a: 'base', b: 'base', c: 'base' },
    { a: 'mine', b: 'base', c: 'mine', local: 'new' },
    { a: 'base', b: 'new', c: 'upstream', added: 'new' },
  );
  assert.deepEqual(result.changes, [
    { path: 'added', action: 'copy' },
    { path: 'b', action: 'copy' },
  ]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].path, 'c');
  assert.deepEqual(compareSnapshots({ a: 'old' }, { a: 'mine' }, { a: 'mine' }), {
    changes: [],
    conflicts: [],
  });
});
test('reinstallation keeps baseline, backup restores source, and conflicts never replace files', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pinto-source-'));
  try {
    const root = path.join(temp, 'source'),
      incoming = path.join(temp, 'incoming');
    await mkdir(root);
    await mkdir(incoming);
    const pkg = JSON.stringify({ name: 'pinto-image-notes', version: '0.1.0' });
    for (const dir of [root, incoming]) {
      await writeFile(path.join(dir, 'package.json'), pkg);
      await writeFile(path.join(dir, 'ui.txt'), 'original');
    }
    await initializeBaseline(root);
    await writeFile(path.join(root, 'ui.txt'), 'my customization');
    await initializeBaseline(root);
    assert.deepEqual(await changes(root), [{ path: 'ui.txt', change: 'modified' }]);
    const saved = await backup(root);
    await writeFile(path.join(root, 'ui.txt'), 'broken');
    await restore(root, saved.id);
    assert.equal(await readFile(path.join(root, 'ui.txt'), 'utf8'), 'my customization');
    await writeFile(path.join(incoming, 'ui.txt'), 'upstream change');
    assert.equal((await updatePlan(root, incoming)).conflicts.length, 1);
    const result = await applyUpdate(root, incoming);
    assert.equal(result.status, 'conflicts');
    assert.equal(await readFile(path.join(root, 'ui.txt'), 'utf8'), 'my customization');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
