import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { ROOT, DATA, electronPath, npmCLI } from './lib/runtime.mjs';
export async function diagnose(root = ROOT) {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const [major, minor] = process.versions.node.split('.').map(Number);
  const checks = {
    node: major > 22 || (major === 22 && minor >= 12),
    electron: false,
    build: false,
    sourceWritable: false,
  };
  try {
    await electronPath(root);
    checks.electron = true;
  } catch {}
  try {
    await fs.access(path.join(root, 'dist/main/index.cjs'));
    await fs.access(path.join(root, 'dist/renderer/index.html'));
    checks.build = true;
  } catch {}
  try {
    await fs.access(root, constants.W_OK);
    checks.sourceWritable = true;
  } catch {}
  return {
    status: Object.values(checks).every(Boolean) ? 'ok' : 'needs-setup',
    name: 'PINTO',
    version: pkg.version,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    nodePath: process.execPath,
    npmCli: await npmCLI(),
    sourceRoot: root,
    dataPath: DATA,
    sourceEditable: true,
    checks,
    commands: {
      build: 'npm run build',
      start: 'npm start',
      check: 'npm run check',
      test: 'npm test',
      launch: {
        executable: process.execPath,
        args: [path.join(root, 'scripts/launch.mjs')],
        cwd: root,
      },
    },
    modificationGuide: path.join(root, 'AGENTS.md'),
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'scripts/doctor.mjs')) {
  try {
    const result = await diagnose();
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'ok') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
