import type { MappedRow } from '../../types';

export type MappingTarget = Exclude<keyof MappedRow, 'extra'>;

export const MAPPING_TARGETS: { key: MappingTarget; label: string }[] = [
  { key: 'fullName', label: '氏名' },
  { key: 'familyName', label: '姓' },
  { key: 'givenName', label: '名' },
  { key: 'nameKana', label: '氏名（ふりがな）' },
  { key: 'companyName', label: '会社名' },
  { key: 'department', label: '部署' },
  { key: 'jobTitle', label: '役職' },
  { key: 'email', label: 'メールアドレス' },
  { key: 'phone', label: '電話番号' },
  { key: 'companyAddress', label: '住所' },
  { key: 'businessCardDate', label: '名刺交換日' },
  { key: 'notesFromCsv', label: 'メモ・備考' },
  { key: 'externalPersonId', label: '外部 人物ID' },
  { key: 'externalCardId', label: '外部 名刺ID' },
];

/** 列index → 内部項目（未割当は null） */
export type ColumnMapping = (MappingTarget | null)[];

// 想定CSV列名例（仕様 4.3）。Sansan の実列名を保証するものではない。
const SYNONYMS: Record<MappingTarget, string[]> = {
  externalPersonId: ['人物id', 'personid', '人物ｉｄ'],
  externalCardId: ['名刺id', 'cardid', '名刺ｉｄ'],
  fullName: ['氏名', '名前', 'フルネーム', 'name', 'fullname', '氏名漢字'],
  familyName: ['姓', '苗字', '名字', 'lastname', 'familyname', 'surname'],
  givenName: ['名', 'firstname', 'givenname'],
  nameKana: ['氏名かな', '氏名カナ', 'フリガナ', 'ふりがな', 'よみがな', 'カナ', '氏名ふりがな', '氏名フリガナ', 'kana', 'namekana'],
  companyName: ['会社名', '企業名', '会社', '社名', '所属', 'company', 'companyname', 'organization'],
  department: ['部署名', '部署', '部門', 'department', 'division'],
  jobTitle: ['役職', '肩書', '肩書き', '役職名', 'title', 'jobtitle', 'position'],
  email: ['e-mail', 'email', 'メールアドレス', 'メール', 'mail', 'emailaddress'],
  phone: ['電話番号', '携帯電話', '携帯電話番号', '携帯', 'tel', 'phone', '電話', 'mobile', '会社電話番号'],
  companyAddress: ['住所', '所在地', '会社住所', 'address', '住所1'],
  businessCardDate: ['名刺交換日', '交換日', '名刺交換日時', 'exchangedate'],
  notesFromCsv: ['メモ', '備考', 'note', 'notes', 'memo', 'コメント'],
};

function norm(h: string): string {
  return h.normalize('NFKC').toLowerCase().replace(/[\s_（）()【】[\]・:：]/g, '');
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const used = new Set<MappingTarget>();
  const result: ColumnMapping = headers.map(() => null);
  // 1) 完全一致 2) 部分一致 の順で割当
  for (const pass of ['exact', 'partial'] as const) {
    headers.forEach((h, i) => {
      if (result[i]) return;
      const n = norm(h);
      for (const t of Object.keys(SYNONYMS) as MappingTarget[]) {
        if (used.has(t)) continue;
        const hit = SYNONYMS[t].some((s) => {
          const ns = norm(s);
          return pass === 'exact' ? n === ns : ns.length >= 2 && n.includes(ns);
        });
        if (hit) {
          result[i] = t;
          used.add(t);
          break;
        }
      }
    });
  }
  return result;
}

export function validateMapping(m: ColumnMapping): string | null {
  const has = (t: MappingTarget) => m.includes(t);
  const dup = m.filter((t): t is MappingTarget => !!t).find((t, i, arr) => arr.indexOf(t) !== i);
  if (dup) return `「${MAPPING_TARGETS.find((x) => x.key === dup)?.label}」が複数列に割り当てられています`;
  if (!has('fullName') && !(has('familyName') || has('givenName')))
    return '「氏名」または「姓／名」の列を割り当ててください';
  return null;
}

export function applyMapping(row: string[], headers: string[], m: ColumnMapping, keepExtra: boolean): MappedRow {
  const out: MappedRow = {};
  const extra: Record<string, string> = {};
  m.forEach((t, i) => {
    const v = (row[i] ?? '').trim();
    if (!v) return;
    if (t) out[t] = v;
    else if (keepExtra) extra[headers[i]] = v;
  });
  if (!out.fullName && (out.familyName || out.givenName)) {
    // 日本語名は「姓 名」、ラテン文字のみなら「名 姓」とせず入力順（姓 名）で統一
    out.fullName = [out.familyName, out.givenName].filter(Boolean).join(' ');
  }
  if (keepExtra && Object.keys(extra).length) out.extra = extra;
  return out;
}
