import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePeople, useStore } from '../app/store';
import { newId } from '../app/id';
import type { ImportBatch, Person, SourceSystem } from '../types';
import { Page, PageHeader, errorMessage } from '../components/ui';
import { decodeCsv, looksGarbled, parseCsv, type CsvEncoding, type ParsedCsv } from '../features/csv-import/decode';
import { MAPPING_TARGETS, applyMapping, suggestMapping, validateMapping, type ColumnMapping, type MappingTarget } from '../features/csv-import/mapping';
import { MATCH_REASON_LABEL, planImport, summarizePlan, type PlannedRow } from '../features/csv-import/plan';
import { applyPlan, type ReviewDecision, type RowDecision } from '../features/csv-import/apply';
import { updateStats } from '../storage/settings';

const FIELD_LABEL: Record<string, string> = {
  fullName: '氏名', nameKana: 'ふりがな', companyName: '会社名', department: '部署', jobTitle: '役職',
  email: 'メール', phone: '電話', companyAddress: '住所', csvNotes: 'CSV備考',
};

type Step = 'select' | 'mapping' | 'preview' | 'running';
const LIST_LIMIT = 100;

// SCR-03 CSV取込
export function ImportPage() {
  const nav = useNavigate();
  const people = usePeople();
  const peopleById = useStore((s) => s.people);
  const maxBytes = useStore((s) => s.settings.csvMaxBytes);
  const savePeople = useStore((s) => s.savePeople);
  const saveImportBatch = useStore((s) => s.saveImportBatch);

  const [step, setStep] = useState<Step>('select');
  const [err, setErr] = useState<string | null>(null);
  const [source, setSource] = useState<SourceSystem>('sansan');
  const [file, setFile] = useState<{ name: string; buf: ArrayBuffer } | null>(null);
  const [encoding, setEncoding] = useState<CsvEncoding>('utf-8');
  const [garbled, setGarbled] = useState(false);
  const [utf8Invalid, setUtf8Invalid] = useState(false);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [keepExtra, setKeepExtra] = useState(false);
  const [plan, setPlan] = useState<PlannedRow[]>([]);
  const [decisions, setDecisions] = useState<Map<number, RowDecision>>(new Map());
  const [overwriteManual, setOverwriteManual] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [confirmedPolicy, setConfirmedPolicy] = useState(false);

  const load = (buf: ArrayBuffer, forced?: CsvEncoding) => {
    const dec = decodeCsv(buf, forced);
    const p = parseCsv(dec.text);
    setEncoding(dec.encoding);
    setUtf8Invalid(dec.utf8Invalid);
    setGarbled(looksGarbled(dec.text));
    if (p.headers.length === 0) throw new Error('CSVにヘッダー行がありません');
    setParsed(p);
    setMapping(suggestMapping(p.headers));
  };

  const onFile = async (f: File | undefined) => {
    setErr(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type && !/csv|text|excel/.test(f.type)) return setErr('CSVファイル（.csv）を選んでください');
    if (f.size > maxBytes) return setErr(`ファイルが大きすぎます（${(f.size / 1048576).toFixed(1)}MB）。上限は${(maxBytes / 1048576).toFixed(0)}MBです。ファイルを分割してください。`);
    try {
      const buf = await f.arrayBuffer();
      setFile({ name: f.name, buf });
      load(buf);
      setStep('mapping');
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  const mappingError = useMemo(() => (mapping.length ? validateMapping(mapping) : null), [mapping]);

  const buildPlan = () => {
    if (!parsed) return;
    const rows = parsed.rows.map((raw) => ({ raw, mapped: applyMapping(raw, parsed.headers, mapping, keepExtra) }));
    const pl = planImport(rows, people, source);
    setPlan(pl);
    const d = new Map<number, RowDecision>();
    for (const r of pl) d.set(r.index, { include: true, review: 'hold', mergeTargetId: r.candidatePersonIds?.[0] });
    setDecisions(d);
    setStep('preview');
  };

  const setDecision = (i: number, patch: Partial<RowDecision>) =>
    setDecisions((m) => {
      const n = new Map(m);
      n.set(i, { ...(n.get(i) ?? { include: true, review: 'hold' }), ...patch });
      return n;
    });

  const summary = useMemo(() => summarizePlan(plan), [plan]);

  const run = async () => {
    if (!file || !parsed) return;
    setStep('running');
    setErr(null);
    const t0 = performance.now();
    try {
      const now = new Date().toISOString();
      const batchId = newId();
      const res = applyPlan(plan, decisions, new Map(Object.entries(peopleById)), { source, batchId, now, overwriteManual });
      const all: Person[] = [...res.creates, ...res.updates];
      setProgress({ done: 0, total: all.length });
      await savePeople(all, (done) => setProgress({ done, total: all.length }));
      const count = (s: string) => res.results.filter((r) => r.status === s).length;
      const batch: ImportBatch = {
        id: batchId,
        fileName: file.name,
        sourceSystem: source,
        importedAt: now,
        createdCount: count('created'),
        updatedCount: count('updated'),
        mergedCount: count('merged'),
        reviewCount: count('review'),
        skippedCount: count('skipped'),
        failedCount: count('failed'),
        encoding,
        headers: parsed.headers,
        rows: res.results,
      };
      await saveImportBatch(batch);
      await updateStats((s) => ({ ...s, lastCsv: { rows: plan.length, ms: Math.round(performance.now() - t0), review: batch.reviewCount, failed: batch.failedCount } }));
      nav(`/import/${batchId}`, { replace: true });
    } catch (e) {
      setErr(`取込中にエラーが発生しました：${errorMessage(e)}（途中まで保存された人物は一覧に表示されます）`);
      setStep('preview');
    }
  };

  return (
    <>
      <PageHeader title="CSVを取り込む" back />
      <Page>
        {err && <p className="notice-error">{err}</p>}

        {step === 'select' && (
          <>
            <div className="notice space-y-1">
              <p className="font-semibold">取り込む前に確認してください</p>
              <p>SansanのCSV出力はPC版で行い、スマホへ転送してください（スマホアプリからは出力できません）。</p>
              <p>利用契約・出力権限・社内規程で、データの持ち出しと私的利用が認められているか確認してください。<strong>出力できることと私的利用が許されることは別</strong>です。</p>
              <label className="flex items-start gap-2 pt-1">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={confirmedPolicy} onChange={(e) => setConfirmedPolicy(e.target.checked)} />
                <span>確認しました</span>
              </label>
            </div>
            <div className="card space-y-3">
              <label className="block">
                <span className="label">データの出典</span>
                <select className="input" value={source} onChange={(e) => setSource(e.target.value as SourceSystem)}>
                  <option value="sansan">Sansan</option>
                  <option value="generic_csv">その他のCSV</option>
                </select>
              </label>
              <label className="block">
                <span className="label">CSVファイル</span>
                <input
                  className="input"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={!confirmedPolicy}
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
              </label>
              <p className="muted text-xs">ファイルは端末内で処理され、サーバーには送信されません。上限 {(maxBytes / 1048576).toFixed(0)}MB。</p>
            </div>
          </>
        )}

        {step === 'mapping' && parsed && file && (
          <>
            <div className="card space-y-2 text-sm">
              <p>
                <span className="font-semibold">{file.name}</span>（{parsed.rows.length}行・{parsed.headers.length}列）
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span>文字コード：</span>
                <select
                  className="input w-auto py-1"
                  value={encoding}
                  onChange={(e) => {
                    try {
                      load(file.buf, e.target.value as CsvEncoding);
                    } catch (e2) {
                      setErr(errorMessage(e2));
                    }
                  }}
                >
                  <option value="utf-8">UTF-8</option>
                  <option value="shift_jis">Shift_JIS（CP932）</option>
                </select>
              </div>
              {utf8Invalid && encoding === 'shift_jis' && <p className="notice-info">UTF-8として読めなかったため Shift_JIS で読み込みました。</p>}
              {garbled && <p className="notice">文字化けしている可能性があります。文字コードを切り替えて確認してください。</p>}
              {parsed.errors.length > 0 && (
                <p className="notice">CSVの構文に問題がある行があります（{parsed.errors.slice(0, 3).map((e) => `${e.row}行目`).join('、')}…）。</p>
              )}
            </div>

            <div className="card space-y-3">
              <h2 className="font-bold">列の割当</h2>
              <p className="muted text-xs">自動で推定しています。違っていれば変更してください。「氏名」または「姓／名」は必須です。</p>
              {parsed.headers.map((h, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr] items-center gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{h}</p>
                    <p className="muted truncate text-xs">例：{parsed.rows.find((r) => r[i])?.[i] ?? '（空）'}</p>
                  </div>
                  <select
                    className="input py-1.5"
                    aria-label={`${h} の割当`}
                    value={mapping[i] ?? ''}
                    onChange={(e) => setMapping((m) => m.map((x, j) => (j === i ? ((e.target.value || null) as MappingTarget | null) : x)))}
                  >
                    <option value="">取り込まない</option>
                    {MAPPING_TARGETS.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="border-t border-slate-200 pt-2 text-xs dark:border-slate-800">
                <p className="muted">
                  取り込まない列：{parsed.headers.filter((_, i) => !mapping[i]).join('、') || 'なし'}
                </p>
                <label className="mt-1 flex items-start gap-2">
                  <input type="checkbox" checked={keepExtra} onChange={(e) => setKeepExtra(e.target.checked)} />
                  <span>取り込まない列も出典情報として保存する（通常は不要）</span>
                </label>
              </div>
              {mappingError && <p className="notice-error">{mappingError}</p>}
            </div>

            <div className="card overflow-x-auto">
              <h2 className="mb-2 font-bold">プレビュー（先頭5行）</h2>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    {MAPPING_TARGETS.filter((t) => mapping.includes(t.key)).map((t) => (
                      <th key={t.key} className="whitespace-nowrap px-1 py-1">{t.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 5).map((r, ri) => (
                    <tr key={ri} className="border-t border-slate-200 dark:border-slate-800">
                      {MAPPING_TARGETS.filter((t) => mapping.includes(t.key)).map((t) => (
                        <td key={t.key} className="max-w-40 truncate whitespace-nowrap px-1 py-1">{r[mapping.indexOf(t.key)] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setStep('select')}>
                戻る
              </button>
              <button className="btn-primary flex-1" disabled={!!mappingError} onClick={buildPlan}>
                取込内容を確認
              </button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              <div className="card p-2"><div className="text-xl font-bold">{summary.create}</div><div className="muted text-xs">新規</div></div>
              <div className="card p-2"><div className="text-xl font-bold">{summary.update}</div><div className="muted text-xs">更新候補</div></div>
              <div className="card p-2"><div className="text-xl font-bold text-amber-600">{summary.review}</div><div className="muted text-xs">重複要確認</div></div>
              <div className="card p-2"><div className="text-xl font-bold text-rose-600">{summary.invalid}</div><div className="muted text-xs">無効行</div></div>
            </div>
            <p className="notice-info text-xs">
              顔特徴量・面会履歴・共通の知人・手動メモ・タグ・同意記録はCSVで上書きされません。名刺交換日があっても面会回数は増えません。CSVの空欄は既存の値を消しません。
            </p>

            {summary.review > 0 && (
              <section className="space-y-2">
                <h2 className="font-bold">重複要確認（{summary.review}件）</h2>
                <p className="muted text-xs">名前やメールが一致しても別人の可能性があるため、自動では統合しません。「保留」は後から取込結果画面で判断できます。</p>
                {plan.filter((r) => r.kind === 'review').slice(0, LIST_LIMIT).map((r) => {
                  const d = decisions.get(r.index)!;
                  const cand = r.candidatePersonIds ?? [];
                  return (
                    <div key={r.index} className="card space-y-2 p-3 text-sm">
                      <p>
                        <span className="muted text-xs">{r.rowNumber}行目：</span>
                        <span className="font-semibold">{r.mapped.fullName}</span> {r.mapped.companyName ?? ''} {r.mapped.email ? `<${r.mapped.email}>` : ''}
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300">{r.reason ? MATCH_REASON_LABEL[r.reason] : ''}{r.message ? `／${r.message}` : ''}</p>
                      {cand.length > 0 && (
                        <p className="text-xs">
                          既存：{cand.map((c) => `${peopleById[c]?.fullName ?? ''}（${peopleById[c]?.companyName ?? '会社未登録'}）`).join('、')}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <select className="input w-auto py-1" aria-label={`${r.rowNumber}行目の扱い`} value={d.review} onChange={(e) => setDecision(r.index, { review: e.target.value as ReviewDecision })}>
                          <option value="hold">保留（後で判断）</option>
                          {(cand.length > 0 || r.targetRowIndex !== undefined) && <option value="merge">既存に統合</option>}
                          <option value="create">別人として新規登録</option>
                          <option value="skip">取り込まない</option>
                        </select>
                        {d.review === 'merge' && cand.length > 1 && (
                          <select className="input w-auto py-1" value={d.mergeTargetId} onChange={(e) => setDecision(r.index, { mergeTargetId: e.target.value })}>
                            {cand.map((c) => (
                              <option key={c} value={c}>{peopleById[c]?.fullName}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      {d.review === 'merge' && r.changes && r.changes.length > 0 && <ChangeList changes={r.changes} overwriteManual={overwriteManual} />}
                    </div>
                  );
                })}
              </section>
            )}

            {summary.update > 0 && (
              <section className="space-y-2">
                <h2 className="font-bold">既存人物の更新（{summary.update}件）</h2>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={overwriteManual} onChange={(e) => setOverwriteManual(e.target.checked)} />
                  <span>手動で編集した項目もCSVの値で上書きする（通常はオフ）</span>
                </label>
                {plan.filter((r) => r.kind === 'update').slice(0, LIST_LIMIT).map((r) => {
                  const d = decisions.get(r.index)!;
                  const target = r.targetPersonId ? peopleById[r.targetPersonId] : undefined;
                  return (
                    <div key={r.index} className="card space-y-1 p-3 text-sm">
                      <label className="flex items-start gap-2">
                        <input type="checkbox" className="mt-1" checked={d.include} onChange={(e) => setDecision(r.index, { include: e.target.checked })} />
                        <span>
                          <span className="muted text-xs">{r.rowNumber}行目：</span>
                          <span className="font-semibold">{target?.fullName ?? r.mapped.fullName}</span>
                          <span className="muted block text-xs">{r.reason ? MATCH_REASON_LABEL[r.reason] : ''}{r.message ? `／${r.message}` : ''}</span>
                        </span>
                      </label>
                      {r.changes && r.changes.length > 0 ? <ChangeList changes={r.changes} overwriteManual={overwriteManual} /> : target && <p className="muted text-xs">項目の変更なし（出典情報のみ更新）</p>}
                    </div>
                  );
                })}
              </section>
            )}

            {summary.invalid > 0 && (
              <section className="space-y-1">
                <h2 className="font-bold">無効行（{summary.invalid}件・取り込みません）</h2>
                {plan.filter((r) => r.kind === 'invalid').slice(0, 20).map((r) => (
                  <p key={r.index} className="text-xs">
                    {r.rowNumber}行目：{r.message}
                  </p>
                ))}
              </section>
            )}

            {summary.create > 0 && (
              <details className="card text-sm">
                <summary className="cursor-pointer font-bold">新規登録（{summary.create}件）</summary>
                <ul className="mt-2 space-y-1">
                  {plan.filter((r) => r.kind === 'create').slice(0, LIST_LIMIT).map((r) => (
                    <li key={r.index} className="flex items-center gap-2">
                      <input type="checkbox" aria-label={`${r.mapped.fullName}を取り込む`} checked={decisions.get(r.index)?.include ?? true} onChange={(e) => setDecision(r.index, { include: e.target.checked })} />
                      <span>{r.mapped.fullName}</span>
                      <span className="muted text-xs">{r.mapped.companyName}</span>
                    </li>
                  ))}
                  {summary.create > LIST_LIMIT && <li className="muted text-xs">ほか {summary.create - LIST_LIMIT}件</li>}
                </ul>
              </details>
            )}

            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setStep('mapping')}>
                戻る
              </button>
              <button className="btn-primary flex-1" onClick={() => void run()} disabled={plan.length === 0}>
                取り込みを開始
              </button>
            </div>
          </>
        )}

        {step === 'running' && (
          <div className="card space-y-2 text-center">
            <p className="font-semibold">取り込み中… 画面を閉じないでください</p>
            <progress className="w-full" max={progress.total || 1} value={progress.done} />
            <p className="muted text-sm">
              {progress.done} / {progress.total} 件を暗号化して保存
            </p>
          </div>
        )}

        <p className="muted text-center text-xs">
          <Link to="/settings" className="underline">取込履歴は設定画面</Link>から確認できます
        </p>
      </Page>
    </>
  );
}

function ChangeList({ changes, overwriteManual }: { changes: NonNullable<PlannedRow['changes']>; overwriteManual: boolean }) {
  return (
    <ul className="space-y-0.5 rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800/50">
      {changes.map((c) => {
        const kept = c.manualConflict && !overwriteManual;
        return (
          <li key={c.field} className={kept ? 'muted line-through' : ''}>
            {FIELD_LABEL[c.field] ?? c.field}：{c.before ?? '（空）'} → <span className="font-semibold">{c.after}</span>
            {c.manualConflict && <span className="ml-1 text-amber-700 dark:text-amber-300">（手動編集あり{kept ? '・保持' : '・上書き'}）</span>}
          </li>
        );
      })}
    </ul>
  );
}
