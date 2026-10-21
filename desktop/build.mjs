// Bundles the panel and the service worker into dist/, the folder Chrome loads unpacked.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
await build({
  entryPoints: { panel: 'src/panel.ts', background: 'src/background.ts' },
  outdir: 'dist', bundle: true, format: 'iife', target: 'chrome116',
});
for (const file of ['manifest.json', 'panel.html', 'panel.css']) cpSync(file, `dist/${file}`);
