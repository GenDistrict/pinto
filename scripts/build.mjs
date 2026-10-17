import { build as viteBuild } from 'vite';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cp, mkdir } from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
await viteBuild({
  root: path.join(root, 'src/renderer'),
  base: './',
  publicDir: path.join(root, 'assets'),
  build: { outDir: path.join(root, 'dist/renderer'), emptyOutDir: true, target: 'es2022' },
});
await mkdir(path.join(root, 'dist/renderer/pdfjs'), { recursive: true });
for (const part of ['cmaps', 'standard_fonts'])
  await cp(
    path.join(root, 'node_modules/pdfjs-dist', part),
    path.join(root, 'dist/renderer/pdfjs', part),
    { recursive: true },
  );
await cp(
  path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
  path.join(root, 'dist/renderer/pdfjs/pdf.worker.min.mjs'),
);
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
