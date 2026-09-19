import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({ entryPoints: { background: 'src/background.ts', app: 'src/app.ts' }, outdir: 'dist', bundle: true, format: 'iife', target: 'chrome127', sourcemap: true });
await build({ entryPoints: ['src/core.ts'], outfile: 'dist/core.mjs', bundle: true, format: 'esm', target: 'node20' });
await cp('static', 'dist', { recursive: true });
