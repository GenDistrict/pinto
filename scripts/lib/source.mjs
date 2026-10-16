import { tr } from '../../src/core/i18n.mjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { runNpm, run, writeJSON, cleanEnv } from './runtime.mjs';
const excluded = new Set([
  'node_modules',
  'media',
  'dist',
  '.git',
  '.pinto',
  '.cache',
  '.brand-build',
  '.test-data',
  '.image-notes',
  '.pinto-demo',
  'test-results',
  'playwright-report',
  '__pycache__',
]);
const excludedFiles = new Set(['PINTO.vbs', 'PINTO.command', 'PINTO.lnk']);
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
export async function sourceSnapshot(root) {
  const result = {};
  async function visit(directory, prefix = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (
        excluded.has(entry.name) ||
        entry.isSymbolicLink() ||
        excludedFiles.has(entry.name) ||
        entry.name.endsWith('.log') ||
        entry.name.endsWith('.pyc')
      )
        continue;
      const rel = prefix + entry.name;
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), rel + '/');
      else if (entry.isFile())
        result[rel] = hash(await fs.readFile(path.join(directory, entry.name)));
    }
  }
  await visit(root);
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
async function safeFile(root, relative) {
  if (
    typeof relative !== 'string' ||
    !relative ||
    relative.includes('\\') ||
    relative.split('/').some((p) => p === '..' || p === '.' || p.includes(':')) ||
    path.isAbsolute(relative)
  )
    throw new Error('Unsafe source path');
  const absolute = path.resolve(root, relative),
    rel = path.relative(path.resolve(root), absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path leaves source directory');
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink())
        throw new Error('Symlinks are not replaced during updates');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return absolute;
}
async function copyFiles(from, to, files) {
  for (const rel of files) {
    const src = await safeFile(from, rel),
      dest = await safeFile(to, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
}
export async function initializeBaseline(root) {
  const file = path.join(root, '.pinto/baseline.json');
  try {
    await fs.access(file);
    return;
  } catch {}
  await writeJSON(file, {
    version: 1,
    createdAt: new Date().toISOString(),
    files: await sourceSnapshot(root),
  });
}
export async function changes(root) {
  const baseline = JSON.parse(await fs.readFile(path.join(root, '.pinto/baseline.json'), 'utf8'));
  const current = await sourceSnapshot(root);
  return [...new Set([...Object.keys(baseline.files), ...Object.keys(current)])]
    .filter((p) => baseline.files[p] !== current[p])
    .map((p) => ({
      path: p,
      change: !baseline.files[p] ? 'added' : !current[p] ? 'removed' : 'modified',
    }));
}
export function compareSnapshots(base, local, incoming) {
  const changes = [],
    conflicts = [];
  for (const p of [
    ...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(incoming)]),
  ].sort()) {
    if (incoming[p] === base[p] || incoming[p] === local[p]) continue;
    if (local[p] === base[p]) changes.push({ path: p, action: incoming[p] ? 'copy' : 'remove' });
    else
      conflicts.push({
        path: p,
        local: local[p] || null,
        base: base[p] || null,
        incoming: incoming[p] || null,
      });
  }
  return { changes, conflicts };
}
export async function updatePlan(root, incomingRoot) {
  if (path.resolve(root) === path.resolve(incomingRoot)) throw new Error(tr('m217'));
  const pkg = JSON.parse(await fs.readFile(path.join(incomingRoot, 'package.json'), 'utf8'));
  if (pkg.name !== 'pinto-image-notes') throw new Error(tr('m218'));
  const base = JSON.parse(await fs.readFile(path.join(root, '.pinto/baseline.json'), 'utf8'));
  const local = await sourceSnapshot(root),
    incoming = await sourceSnapshot(incomingRoot);
  return {
    root,
    incomingRoot,
    version: pkg.version,
    ...compareSnapshots(base.files, local, incoming),
    local,
    incoming,
  };
}
export async function backup(root) {
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8),
    directory = path.join(root, '.pinto/backups', id);
  const files = await sourceSnapshot(root);
  await copyFiles(root, path.join(directory, 'files'), Object.keys(files));
  let baseline;
  try {
    baseline = JSON.parse(await fs.readFile(path.join(root, '.pinto/baseline.json'), 'utf8'));
  } catch {}
  await writeJSON(path.join(directory, 'backup.json'), {
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    files,
    baseline,
  });
  return { id, directory };
}
async function ensureClosed(root) {
  const dir = path.join(root, '.pinto/running');
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {}
  for (const name of names) {
    try {
      const record = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
      try {
        process.kill(record.pid, 0);
      } catch {
        continue;
      }
      throw new Error(tr('m219'));
    } catch (error) {
      if (error.message.startsWith('PINTO')) throw error;
    }
  }
}
async function removeGenerated(root, name) {
  if (!['dist', 'node_modules'].includes(name)) throw new Error('Unknown generated directory');
  const target = await safeFile(root, name);
  if (path.dirname(target) !== path.resolve(root)) throw new Error('Invalid generated target');
  await fs.rm(target, { recursive: true, force: true });
}
async function restoreSources(root, directory) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'backup.json'), 'utf8'));
  if (manifest.version !== 1) throw new Error('Unknown backup version');
  const current = await sourceSnapshot(root);
  for (const rel of Object.keys(current))
    if (!(rel in manifest.files)) await fs.rm(await safeFile(root, rel), { force: true });
  await copyFiles(path.join(directory, 'files'), root, Object.keys(manifest.files));
  if (manifest.baseline)
    await writeJSON(path.join(root, '.pinto/baseline.json'), manifest.baseline);
}
export async function applyUpdate(root, incomingRoot) {
  await ensureClosed(root);
  const plan = await updatePlan(root, incomingRoot);
  if (plan.conflicts.length)
    return {
      status: 'conflicts',
      conflicts: plan.conflicts,
      message: tr('m220'),
    };
  const stage = path.join(root, '.pinto/update-stage', randomUUID());
  await copyFiles(root, stage, Object.keys(plan.local));
  for (const change of plan.changes) {
    if (change.action === 'copy') await copyFiles(incomingRoot, stage, [change.path]);
    else await fs.rm(await safeFile(stage, change.path), { force: true });
  }
  const env = { ...cleanEnv(), electron_config_cache: path.join(root, '.pinto/electron-cache') };
  const options = { cwd: stage, env };
  // Build the candidate completely before touching the installed version.
  await runNpm(
    ['ci', '--no-audit', '--no-fund', '--cache', path.join(root, '.pinto/npm-cache')],
    options,
  );
  await run(process.execPath, [path.join(stage, 'node_modules/electron/install.js')], options);
  for (const script of ['check', 'test', 'build']) await runNpm(['run', script], options);
  await ensureClosed(root);
  if (JSON.stringify(await sourceSnapshot(root)) !== JSON.stringify(plan.local))
    throw new Error(tr('m221'));
  if (JSON.stringify(await sourceSnapshot(incomingRoot)) !== JSON.stringify(plan.incoming))
    throw new Error(tr('m222'));
  const saved = await backup(root),
    swaps = [];
  try {
    for (const name of ['node_modules', 'dist']) {
      const old = path.join(root, name),
        stored = path.join(saved.directory, name);
      let existed = false;
      try {
        await fs.rename(old, stored);
        existed = true;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      swaps.push({ name, existed });
      await fs.rename(path.join(stage, name), old);
    }
    for (const change of plan.changes) {
      if (change.action === 'copy') await copyFiles(stage, root, [change.path]);
      else await fs.rm(await safeFile(root, change.path), { force: true });
    }
    await writeJSON(path.join(root, '.pinto/baseline.json'), {
      version: 1,
      createdAt: new Date().toISOString(),
      files: plan.incoming,
    });
    return {
      status: 'updated',
      version: plan.version,
      backup: saved.id,
      preservedLocalChanges: true,
    };
  } catch (error) {
    for (const swap of swaps.reverse()) {
      await removeGenerated(root, swap.name);
      if (swap.existed)
        await fs.rename(path.join(saved.directory, swap.name), path.join(root, swap.name));
    }
    await restoreSources(root, saved.directory);
    throw new Error(tr('m223', { p0: error.message }));
  }
}
export async function restore(root, id) {
  if (!id || !/^[\w-]+$/.test(id)) throw new Error(tr('m224'));
  await ensureClosed(root);
  const directory = path.join(root, '.pinto/backups', id);
  await fs.access(path.join(directory, 'backup.json'));
  const stage = path.join(root, '.pinto/restore-stage', randomUUID()),
    prepared = [];
  for (const name of ['dist', 'node_modules']) {
    try {
      await fs.access(path.join(directory, name));
    } catch {
      continue;
    }
    await fs.cp(path.join(directory, name), path.join(stage, name), { recursive: true });
    prepared.push(name);
  }
  const safety = await backup(root),
    swaps = [];
  try {
    for (const name of prepared) {
      let existed = false;
      try {
        await fs.rename(await safeFile(root, name), path.join(safety.directory, name));
        existed = true;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      swaps.push({ name, existed });
      await fs.rename(path.join(stage, name), path.join(root, name));
    }
    await restoreSources(root, directory);
    return { status: 'restored', backup: id, safetyBackup: safety.id };
  } catch (error) {
    for (const swap of swaps.reverse()) {
      await removeGenerated(root, swap.name);
      if (swap.existed)
        await fs.rename(path.join(safety.directory, swap.name), path.join(root, swap.name));
    }
    await restoreSources(root, safety.directory);
    throw new Error(tr('m225', { p0: error.message }));
  }
}
