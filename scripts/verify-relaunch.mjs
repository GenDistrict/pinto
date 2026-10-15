import { promises as fs } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ROOT } from './lib/runtime.mjs';
import { launch } from './launch.mjs';
const data = path.join(ROOT, '.test-data', `relaunch-${Date.now()}`);
await fs.mkdir(data, { recursive: true });
let first;
try {
  const args = ['--background', '--data-dir', data, '--workspace', path.resolve(ROOT)];
  first = await launch(args);
  assert.equal(path.resolve(first.dataPath), path.resolve(data));
  const second = await launch(args);
  assert.equal(second.pid, first.pid);
  assert.equal(second.workspace, path.resolve(ROOT));
  assert.equal(second.windowReady, true);
  assert.equal(second.windowVisible, false);
  console.log(
    JSON.stringify({
      status: 'passed',
      sameProcess: true,
      correctWorkspace: true,
      readyResponse: true,
    }),
  );
} finally {
  // Only the empty isolated-profile test instance created by this script.
  if (first && path.resolve(first.dataPath) === path.resolve(data)) {
    process.kill(first.pid);
    await fs.rm(path.join(ROOT, '.pinto/running', `${first.pid}.json`), { force: true });
  }
}
