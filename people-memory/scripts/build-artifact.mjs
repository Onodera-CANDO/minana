// claude.ai Artifact で画面を確認するためのプレビュー版を生成する。
// SW・CSP・顔モデルを含まない。出力: dist-artifact/artifact.html（+ assets/）
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-artifact');
execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'artifact'], { cwd: root, stdio: 'inherit' });

const html = readFileSync(join(out, 'index.html'), 'utf8');
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/g)].map((m) => readFileSync(join(out, m[1]), 'utf8')).join('\n');
const script = html.match(/<script type="module"[^>]*src="\.\/([^"]+)"/)[1];
const page = `<title>People Memory</title>
<meta name="theme-color" content="#0f766e">
<style>
${css}
</style>
<div id="root"></div>
<script type="module" crossorigin src="./${script}"></script>
`;
writeFileSync(join(out, 'artifact.html'), page);
console.log(`[artifact] dist-artifact/artifact.html (script: ${script})`);
