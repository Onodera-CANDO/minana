import type { CsvManagedField, ImportRowResult, MappedRow, Person, SourceRef, SourceSystem } from '../../types';
import { newId } from '../../app/id';
import { diffFields, type PlannedRow } from './plan';

export type ReviewDecision = 'hold' | 'merge' | 'create' | 'skip';

export type RowDecision = {
  include: boolean; // create/update 行を取り込むか
  review: ReviewDecision; // review 行の扱い
  mergeTargetId?: string; // review で merge を選んだ場合の既存人物
};

export type ApplyOptions = {
  source: SourceSystem;
  batchId: string;
  now: string;
  /** 手動編集済み項目も CSV で上書きするか（既定 false） */
  overwriteManual: boolean;
};

export type ApplyResult = {
  creates: Person[];
  updates: Person[];
  results: ImportRowResult[];
};

export function makeSourceRef(m: MappedRow, o: Pick<ApplyOptions, 'source' | 'batchId' | 'now'>): SourceRef {
  const ref: SourceRef = { source: o.source, importedAt: o.now, importBatchId: o.batchId };
  if (m.externalPersonId) ref.externalPersonId = m.externalPersonId;
  if (m.externalCardId) ref.externalCardId = m.externalCardId;
  if (m.businessCardDate) ref.businessCardDate = m.businessCardDate;
  if (m.extra) ref.sourceExtraFields = m.extra;
  return ref;
}

export function personFromMapped(m: MappedRow, o: Pick<ApplyOptions, 'source' | 'batchId' | 'now'>): Person {
  return {
    id: newId(),
    fullName: m.fullName!.trim(),
    nameKana: m.nameKana,
    companyName: m.companyName,
    department: m.department,
    jobTitle: m.jobTitle,
    email: m.email,
    phone: m.phone,
    companyAddress: m.companyAddress,
    csvNotes: m.notesFromCsv,
    tags: [],
    sourceRefs: [makeSourceRef(m, o)],
    createdAt: o.now,
    updatedAt: o.now,
  };
}

/**
 * 既存人物へ CSV の値を反映。人物ID・手動メモ・タグ・顔・面会・関係・同意記録には触れない。
 * 空欄は既存値を消さない。手動編集項目は overwriteManual が true の時だけ上書き。
 */
export function mergeIntoPerson(p: Person, m: MappedRow, o: Pick<ApplyOptions, 'source' | 'batchId' | 'now' | 'overwriteManual'>): { person: Person; changed: CsvManagedField[] } {
  const changes = diffFields(p, m);
  const next: Person = { ...p, sourceRefs: [...p.sourceRefs] };
  const changed: CsvManagedField[] = [];
  for (const c of changes) {
    if (c.manualConflict && !o.overwriteManual) continue;
    next[c.field] = c.after;
    changed.push(c.field);
  }
  if (o.overwriteManual && changed.length && next.manuallyEditedFields) {
    next.manuallyEditedFields = next.manuallyEditedFields.filter((f) => !changed.includes(f));
  }
  const ref = makeSourceRef(m, o);
  const i = next.sourceRefs.findIndex(
    (r) => r.source === ref.source && ((ref.externalCardId && r.externalCardId === ref.externalCardId) || (!ref.externalCardId && ref.externalPersonId && r.externalPersonId === ref.externalPersonId && !r.externalCardId)),
  );
  if (i >= 0) next.sourceRefs[i] = { ...next.sourceRefs[i], ...ref };
  else next.sourceRefs.push(ref);
  next.updatedAt = o.now;
  return { person: next, changed };
}

