import Papa from 'papaparse';

export type CsvEncoding = 'utf-8' | 'shift_jis';

export type DecodedCsv = {
  text: string;
  encoding: CsvEncoding;
  hadBom: boolean;
  /** UTF-8 として不正なバイト列があった（Shift_JIS の可能性） */
  utf8Invalid: boolean;
};

/**
 * UTF-8（BOMあり/なし）を優先して復号。UTF-8として不正なら Shift_JIS(CP932) で読む。
 * 利用者は encoding を明示指定して再読込できる。
 * ※ WHATWG Encoding の "shift_jis" デコーダは Windows-31J(CP932) 相当。
 */
export function decodeCsv(buf: ArrayBuffer, forced?: CsvEncoding): DecodedCsv {
  const bytes = new Uint8Array(buf);
  const hadBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let utf8Invalid = false;
  let utf8Text: string | null = null;
  try {
    utf8Text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    utf8Invalid = true;
  }
  const encoding: CsvEncoding = forced ?? (utf8Invalid ? 'shift_jis' : 'utf-8');
  let text: string;
  if (encoding === 'utf-8') {
    text = utf8Text ?? new TextDecoder('utf-8').decode(bytes);
  } else {
    text = new TextDecoder('shift_jis').decode(bytes);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, encoding, hadBom, utf8Invalid };
}

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  errors: { row: number; message: string }[];
};

/** RFC4180 準拠のパース（引用符・改行・カンマを含むフィールド対応）。split(',') は使わない */
export function parseCsv(text: string): ParsedCsv {
  const res = Papa.parse<string[]>(text, { header: false, skipEmptyLines: 'greedy', delimiter: ',' });
  const all = res.data;
  const headers = (all[0] ?? []).map((h) => h.trim());
  // ヘッダー名の重複は区別できるよう番号を振る
  const seen = new Map<string, number>();
  const uniq = headers.map((h, i) => {
    const base = h || `列${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
  const errors = res.errors
    .filter((e) => e.type !== 'Delimiter')
    .map((e) => ({ row: (e.row ?? 0) + 1, message: e.message }));
  return { headers: uniq, rows: all.slice(1), errors };
}

/** 文字化けしていそうか（置換文字や半角カナ連続の多さで推定） */
export function looksGarbled(text: string): boolean {
  const sample = text.slice(0, 4000);
  if (!sample) return false;
  const bad = (sample.match(/�/g) ?? []).length;
  const hwKana = (sample.match(/[｡-ﾟ]/g) ?? []).length;
  return bad > 0 || hwKana / sample.length > 0.2;
}
