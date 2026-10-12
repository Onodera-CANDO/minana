// ダミーCSV生成（実在の人物・名刺は含めない。会社名・メールはすべて架空 / example ドメイン）
// 出力: sample-data/*.csv
// ※ 列名は仕様書 4.3 の「想定例」に基づくもので、Sansan の実際の列名を保証しない。
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'sample-data');
mkdirSync(out, { recursive: true });

const esc = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCsv = (rows) => rows.map((r) => r.map((c) => esc(String(c ?? ''))).join(',')).join('\r\n') + '\r\n';

const SANSAN_HEADER = ['名刺ID', '人物ID', '会社名', '部署名', '役職', '氏名', '氏名（かな）', 'E-mail', '電話番号', '携帯電話', '住所', '名刺交換日', 'メモ'];

const base = [
  ['C0001', 'P0001', '株式会社サンプル商事', '営業部', '部長', '山田 太郎', 'やまだ たろう', 'taro.yamada@example.com', '03-0000-0001', '090-0000-0001', '東京都千代田区架空町1-1', '2026/04/01', '交流会で名刺交換'],
  ['C0002', 'P0002', 'テスト工業株式会社', '経営企画室', '代表取締役', '佐藤 花子', 'さとう はなこ', 'hanako.sato@example.net', '06-0000-0002', '', '大阪府大阪市架空区2-2', '2026/04/03', '引用符"と,カンマ,を含むメモ'],
  ['C0003', 'P0003', 'ダミーデザイン合同会社', '', 'ディレクター', '鈴木 一郎', 'すずき いちろう', 'ichiro@example.org', '', '080-0000-0003', '', '2026/05/10', '改行を含む\nメモ2行目'],
  // 同一人物（人物ID P0001）の別名刺：転職後
  ['C0004', 'P0001', '株式会社ニューサンプル', '事業開発部', '執行役員', '山田 太郎', 'やまだ たろう', 'taro@example.com', '03-0000-0004', '090-0000-0001', '東京都港区架空2-3', '2026/06/15', '転職後の名刺'],
  // 同姓同名の別人（会社もメールも異なる）
  ['C0005', 'P0005', 'フィクション不動産株式会社', '', '取締役', '佐藤 花子', 'さとう はなこ', 'h.sato@example.jp', '', '', '', '2026/05/20', '同姓同名の別人'],
  // 全角英数字・全角スペース・旧字体
  ['C0006', 'P0006', '架空システムズ株式会社', '開発部', 'ＣＴＯ', '髙橋　美咲', 'たかはし みさき', 'ＭＩＳＡＫＩ@EXAMPLE.COM', '０３－００００－０００６', '', '', '2026/06/01', ''],
  // 式から始まるセル（CSVインジェクション検証）
  ['C0007', 'P0007', '=HYPERLINK("http://example.invalid","click")', '', '+役職', '@田中 健', 'たなか けん', '-test@example.com', '', '', '', '', '=1+1'],
  // 氏名が空（無効行）
  ['C0008', 'P0008', '名前なし株式会社', '', '', '', '', 'noname@example.com', '', '', '', '', ''],
  // 空欄の多い行
  ['C0009', '', '', '', '', '伊藤 誠', '', '', '', '', '', '', ''],
  // 共有アドレス（メール一致だが別人の可能性）
  ['C0010', 'P0010', 'テスト工業株式会社', '総務部', '', '小林 直子', 'こばやし なおこ', 'info@example.net', '', '', '', '2026/07/01', ''],
  ['C0011', 'P0011', 'テスト工業株式会社', '総務部', '', '加藤 学', 'かとう まなぶ', 'info@example.net', '', '', '', '2026/07/01', '共有アドレス'],
];

// 1) UTF-8 BOM 付き
writeFileSync(join(out, 'sansan_dummy_utf8_bom.csv'), '﻿' + toCsv([SANSAN_HEADER, ...base]), 'utf8');

// 2) CP932（Shift_JIS）: iconv がある環境のみ生成
try {
  const utf8 = toCsv([SANSAN_HEADER, ...base]);
  const sjis = execFileSync('iconv', ['-f', 'UTF-8', '-t', 'CP932'], { input: utf8 });
  writeFileSync(join(out, 'sansan_dummy_cp932.csv'), sjis);
} catch (e) {
  console.warn('[gen] iconv が使えないため CP932 版はスキップしました', e.message);
}

// 3) 姓/名 分割・列順変更・BOMなし（一般CSV）
const generic = [
  ['メールアドレス', '名', '姓', '会社', '肩書', 'フリガナ', '備考'],
  ['kenji.watanabe@example.com', '健司', '渡辺', '架空物産株式会社', '課長', 'ワタナベ ケンジ', '展示会'],
  ['yumi.nakamura@example.org', '由美', '中村', 'サンプル出版', '編集長', 'ナカムラ ユミ', ''],
  ['taro.yamada@example.com', '太郎', '山田', '株式会社サンプル商事', '部長', 'ヤマダ タロウ', 'Sansan側と同一メール'],
];
writeFileSync(join(out, 'generic_split_name_reordered.csv'), toCsv(generic), 'utf8');

// 4) 再取込用（同じ名刺IDで役職・部署が変更）
const reimport = [
  SANSAN_HEADER,
  ['C0001', 'P0001', '株式会社サンプル商事', '営業本部', '本部長', '山田 太郎', 'やまだ たろう', 'taro.yamada@example.com', '03-0000-0001', '090-0000-0001', '東京都千代田区架空町1-1', '2026/04/01', ''],
  ['C0002', 'P0002', 'テスト工業株式会社', '経営企画室', '代表取締役社長', '佐藤 花子', 'さとう はなこ', 'hanako.sato@example.net', '06-0000-0002', '', '大阪府大阪市架空区2-2', '2026/04/03', ''],
  ['C0012', 'P0012', '新規ダミー株式会社', '', '', '松本 光', 'まつもと ひかる', 'hikaru@example.com', '', '', '', '2026/08/01', ''],
];
writeFileSync(join(out, 'sansan_dummy_reimport.csv'), '﻿' + toCsv(reimport), 'utf8');

// 5) 1,000行
const FAMILY = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '松本', '井上'];
const GIVEN = ['太郎', '花子', '一郎', '美咲', '健', '直子', '学', '由美', '誠', '光', '翔', '葵', '陽菜', '蓮', '結衣'];
const big = [SANSAN_HEADER];
for (let i = 1; i <= 1000; i++) {
  const f = FAMILY[i % FAMILY.length];
  const g = GIVEN[Math.floor(i / FAMILY.length) % GIVEN.length];
  const id = String(i).padStart(5, '0');
  big.push([`BC${id}`, `BP${id}`, `ダミー企業${(i % 120) + 1}株式会社`, `部署${i % 7}`, ['部長', '課長', '主任', '担当', '代表'][i % 5], `${f} ${g}`, '', `user${id}@example.com`, '', '', '', `2026/0${(i % 9) + 1}/1${i % 10}`, i % 50 === 0 ? 'メモ, カンマ入り' : '']);
}
writeFileSync(join(out, 'dummy_1000.csv'), '﻿' + toCsv(big), 'utf8');

console.log('[gen] sample-data に出力しました');
