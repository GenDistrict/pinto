import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DATA =
  process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library/Application Support/PINTO')
    : process.platform === 'win32'
      ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData/Roaming'), 'PINTO')
      : path.join(os.homedir(), '.config/PINTO');
export const shellQuote = (s) => "'" + s.replaceAll("'", "'\"'\"'") + "'";
export function cleanEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const key = Object.keys(env).find((name) => name.toLowerCase() === 'path');
  const inheritedPath = key ? env[key] : '';
  if (key && key !== 'PATH') delete env[key];
  env.PATH = path.dirname(process.execPath) + path.delimiter + (inheritedPath || '');
  return env;
}
export async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: cleanEnv(),
      stdio: 'inherit',
      windowsHide: true,
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${path.basename(command)} exited with code ${code}`)),
    );
  });
}
export async function npmCLI() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    try {
      const resolved = await fs.realpath(path.join(directory, 'npm'));
      if (resolved.endsWith('npm-cli.js')) return resolved;
    } catch {}
  }
  throw new Error(
    'npm 실행 파일을 찾지 못했습니다. install.ps1 또는 install.sh로 실행 환경을 준비하세요.',
  );
}
export async function runNpm(args, options = {}) {
  return run(process.execPath, [await npmCLI(), ...args], options);
}
export async function electronPath(root = ROOT) {
  const directory = path.join(root, 'node_modules/electron');
  const relative = (await fs.readFile(path.join(directory, 'path.txt'), 'utf8')).trim();
  const result = path.join(directory, 'dist', relative);
  await fs.access(result, constants.F_OK);
  return result;
}
export async function writeJSON(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  await fs.writeFile(temp, JSON.stringify(data, null, 2));
  await fs.rename(temp, file);
}
export function option(name, args = process.argv.slice(2)) {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
}