/** プレビューと利用者の判断から、保存すべき人物と行ごとの結果を作る（純粋関数） */
export function applyPlan(
  plan: PlannedRow[],
  decisions: Map<number, RowDecision>,
  people: Map<string, Person>,
  o: ApplyOptions,
): ApplyResult {
  const working = new Map(people); // 更新後の状態
  const createdIds = new Set<string>();
  const updatedIds = new Set<string>();
  const rowPerson = new Map<number, string>(); // 行index → 作成/更新された人物ID
  const results: ImportRowResult[] = [];

  const doCreate = (r: PlannedRow): string => {
    const p = personFromMapped(r.mapped, o);
    working.set(p.id, p);
    createdIds.add(p.id);
    rowPerson.set(r.index, p.id);
    return p.id;
  };
  const doMerge = (r: PlannedRow, targetId: string): string[] => {
    const cur = working.get(targetId)!;
    const { person, changed } = mergeIntoPerson(cur, r.mapped, o);
    working.set(targetId, person);
    if (!createdIds.has(targetId)) updatedIds.add(targetId);
    rowPerson.set(r.index, targetId);
    return changed;
  };

  for (const r of plan) {
    const d = decisions.get(r.index) ?? { include: true, review: 'hold' };
    const rowBase = { rowNumber: r.rowNumber };
    try {
      if (r.kind === 'invalid') {
        results.push({ ...rowBase, status: 'failed', message: r.message, raw: r.raw });
        continue;
      }
      if (r.kind === 'create') {
        if (!d.include) {
          results.push({ ...rowBase, status: 'skipped', message: '利用者がスキップ', raw: r.raw });
          continue;
        }
        results.push({ ...rowBase, status: 'created', personId: doCreate(r) });
        continue;
      }
      if (r.kind === 'update') {
        if (!d.include) {
          results.push({ ...rowBase, status: 'skipped', message: '利用者が更新をスキップ', raw: r.raw });
          continue;
        }
        const target = r.targetPersonId ?? (r.targetRowIndex !== undefined ? rowPerson.get(r.targetRowIndex) : undefined);
        if (!target || !working.has(target)) {
          // 同一CSV内の対象行がスキップされた → 新規作成
          results.push({ ...rowBase, status: 'created', personId: doCreate(r) });
          continue;
        }
        const changed = doMerge(r, target);
        const kept = (r.changes ?? []).filter((c) => c.manualConflict && !o.overwriteManual).length;
        results.push({
          ...rowBase,
          status: 'updated',
          personId: target,
          message: [changed.length ? `${changed.length}項目を更新` : '変更なし（出典のみ追記）', kept ? `手動編集の${kept}項目は保持` : '']
            .filter(Boolean)
            .join(' / '),
        });
        continue;
      }
      // review
      const inFileTarget = r.targetRowIndex !== undefined ? rowPerson.get(r.targetRowIndex) : undefined;
      const candidates = r.candidatePersonIds ?? (inFileTarget ? [inFileTarget] : []);
      if (d.review === 'merge') {
        const target = d.mergeTargetId ?? candidates[0];
        if (!target || !working.has(target)) throw new Error('統合先の人物が見つかりません');
        doMerge(r, target);
        results.push({ ...rowBase, status: 'merged', personId: target, message: '利用者の承認で既存人物に統合' });
      } else if (d.review === 'create') {
        results.push({ ...rowBase, status: 'created', personId: doCreate(r), message: '重複候補を確認のうえ新規登録' });
      } else if (d.review === 'skip') {
        results.push({ ...rowBase, status: 'skipped', message: '重複候補のためスキップ', raw: r.raw });
      } else {
        results.push({
          ...rowBase,
          status: 'review',
          message: r.message ?? '重複候補のため保留',
          mapped: r.mapped,
          candidatePersonIds: candidates,
          raw: r.raw,
        });
      }
    } catch (e) {
      results.push({ ...rowBase, status: 'failed', message: e instanceof Error ? e.message : '不明なエラー', raw: r.raw });
    }
  }

  return {
    creates: [...createdIds].map((id) => working.get(id)!),
    updates: [...updatedIds].map((id) => working.get(id)!),
    results,
  };
}
