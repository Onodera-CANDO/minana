import { describe, expect, it } from 'vitest';
import { decodeCsv, parseCsv } from '../features/csv-import/decode';
import { applyMapping, suggestMapping } from '../features/csv-import/mapping';
import { planImport, summarizePlan } from '../features/csv-import/plan';
import { applyPlan, type RowDecision } from '../features/csv-import/apply';
import type { Person, SourceSystem } from '../types';
import { person, sample } from './helpers';

function rowsOf(file: string) {
  const p = parseCsv(decodeCsv(sample(file)).text);
  const m = suggestMapping(p.headers);
  return p.rows.map((raw) => ({ raw, mapped: applyMapping(raw, p.headers, m, false) }));
}

function run(file: string, people: Person[], source: SourceSystem = 'sansan', decisions = new Map<number, RowDecision>(), overwriteManual = false) {
  const plan = planImport(rowsOf(file), people, source);
  const res = applyPlan(plan, decisions, new Map(people.map((p) => [p.id, p])), { source, batchId: 'b1', now: '2026-10-12T00:00:00.000Z', overwriteManual });
  return { plan, res };
}

describe('取込プレビューの分類', () => {
  it('初回取込：無効行・同一人物の別名刺・同姓同名・共有アドレスを分類', () => {
    const { plan } = run('sansan_dummy_utf8_bom.csv', []);
    const byRow = (n: number) => plan.find((r) => r.rowNumber === n)!;
    expect(summarizePlan(plan)).toEqual({ create: 8, update: 1, review: 1, invalid: 1 });
    // 行5（人物ID P0001 の別名刺）は同じCSV内の行2と同一人物
    expect(byRow(5).kind).toBe('update');
    expect(byRow(5).targetRowIndex).toBe(0);
    // 同姓同名でも会社・メールが違えば新規（名前だけで重複扱いしない）
    expect(byRow(6).kind).toBe('create');
    // 氏名なしは無効
    expect(byRow(9).kind).toBe('invalid');
    // 共有アドレス info@ は重複要確認（自動マージしない）
    expect(byRow(12).kind).toBe('review');
    expect(byRow(12).reason).toBe('email');
  });

  it('同一人物の複数名刺は1人にまとまり、出典が2件残る', () => {
    const { res } = run('sansan_dummy_utf8_bom.csv', []);
    const yamada = res.creates.find((p) => p.sourceRefs.some((r) => r.externalPersonId === 'P0001'))!;
    expect(yamada.sourceRefs.map((r) => r.externalCardId)).toEqual(['C0001', 'C0004']);
    // 後の名刺で会社・役職が更新される（転職）
    expect(yamada.companyName).toBe('株式会社ニューサンプル');
    expect(res.creates.filter((p) => p.fullName === '山田 太郎')).toHaveLength(1);
  });

  it('保留の行は保存されず、結果に保留として残る', () => {
    const { res } = run('sansan_dummy_utf8_bom.csv', []);
    const held = res.results.filter((r) => r.status === 'review');
    expect(held).toHaveLength(1);
    expect(held[0].mapped?.fullName).toBe('加藤 学');
    expect(held[0].candidatePersonIds?.length).toBe(1);
    expect(res.creates.some((p) => p.fullName === '加藤 学')).toBe(false);
  });

  it('式から始まるセルは値としてそのまま保持（評価しない）', () => {
    const { res } = run('sansan_dummy_utf8_bom.csv', []);
    const p = res.creates.find((x) => x.fullName === '@田中 健')!;
    expect(p.companyName).toBe('=HYPERLINK("http://example.invalid","click")');
  });
});

describe('再取込', () => {
  it('名刺IDが一致すれば更新。手動メモ・タグ・IDは保持し、空欄で既存値を消さない', () => {
    const first = run('sansan_dummy_utf8_bom.csv', []);
    const people = first.res.creates.map((p) =>
      p.fullName === '佐藤 花子' && p.companyName === 'テスト工業株式会社' ? { ...p, notes: '手動メモ', tags: ['VIP'] } : p,
    );
    const hanako = people.find((p) => p.notes === '手動メモ')!;
    const { plan, res } = run('sansan_dummy_reimport.csv', people);
    expect(summarizePlan(plan)).toMatchObject({ update: 2, create: 1 });
    const updated = res.updates.find((p) => p.id === hanako.id)!;
    expect(updated.id).toBe(hanako.id);
    expect(updated.jobTitle).toBe('代表取締役社長');
    expect(updated.notes).toBe('手動メモ');
    expect(updated.tags).toEqual(['VIP']);
    // 再取込CSVのメモ列は空 → 既存のCSV備考を消さない
    expect(updated.csvNotes).toBe('引用符"と,カンマ,を含むメモ');
    // 同じ名刺IDの出典は重複追加しない
    expect(updated.sourceRefs.filter((r) => r.externalCardId === 'C0002')).toHaveLength(1);
  });

  it('手動編集した項目は既定で上書きしない（オプションで上書き可）', () => {
    const first = run('sansan_dummy_utf8_bom.csv', []);
    const people = first.res.creates.map((p) =>
      p.sourceRefs.some((r) => r.externalCardId === 'C0002') ? { ...p, jobTitle: '会長（手動）', manuallyEditedFields: ['jobTitle' as const] } : p,
    );
    const id = people.find((p) => p.jobTitle === '会長（手動）')!.id;
    const kept = run('sansan_dummy_reimport.csv', people).res.updates.find((p) => p.id === id)!;
    expect(kept.jobTitle).toBe('会長（手動）');
    const over = run('sansan_dummy_reimport.csv', people, 'sansan', new Map(), true).res.updates.find((p) => p.id === id)!;
    expect(over.jobTitle).toBe('代表取締役社長');
  });

  it('メール一致（手動登録データ）は自動マージせず要確認。承認すると既存IDに統合', () => {
    const manual = person({ fullName: '山田 太郎', email: 'Taro.Yamada@Example.com', notes: '手動' });
    const { plan } = run('generic_split_name_reordered.csv', [manual], 'generic_csv');
    const r = plan.find((x) => x.mapped.email === 'taro.yamada@example.com')!;
    expect(r.kind).toBe('review');
    expect(r.candidatePersonIds).toEqual([manual.id]);
    const d = new Map<number, RowDecision>([[r.index, { include: true, review: 'merge', mergeTargetId: manual.id }]]);
    const { res } = run('generic_split_name_reordered.csv', [manual], 'generic_csv', d);
    const merged = res.updates.find((p) => p.id === manual.id)!;
    expect(merged.notes).toBe('手動');
    expect(merged.sourceRefs.map((s) => s.source)).toEqual(['manual', 'generic_csv']);
  });

  it('別の sourceSystem の外部IDとは一致させない', () => {
    const p = person({ fullName: 'X', sourceRefs: [{ source: 'generic_csv', externalCardId: 'C0001' }] });
    const { plan } = run('sansan_dummy_reimport.csv', [p]);
    expect(plan[0].kind).toBe('create');
  });

  it('1,000行のプレビューと適用が実用的な時間で終わる', () => {
    const t0 = performance.now();
    const { plan, res } = run('dummy_1000.csv', []);
    const ms = performance.now() - t0;
    expect(plan).toHaveLength(1000);
    expect(res.creates.length).toBeGreaterThan(900);
    expect(ms).toBeLessThan(3000);
  });
});
