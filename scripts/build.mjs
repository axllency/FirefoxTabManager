import { build } from 'esbuild';
import { mkdir, cp, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await build({ entryPoints: { background: 'src/background.ts', app: 'src/app.ts' }, outdir: 'dist', bundle: true, format: 'iife', target: 'firefox128', sourcemap: true });
await build({ entryPoints: ['src/core.ts'], outfile: 'dist/core.mjs', bundle: true, format: 'esm', target: 'node20' });
await cp('static', 'dist', { recursive: true });
