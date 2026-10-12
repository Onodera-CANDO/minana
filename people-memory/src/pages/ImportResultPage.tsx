import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../app/store';
import type { ImportBatch, ImportRowResult, SourceSystem } from '../types';
import { EmptyState, Page, PageHeader, errorMessage, formatDate } from '../components/ui';
import { downloadText, toCsv } from '../features/csv-import/exportCsv';
import { mergeIntoPerson, personFromMapped } from '../features/csv-import/apply';

const STATUS_LABEL: Record<ImportRowResult['status'], string> = {
  created: '新規', updated: '更新', merged: '統合', review: '保留', skipped: 'スキップ', failed: '失敗',
};

// SCR-04 取込結果
export function ImportResultPage() {
  const { batchId = '' } = useParams();
  const batch = useStore((s) => s.importBatches[batchId]);
  const peopleById = useStore((s) => s.people);
  const savePerson = useStore((s) => s.savePerson);
  const saveImportBatch = useStore((s) => s.saveImportBatch);
  const [err, setErr] = useState<string | null>(null);

  if (!batch) {
    return (
      <>
        <PageHeader title="取込結果" back="/settings" />
        <Page>
          <EmptyState title="取込履歴が見つかりません" />
        </Page>
      </>
    );
  }

  const rows = batch.rows ?? [];
  const problem = rows.filter((r) => r.status === 'failed' || r.status === 'review' || r.status === 'skipped');
  const pending = rows.filter((r) => r.status === 'review');

  const downloadProblems = () => {
    const header = ['行番号', '状態', '理由', ...(batch.headers ?? [])];
    const body = problem.map((r) => [String(r.rowNumber), STATUS_LABEL[r.status], r.message ?? '', ...(r.raw ?? [])]);
    downloadText(`import-problems-${batch.importedAt.slice(0, 10)}.csv`, toCsv([header, ...body]));
  };

  const resolve = async (row: ImportRowResult, action: 'merge' | 'create' | 'skip', targetId?: string) => {
    setErr(null);
    try {
      const now = new Date().toISOString();
      const o = { source: batch.sourceSystem as SourceSystem, batchId: batch.id, now, overwriteManual: false };
      let next: ImportRowResult;
      if (action === 'merge') {
        const target = targetId ? peopleById[targetId] : undefined;
        if (!target || !row.mapped) throw new Error('統合先の人物が見つかりません');
        const { person } = mergeIntoPerson(target, row.mapped, o);
        await savePerson(person);
        next = { rowNumber: row.rowNumber, status: 'merged', personId: person.id, message: '取込後に利用者の承認で統合' };
      } else if (action === 'create') {
        if (!row.mapped) throw new Error('行データがありません');
        const p = personFromMapped(row.mapped, o);
        await savePerson(p);
        next = { rowNumber: row.rowNumber, status: 'created', personId: p.id, message: '取込後に別人として登録' };
      } else {
        next = { rowNumber: row.rowNumber, status: 'skipped', message: '取込後にスキップ', raw: row.raw };
      }
      const newRows = rows.map((r) => (r.rowNumber === row.rowNumber ? next : r));
      const count = (s: string) => newRows.filter((r) => r.status === s).length;
      const updated: ImportBatch = {
        ...batch,
        rows: newRows,
        createdCount: count('created'),
        updatedCount: count('updated'),
        mergedCount: count('merged'),
        reviewCount: count('review'),
        skippedCount: count('skipped'),
        failedCount: count('failed'),
      };
      await saveImportBatch(updated);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="取込結果" back="/" />
      <Page>
        <div className="card text-sm">
          <p className="font-semibold">{batch.fileName}</p>
          <p className="muted text-xs">
            {formatDate(batch.importedAt, true)}・{batch.sourceSystem === 'sansan' ? 'Sansan' : 'CSV'}・{batch.encoding}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          {(
            [
              ['新規', batch.createdCount],
              ['更新', batch.updatedCount + (batch.mergedCount ?? 0)],
              ['保留', batch.reviewCount],
              ['スキップ', batch.skippedCount],
              ['失敗', batch.failedCount],
              ['合計', rows.length],
            ] as const
          ).map(([l, v]) => (
            <div key={l} className="card p-2">
              <div className="text-xl font-bold">{v}</div>
              <div className="muted text-xs">{l}</div>
            </div>
          ))}
        </div>
        {err && <p className="notice-error">{err}</p>}
        {problem.length > 0 && (
          <button className="btn-secondary w-full" onClick={downloadProblems}>
            問題行をCSVでダウンロード（{problem.length}件）
          </button>
        )}

        {pending.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-bold">確認待ちの候補（{pending.length}件）</h2>
            {pending.map((r) => (
              <PendingRow key={r.rowNumber} row={r} onResolve={resolve} />
            ))}
          </section>
        )}

        {rows.some((r) => r.status === 'failed') && (
          <section className="space-y-1">
            <h2 className="font-bold">失敗した行</h2>
            {rows
              .filter((r) => r.status === 'failed')
              .slice(0, 50)
              .map((r) => (
                <p key={r.rowNumber} className="text-xs">
                  {r.rowNumber}行目：{r.message}
                </p>
              ))}
          </section>
        )}

        <Link to="/people" className="btn-primary w-full">
          人物一覧を見る
        </Link>
      </Page>
    </>
  );
}

function PendingRow({ row, onResolve }: { row: ImportRowResult; onResolve: (r: ImportRowResult, a: 'merge' | 'create' | 'skip', t?: string) => Promise<void> }) {
  const peopleById = useStore((s) => s.people);
  const cands = (row.candidatePersonIds ?? []).filter((c) => peopleById[c]);
  const [target, setTarget] = useState(cands[0] ?? '');
  const [busy, setBusy] = useState(false);
  const act = async (a: 'merge' | 'create' | 'skip') => {
    setBusy(true);
    await onResolve(row, a, target);
    setBusy(false);
  };
  return (
    <div className="card space-y-2 p-3 text-sm">
      <p>
        <span className="muted text-xs">{row.rowNumber}行目：</span>
        <span className="font-semibold">{row.mapped?.fullName}</span> {row.mapped?.companyName ?? ''} {row.mapped?.email ? `<${row.mapped.email}>` : ''}
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-300">{row.message}</p>
      {cands.length > 0 && (
        <select className="input py-1" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="統合先">
          {cands.map((c) => (
            <option key={c} value={c}>
              {peopleById[c].fullName}（{peopleById[c].companyName ?? '会社未登録'}{peopleById[c].email ? `・${peopleById[c].email}` : ''}）
            </option>
          ))}
        </select>
      )}
      <div className="flex flex-wrap gap-2">
        {cands.length > 0 && (
          <button className="btn-secondary min-h-9 px-3" disabled={busy} onClick={() => void act('merge')}>
            既存に統合
          </button>
        )}
        <button className="btn-secondary min-h-9 px-3" disabled={busy} onClick={() => void act('create')}>
          別人として登録
        </button>
        <button className="btn-ghost min-h-9 px-3" disabled={busy} onClick={() => void act('skip')}>
          取り込まない
        </button>
      </div>
    </div>
  );
}
