import { build as viteBuild } from 'vite';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
await viteBuild({
  root: path.join(root, 'src/renderer'),
  base: './',
  publicDir: path.join(root, 'assets'),
  build: { outDir: path.join(root, 'dist/renderer'), emptyOutDir: true, target: 'es2022' },
});
for (const [entry, outfile] of [
  ['src/main/index.ts', 'dist/main/index.cjs'],
  ['src/preload/index.ts', 'dist/preload/index.cjs'],
]) {
  await build({
    entryPoints: [path.join(root, entry)],
    outfile: path.join(root, outfile),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: true,
  });
}
console.log('PINTO build complete.');
