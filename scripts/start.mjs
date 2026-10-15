import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import electron from 'electron';
const root = fileURLToPath(new URL('../', import.meta.url));
if (!existsSync(path.join(root, 'dist/main/index.cjs'))) {
  console.error('Build PINTO first: npm run build');
  process.exit(1);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [root, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  windowsHide: false,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
