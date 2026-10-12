// @vladmandic/human 同梱モデルのうち、MVPで使うものだけを public/models へコピーする。
// 外部CDNに依存せず自サイト内から配信するため（仕様 9章）。
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@vladmandic/human/models');
const dest = join(root, 'public/models');

// 顔検出(blazeface) / 顔向き推定用ランドマーク(facemesh) / 特徴量(faceres)
// ※ emotion / age / gender 等の属性推定は仕様で禁止のため、emotion 等はコピーしない。
const MODELS = ['blazeface', 'facemesh', 'faceres'];

if (!existsSync(src)) {
  console.error('[copy-models] @vladmandic/human が見つかりません。npm install を実行してください。');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const m of MODELS) {
  for (const ext of ['json', 'bin']) {
    copyFileSync(join(src, `${m}.${ext}`), join(dest, `${m}.${ext}`));
  }
}
console.log(`[copy-models] copied: ${MODELS.join(', ')}`);
