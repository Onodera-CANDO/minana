// 照合・検索用の正規化。全角/半角・空白・大小文字・カナ揺れを吸収する。

/** ひらがな → カタカナ */
export function hiraToKata(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

// よくある旧字体・異体字（氏名照合用の最小セット。完全ではない）
const VARIANTS: Record<string, string> = {
  髙: '高', 﨑: '崎', 嵜: '崎', 邊: '辺', 邉: '辺', 齋: '斉', 齊: '斉', 斎: '斉', 澤: '沢', 濱: '浜', 廣: '広',
  國: '国', 櫻: '桜', 眞: '真', 惠: '恵', 實: '実', 壽: '寿', 冨: '富', 德: '徳', 槇: '槙', 藪: '薮',
};

export function normalizeText(s: string | undefined | null): string {
  if (!s) return '';
  let t = s.normalize('NFKC').toLowerCase();
  t = t.replace(/[\s　]+/g, '');
  t = hiraToKata(t);
  t = t.replace(/./g, (c) => VARIANTS[c] ?? c);
  return t;
}

export function normalizeName(s: string | undefined | null): string {
  return normalizeText(s).replace(/[・･.,、。'’"“”()（）]/g, '');
}

const COMPANY_AFFIXES = /(株式会社|有限会社|合同会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|\(株\)|\(有\)|\(同\)|㈱|㈲|inc\.?|co\.?,?ltd\.?|ltd\.?|corp\.?|corporation|llc)/g;

export function normalizeCompany(s: string | undefined | null): string {
  return normalizeText(s).replace(COMPANY_AFFIXES, '').replace(/[・･.,、。()（）]/g, '');
}

export function normalizeEmail(s: string | undefined | null): string {
  return (s ?? '').normalize('NFKC').trim().toLowerCase();
}

export function normalizePhone(s: string | undefined | null): string {
  return (s ?? '').normalize('NFKC').replace(/[^\d+]/g, '');
}
