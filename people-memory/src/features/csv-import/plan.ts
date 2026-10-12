import { CSV_MANAGED_FIELDS, type CsvManagedField, type MappedRow, type Person, type SourceSystem } from '../../types';
import { normalizeCompany, normalizeEmail, normalizeName } from '../people/normalize';

// 取込プレビュー用の分類（仕様 4.4）。この段階では何も保存しない。

export type PlanKind = 'create' | 'update' | 'review' | 'invalid';

export type MatchReason = 'external_card_id' | 'external_person_id' | 'email' | 'name_company';

export const MATCH_REASON_LABEL: Record<MatchReason, string> = {
  external_card_id: '名刺IDが一致（同じ名刺レコード）',
  external_person_id: '人物IDが一致',
  email: 'メールアドレスが一致（共有アドレスの可能性あり）',
  name_company: '氏名＋会社名が一致（同姓同名別人の可能性あり）',
};

export type FieldChange = {
  field: CsvManagedField;
  before?: string;
  after: string;
  /** 利用者が手動で編集した項目との衝突 */
  manualConflict: boolean;
};

export type PlannedRow = {
  index: number; // rows 配列の index
  rowNumber: number; // CSV上の行番号（ヘッダー=1）
  kind: PlanKind;
  mapped: MappedRow;
  raw: string[];
  /** update/review 時の対象 */
  targetPersonId?: string;
  /** 同じCSV内で先に登場した行が対象（新規作成予定の人物） */
  targetRowIndex?: number;
  reason?: MatchReason;
  candidatePersonIds?: string[];
  changes?: FieldChange[];
  message?: string;
};

/** MappedRow → Person の CSV 管理項目 */
export function mappedToFields(m: MappedRow): Partial<Record<CsvManagedField, string>> {
  return {
    fullName: m.fullName,
    nameKana: m.nameKana,
    companyName: m.companyName,
    department: m.department,
    jobTitle: m.jobTitle,
    email: m.email,
    phone: m.phone,
    companyAddress: m.companyAddress,
    csvNotes: m.notesFromCsv,
  };
}

/** 差分計算: CSV の空欄は既存値を消さない（保守的） */
export function diffFields(p: Person, m: MappedRow): FieldChange[] {
  const f = mappedToFields(m);
  const out: FieldChange[] = [];
  for (const k of CSV_MANAGED_FIELDS) {
    const after = f[k];
    if (!after) continue;
    const before = p[k];
    if ((before ?? '') === after) continue;
    out.push({ field: k, before, after, manualConflict: !!p.manuallyEditedFields?.includes(k) && !!before });
  }
  return out;
}

type Index = {
  byCard: Map<string, string>;
  byPid: Map<string, string>;
  byEmail: Map<string, string[]>;
  byNameCompany: Map<string, string[]>;
};

function push(map: Map<string, string[]>, k: string, v: string) {
  const a = map.get(k);
  if (a) {
    if (!a.includes(v)) a.push(v);
  } else map.set(k, [v]);
}

function buildIndex(people: Person[]): Index {
  const idx: Index = { byCard: new Map(), byPid: new Map(), byEmail: new Map(), byNameCompany: new Map() };
  for (const p of people) {
    for (const r of p.sourceRefs) {
      if (r.externalCardId) idx.byCard.set(`${r.source}|${r.externalCardId}`, p.id);
      if (r.externalPersonId) idx.byPid.set(`${r.source}|${r.externalPersonId}`, p.id);
    }
    const e = normalizeEmail(p.email);
    if (e) push(idx.byEmail, e, p.id);
    const nc = nameCompanyKey(p.fullName, p.companyName);
    if (nc) push(idx.byNameCompany, nc, p.id);
  }
  return idx;
}

function firstHit(...pairs: [string, Map<string, number>][]): number | undefined {
  for (const [k, m] of pairs) {
    if (k && m.has(k)) return m.get(k);
  }
  return undefined;
}

