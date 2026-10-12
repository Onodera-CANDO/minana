// 本番ビルドを vite preview で起動し、Chromium（モバイル相当ビューポート）で主要導線を確認するスモークテスト。
// 使い方: npm run build && npm run e2e
// - カメラは Chromium の疑似デバイス（顔は映らない）を使うため、「顔が見つかりません」までを確認する
// - 実機での顔照合・ホーム画面追加の確認は README の実機検証項目を参照
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'test-results');
mkdirSync(shots, { recursive: true });
const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const PASS = 'e2eテスト用パスフレーズ';

console.log('starting preview');
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
// 起動待ち（ポーリング）
for (let i = 0; ; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    // not yet
  }
  if (i > 100) throw new Error('preview server timeout');
  await new Promise((r) => setTimeout(r, 200));
}

const executablePath = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch({
  executablePath,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true, locale: 'ja-JP', permissions: ['camera'] });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
console.log('browser ready');
const external = [];
page.on('request', (r) => {
  const u = new URL(r.url());
  if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) external.push(r.url());
});
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

let step = 0;
const ok = (msg) => console.log(`✓ ${++step}. ${msg}`);
const shot = (name) => page.screenshot({ path: join(shots, `${String(step).padStart(2, '0')}-${name}.png`), fullPage: false });

