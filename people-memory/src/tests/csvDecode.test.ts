import { describe, expect, it } from 'vitest';
import { decodeCsv, parseCsv } from '../features/csv-import/decode';
import { sample } from './helpers';

describe('CSV 文字コード', () => {
  it('UTF-8 BOM付きを読み、BOMを除去する', () => {
    const d = decodeCsv(sample('sansan_dummy_utf8_bom.csv'));
    expect(d.encoding).toBe('utf-8');
    expect(d.hadBom).toBe(true);
    expect(d.text.startsWith('名刺ID')).toBe(true);
  });

  it('CP932 を自動判定して読める', () => {
    const d = decodeCsv(sample('sansan_dummy_cp932.csv'));
    expect(d.utf8Invalid).toBe(true);
    expect(d.encoding).toBe('shift_jis');
    expect(d.text).toContain('株式会社サンプル商事');
    expect(d.text).toContain('髙橋');
  });

  it('文字コードを強制指定して再読込できる', () => {
    const wrong = decodeCsv(sample('sansan_dummy_cp932.csv'), 'utf-8');
    expect(wrong.text).not.toContain('株式会社サンプル商事');
    expect(decodeCsv(sample('sansan_dummy_cp932.csv'), 'shift_jis').text).toContain('株式会社サンプル商事');
  });
});

describe('CSV パース', () => {
  it('引用符・カンマ・改行を含むフィールドを正しく解析する', () => {
    const p = parseCsv(decodeCsv(sample('sansan_dummy_utf8_bom.csv')).text);
    expect(p.headers[0]).toBe('名刺ID');
    expect(p.rows).toHaveLength(11);
    expect(p.rows[1][12]).toBe('引用符"と,カンマ,を含むメモ');
    expect(p.rows[2][12]).toBe('改行を含む\nメモ2行目');
    expect(p.rows.every((r) => r.length === p.headers.length)).toBe(true);
  });

  it('重複ヘッダーを区別する', () => {
    const p = parseCsv('電話,電話,氏名\n1,2,a\n');
    expect(p.headers).toEqual(['電話', '電話 (2)', '氏名']);
  });

  it('1,000行を読める', () => {
    const p = parseCsv(decodeCsv(sample('dummy_1000.csv')).text);
    expect(p.rows).toHaveLength(1000);
  });
});