function nameCompanyKey(name?: string, company?: string): string {
  const n = normalizeName(name);
  const c = normalizeCompany(company);
  return n && c ? `${n}|${c}` : '';
}

/**
 * 各行を create / update / review / invalid に分類。
 * - 名刺ID・人物ID（同一 sourceSystem）一致 → update（プレビューで差分提示）
 * - メール一致・氏名＋会社一致 → review（自動マージ禁止、利用者が判断）
 * - 名前だけの一致では重複扱いしない（同名別人を考慮）
 * - 同じCSV内の重複（同一人物IDの複数名刺など）も検出する
 */
export function planImport(
  rows: { mapped: MappedRow; raw: string[] }[],
  people: Person[],
  source: SourceSystem,
): PlannedRow[] {
  const idx = buildIndex(people);
  const byId = new Map(people.map((p) => [p.id, p]));
  // CSV内で新規作成予定の行の索引（値は "row:<index>"）
  const fileCard = new Map<string, number>();
  const filePid = new Map<string, number>();
  const fileEmail = new Map<string, number>();
  const fileNameCompany = new Map<string, number>();

  return rows.map(({ mapped, raw }, index): PlannedRow => {
    const base = { index, rowNumber: index + 2, mapped, raw };
    if (!mapped.fullName?.trim()) {
      return { ...base, kind: 'invalid', message: '氏名が空です' };
    }
    const cardKey = mapped.externalCardId ? `${source}|${mapped.externalCardId}` : '';
    const pidKey = mapped.externalPersonId ? `${source}|${mapped.externalPersonId}` : '';
    const email = normalizeEmail(mapped.email);
    const nc = nameCompanyKey(mapped.fullName, mapped.companyName);

    // 既存データとの照合
    const existingId = (cardKey && idx.byCard.get(cardKey)) || (pidKey && idx.byPid.get(pidKey)) || undefined;
    if (existingId) {
      const p = byId.get(existingId)!;
      return {
        ...base,
        kind: 'update',
        targetPersonId: existingId,
        reason: cardKey && idx.byCard.get(cardKey) ? 'external_card_id' : 'external_person_id',
        changes: diffFields(p, mapped),
      };
    }
    // 同じCSV内の先行行との照合（新規作成予定の人物への追加名刺）
    const fileRow = firstHit([cardKey, fileCard], [pidKey, filePid]);
    if (fileRow !== undefined) {
      return {
        ...base,
        kind: 'update',
        targetRowIndex: fileRow,
        reason: cardKey && fileCard.has(cardKey) ? 'external_card_id' : 'external_person_id',
        message: `このCSVの${fileRow + 2}行目と同じ人物として扱います`,
      };
    }

    const emailHits = email ? idx.byEmail.get(email) ?? [] : [];
    const ncHits = nc ? idx.byNameCompany.get(nc) ?? [] : [];
    const candidates = [...new Set([...emailHits, ...ncHits])];
    if (candidates.length) {
      return {
        ...base,
        kind: 'review',
        reason: emailHits.length ? 'email' : 'name_company',
        candidatePersonIds: candidates,
        targetPersonId: candidates[0],
        changes: diffFields(byId.get(candidates[0])!, mapped),
      };
    }
    const fileReview = firstHit([email, fileEmail], [nc, fileNameCompany]);
    if (fileReview !== undefined) {
      return {
        ...base,
        kind: 'review',
        reason: email && fileEmail.has(email) ? 'email' : 'name_company',
        targetRowIndex: fileReview,
        message: `このCSVの${fileReview + 2}行目と重複の可能性があります`,
      };
    }

    if (cardKey) fileCard.set(cardKey, index);
    if (pidKey) filePid.set(pidKey, index);
    if (email) fileEmail.set(email, index);
    if (nc) fileNameCompany.set(nc, index);
    return { ...base, kind: 'create' };
  });
}

export function summarizePlan(plan: PlannedRow[]) {
  const c = { create: 0, update: 0, review: 0, invalid: 0 };
  for (const r of plan) c[r.kind]++;
  return c;
}