try {
  await page.goto(BASE);
  await page.getByText('People Memory へようこそ').waitFor();
  await shot('setup');
  await page.getByLabel('上記を理解しました').check();
  await page.getByRole('button', { name: '次へ：パスフレーズ設定' }).click();
  await page.getByLabel('パスフレーズ', { exact: true }).fill(PASS);
  await page.getByLabel('パスフレーズ（確認）').fill(PASS);
  await page.getByRole('button', { name: 'はじめる' }).click();
  await page.getByRole('link', { name: /カメラで照合する/ }).waitFor();
  ok('初回セットアップ → ホーム');
  await shot('home-empty');

  // 手動登録
  await page.getByRole('link', { name: '＋ 人物を追加' }).click();
  await page.getByLabel('氏名').fill('手動 登録子');
  await page.getByLabel('会社名').fill('架空テスト株式会社');
  await page.getByLabel('役職').fill('課長');
  await page.getByLabel('タグ').fill('e2e, テスト');
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByText('登録しました。続けて次のこともできます').waitFor();
  ok('手動新規登録 → 顔登録・面会記録の案内');
  await shot('person-created');

  // 面会記録（今日会った → 保存）
  await page.getByRole('link', { name: /今日会った/ }).click();
  await page.getByLabel('場所').fill('架空ホール');
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByText('1回', { exact: true }).waitFor();
  ok('面会記録（2タップ＋入力）→ 面会回数 1回');
  // 重複警告
  await page.getByRole('link', { name: /今日会った/ }).click();
  await page.getByLabel('場所').fill('架空ホール');
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByText('同じ日の面会が登録済みです').waitFor();
  await page.getByRole('button', { name: 'キャンセル' }).click();
  await page.getByRole('button', { name: /戻る/ }).click();
  ok('同日の重複面会を警告');

  // CSV取込（UTF-8 BOM）
  await page.goto(BASE + '#/import');
  await page.getByLabel('確認しました').check();
  await page.locator('input[type=file]').setInputFiles(join(root, 'sample-data/sansan_dummy_utf8_bom.csv'));
  await page.getByText('列の割当').waitFor();
  await shot('import-mapping');
  await page.getByRole('button', { name: '取込内容を確認' }).click();
  await page.getByText('重複要確認（1件）').waitFor();
  await shot('import-preview');
  await page.getByRole('button', { name: '取り込みを開始' }).click();
  await page.getByText('確認待ちの候補（1件）').waitFor();
  ok('Sansan想定CSV（UTF-8 BOM）取込 → 結果・確認待ち候補');
  await shot('import-result');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /問題行をCSVでダウンロード/ }).click();
  const problems = await dl;
  ok(`問題行CSVをダウンロード（${problems.suggestedFilename()}）`);

  // CP932 取込（同じ内容なので名刺IDで更新扱いになる）
  await page.goto(BASE + '#/import');
  await page.getByLabel('確認しました').check();
  await page.locator('input[type=file]').setInputFiles(join(root, 'sample-data/sansan_dummy_cp932.csv'));
  await page.getByText('Shift_JIS で読み込みました').waitFor();
  await page.getByRole('button', { name: '取込内容を確認' }).click();
  await page.getByText(/既存人物の更新（\d+件）/).waitFor();
  ok('CP932 を自動判定し、再取込は既存人物の更新として分類');
  await page.getByRole('button', { name: '取り込みを開始' }).click();
  await page.getByText('取込結果').first().waitFor();

  // 一覧・検索
  await page.goto(BASE + '#/people');
  await page.getByLabel('キーワード検索').fill('さとう');
  await page.getByText('2件 /').waitFor();
  ok('人物検索（ふりがな）で同姓同名2名を表示（自動マージされていない）');
  await shot('people-search');

  // 1,000行
  await page.goto(BASE + '#/import');
  await page.getByLabel('確認しました').check();
  const t0 = Date.now();
  await page.locator('input[type=file]').setInputFiles(join(root, 'sample-data/dummy_1000.csv'));
  await page.getByRole('button', { name: '取込内容を確認' }).click();
  await page.getByRole('button', { name: '取り込みを開始' }).click();
  await page.getByText('確認待ちの候補').or(page.getByRole('link', { name: '人物一覧を見る' })).first().waitFor({ timeout: 60000 });
  ok(`1,000行CSVの取込完了（約${((Date.now() - t0) / 1000).toFixed(1)}秒・headless Chromium）`);

  // カメラ（疑似デバイス：顔なし）
  await page.goto(BASE + '#/camera');
  await page.getByText('登録済みの人物だけを照合します').waitFor();
  await page.evaluate(() => {
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__tracks = [];
    navigator.mediaDevices.getUserMedia = async (c) => {
      const s = await orig(c);
      window.__tracks.push(...s.getTracks());
      return s;
    };
  });
  await page.getByRole('button', { name: 'カメラを起動' }).click();
  await page.getByText('顔が見つかりません').waitFor({ timeout: 90000 });
  ok('カメラ起動 → 顔認識モデル読込 → 「顔が見つかりません」（疑似カメラ）');
  await shot('camera-noface');
  await page.getByRole('link', { name: 'ホーム' }).click();
  const states = await page.evaluate(() => window.__tracks.map((t) => t.readyState));
  if (!states.length || states.some((s) => s !== 'ended')) throw new Error(`track not stopped: ${states}`);
  ok('カメラ画面を離れるとトラック停止（readyState=ended）');

  // バックアップ
  await page.goto(BASE + '#/settings/backup');
  await page.getByLabel('バックアップ用パスフレーズ').fill('バックアップ用の合言葉');
  await page.getByLabel('パスフレーズ（確認）').fill('バックアップ用の合言葉');
  const dl2 = page.waitForEvent('download');
  await page.getByRole('button', { name: 'バックアップを書き出す' }).click();
  const backup = await dl2;
  const backupPath = join(shots, backup.suggestedFilename());
  await backup.saveAs(backupPath);
  ok('暗号化バックアップを書き出し');

  // ロック → 解除（ページ再読込でもロックされることを確認）
  await page.getByRole('link', { name: 'ホーム' }).click();
  await page.getByRole('button', { name: '今すぐロック' }).click();
  await page.getByText('ロック中').waitFor();
  await page.getByLabel('パスフレーズ').fill('まちがいパスフレーズ');
  await page.getByRole('button', { name: 'ロック解除' }).click();
  await page.getByText('パスフレーズが違います').waitFor();
  await page.getByLabel('パスフレーズ').fill(PASS);
  await page.getByRole('button', { name: 'ロック解除' }).click();
  await page.getByRole('link', { name: /カメラで照合する/ }).waitFor();
  ok('ロック／誤パスフレーズ拒否／解除');
  await shot('home-filled');

  // オフライン（SW キャッシュ）
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null || false, null, { timeout: 15000 }).catch(() => undefined);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15000 });
  await ctx.setOffline(true);
  await page.reload();
  await page.getByText('ロック中').waitFor();
  await page.getByLabel('パスフレーズ').fill(PASS);
  await page.getByRole('button', { name: 'ロック解除' }).click();
  await page.getByRole('link', { name: /カメラで照合する/ }).waitFor();
  ok('オフラインで起動・ロック解除・ホーム表示（Service Worker）');
  await ctx.setOffline(false);

  // 別ストレージへの復元（新しいコンテキスト＝別のブラウザストレージ）
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP' });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE);
  await p2.getByLabel('上記を理解しました').check();
  await p2.getByRole('button', { name: '次へ：パスフレーズ設定' }).click();
  await p2.getByLabel('パスフレーズ', { exact: true }).fill('別端末のパスフレーズ');
  await p2.getByLabel('パスフレーズ（確認）').fill('別端末のパスフレーズ');
  await p2.getByRole('button', { name: 'はじめる' }).click();
  await p2.goto(BASE + '#/settings/backup');
  await p2.locator('input[type=file]').setInputFiles(backupPath);
  await p2.getByLabel('バックアップのパスフレーズ').fill('バックアップ用の合言葉');
  await p2.getByRole('button', { name: '内容を確認' }).click();
  await p2.getByText(/人物 \d+件/).first().waitFor();
  await p2.getByRole('button', { name: 'このバックアップで上書き復元' }).click();
  await p2.getByRole('button', { name: '上書きする' }).click();
  await p2.getByText('復元しました。').waitFor();
  await p2.goto(BASE + '#/people?q=' + encodeURIComponent('登録子'));
  await p2.getByText('手動 登録子').waitFor();
  ok('別のブラウザストレージにバックアップを復元');
  await ctx2.close();

  if (external.length) throw new Error(`外部への通信を検出: ${external.join(', ')}`);
  ok('外部オリジンへのリクエストなし');
  const serious = consoleErrors.filter((e) => !/favicon|Failed to load resource: net::ERR_INTERNET_DISCONNECTED/.test(e));
  if (serious.length) console.log('console errors:', serious);
  console.log('\nE2E smoke: ALL PASSED');
} catch (e) {
  await shot('FAILED').catch(() => undefined);
  console.error('E2E smoke FAILED at step', step + 1, e);
  if (consoleErrors.length) console.error('console errors:', consoleErrors);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => undefined);
  server.kill();
  process.exit(process.exitCode ?? 0);
}
