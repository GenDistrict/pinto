import { promises as fs } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ROOT } from './lib/runtime.mjs';
import { applyUpdate, restore, changes } from './lib/source.mjs';
const install = JSON.parse(
  await fs.readFile(path.join(ROOT, '.test-data/clean-install-report.json'), 'utf8'),
);
const target = path.resolve(install.source),
  relative = path.relative(path.join(ROOT, '.test-data'), target);
if (relative.startsWith('..') || path.isAbsolute(relative))
  throw new Error('Unexpected verification target');
const preferences = path.join(target, 'AGENTS.md');
await fs.appendFile(preferences, '\nLocal user preference: preserve my custom notes.\n');
const personal = await fs.readFile(preferences, 'utf8');
await fs.writeFile(path.join(target, 'personal-note.txt'), 'My locally added file.');
const updated = await applyUpdate(target, ROOT);
assert.equal(updated.status, 'updated');
assert.equal(await fs.readFile(preferences, 'utf8'), personal);
assert.equal(
  await fs.readFile(path.join(target, 'personal-note.txt'), 'utf8'),
  'My locally added file.',
);
assert.deepEqual(
  await fs.readFile(path.join(target, 'src/renderer/styles.css')),
  await fs.readFile(path.join(ROOT, 'src/renderer/styles.css')),
);
const restored = await restore(target, updated.backup);
assert.equal(restored.status, 'restored');
assert.equal(await fs.readFile(preferences, 'utf8'), personal);
assert.ok((await changes(target)).some((entry) => entry.path === 'AGENTS.md'));
const report = {
  status: 'passed',
  candidateBuilt: true,
  personalChangesPreserved: true,
  installedRuntimeReplaced: true,
  previousRuntimeRestored: true,
  backup: updated.backup,
};
await fs.writeFile(
  path.join(ROOT, '.test-data/update-report.json'),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
