import { describe, expect, it } from 'vitest';
import { applyMapping, suggestMapping, validateMapping } from '../features/csv-import/mapping';
import { decodeCsv, parseCsv } from '../features/csv-import/decode';
import { sample } from './helpers';

describe('列マッピング', () => {
  it('Sansan想定ヘッダーを自動推定する', () => {
    const { headers } = parseCsv(decodeCsv(sample('sansan_dummy_utf8_bom.csv')).text);
    const m = suggestMapping(headers);
    const at = (h: string) => m[headers.indexOf(h)];
    expect(at('名刺ID')).toBe('externalCardId');
    expect(at('人物ID')).toBe('externalPersonId');
    expect(at('氏名')).toBe('fullName');
    expect(at('氏名（かな）')).toBe('nameKana');
    expect(at('会社名')).toBe('companyName');
    expect(at('部署名')).toBe('department');
    expect(at('役職')).toBe('jobTitle');
    expect(at('E-mail')).toBe('email');
    expect(at('電話番号')).toBe('phone');
    expect(at('名刺交換日')).toBe('businessCardDate');
    expect(at('メモ')).toBe('notesFromCsv');
    expect(validateMapping(m)).toBeNull();
  });

  it('姓／名に分かれた・列順の違うCSVでも氏名を組み立てる', () => {
    const p = parseCsv(decodeCsv(sample('generic_split_name_reordered.csv')).text);
    const m = suggestMapping(p.headers);
    expect(validateMapping(m)).toBeNull();
    const row = applyMapping(p.rows[0], p.headers, m, false);
    expect(row.fullName).toBe('渡辺 健司');
    expect(row.email).toBe('kenji.watanabe@example.com');
    expect(row.companyName).toBe('架空物産株式会社');
    expect(row.jobTitle).toBe('課長');
    expect(row.nameKana).toBe('ワタナベ ケンジ');
  });

  it('氏名列がないと検証エラー', () => {
    expect(validateMapping(['companyName', null])).not.toBeNull();
    expect(validateMapping(['fullName', 'fullName'])).toMatch(/複数列/);
  });

  it('未割当列は既定で保存しない／明示時のみ extra に入る', () => {
    const headers = ['氏名', '趣味'];
    expect(applyMapping(['a', 'ゴルフ'], headers, ['fullName', null], false).extra).toBeUndefined();
    expect(applyMapping(['a', 'ゴルフ'], headers, ['fullName', null], true).extra).toEqual({ 趣味: 'ゴルフ' });
  });
});
