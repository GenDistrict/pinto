import { promises as fs } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { ROOT, run } from './lib/runtime.mjs';
import { sourceSnapshot } from './lib/source.mjs';

if (process.platform !== 'win32')
  throw new Error(
    'This local clean-bootstrap test is for Windows. macOS is covered by its CI runner.',
  );
const destination = path.join(ROOT, '.test-data', `clean-install-${Date.now()}`);
for (const rel of Object.keys(await sourceSnapshot(ROOT))) {
  const target = path.join(destination, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(path.join(ROOT, rel), target);
}
const system = process.env.SystemRoot || 'C:\\Windows';
const env = {
  ...process.env,
  PATH: [
    path.join(system, 'System32'),
    system,
    path.join(system, 'System32/WindowsPowerShell/v1.0'),
  ].join(';'),
};
delete env.ELECTRON_RUN_AS_NODE;
await run(
  path.join(system, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
  ['-NoProfile', '-File', path.join(destination, 'install.ps1'), '-Language', 'es', '-NoShortcut', '-NoLaunch'],
  { cwd: destination, env },
);
const report = JSON.parse(
  await fs.readFile(path.join(destination, '.pinto/install-result.json'), 'utf8'),
);
assert.equal(report.status, 'installed');
assert.equal(report.windowReady, false);
assert.equal(report.sourceEditable, true);
assert.equal(report.locale, 'es');
assert.ok(report.nodePath.startsWith(path.join(destination, '.pinto/runtime')));
const ready = await new Promise((resolve, reject) => {
  let output = '';
  const child = spawn(
    report.nodePath,
    [
      path.join(destination, 'scripts/launch.mjs'),
      '--isolated',
      '--background',
      '--language',
      'es',
      '--data-dir',
      path.join(destination, '.test-data/runtime-data'),
      '--workspace',
      destination,
    ],
    { cwd: destination, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  child.on('error', reject);
  child.on('exit', (code) => {
    if (code) return reject(new Error('Fresh installation did not launch'));
    try {
      resolve(JSON.parse(output));
    } catch (e) {
      reject(e);
    }
  });
});
assert.equal(ready.status, 'ready');
assert.equal(ready.windowReady, true);
assert.equal(ready.locale, 'es');
assert.doesNotMatch(ready.assistantMessage, /[가-힣]/);
assert.equal(ready.sourceRoot, path.resolve(destination));
assert.ok(ready.assistantMessage.length > 30);
// This is the empty, isolated verification instance created above.
process.kill(ready.pid);
const summary = {
  status: 'passed',
  source: destination,
  usedPrivateNode: true,
  windowReady: true,
  sourceEditable: true,
  launcherExists: true,
  assistantMessagePresent: true,
};
await fs.writeFile(
  path.join(ROOT, '.test-data/clean-install-report.json'),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
