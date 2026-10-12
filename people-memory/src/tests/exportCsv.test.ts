import { describe, expect, it } from 'vitest';
import { escapeCell, sanitizeCell, toCsv } from '../features/csv-import/exportCsv';

describe('CSV 書き出し', () => {
  it('式から始まるセルを無害化する', () => {
    for (const v of ['=1+1', '+A1', '-2', '@SUM(A1)', '\tx']) expect(sanitizeCell(v).startsWith("'")).toBe(true);
    expect(sanitizeCell('山田')).toBe('山田');
  });
  it('RFC4180 でエスケープ', () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('a"b')).toBe('"a""b"');
    expect(escapeCell('=a,b')).toBe(`"'=a,b"`);
    expect(toCsv([['x', 'y']])).toBe('﻿x,y\r\n');
  });
});
