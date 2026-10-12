import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePeople, useStore } from '../app/store';
import { newId } from '../app/id';
import { CSV_MANAGED_FIELDS, type CsvManagedField, type Person } from '../types';
import { ConfirmDialog, Field, Page, PageHeader, errorMessage } from '../components/ui';
import { DUPLICATE_REASON_LABEL, findDuplicateCandidates, type DuplicateCandidate } from '../features/people/duplicates';
import { parseTags } from '../features/people/search';

type Draft = {
  fullName: string;
  nameKana: string;
  companyName: string;
  department: string;
  jobTitle: string;
  email: string;
  phone: string;
  companyAddress: string;
  firstMetAt: string;
  firstMetContext: string;
  organization: string;
  tags: string;
  notes: string;
};

function toDraft(p?: Person, presetName = ''): Draft {
  return {
    fullName: p?.fullName ?? presetName,
    nameKana: p?.nameKana ?? '',
    companyName: p?.companyName ?? '',
    department: p?.department ?? '',
    jobTitle: p?.jobTitle ?? '',
    email: p?.email ?? '',
    phone: p?.phone ?? '',
    companyAddress: p?.companyAddress ?? '',
    firstMetAt: p?.firstMetAt?.slice(0, 10) ?? '',
    firstMetContext: p?.firstMetContext ?? '',
    organization: p?.organization ?? '',
    tags: p?.tags.join(', ') ?? '',
    notes: p?.notes ?? '',
  };
}

const opt = (s: string) => (s.trim() ? s.trim() : undefined);

// SCR-06 人物新規・編集
export function PersonFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const existing = useStore((s) => (id ? s.people[id] : undefined));
  const savePerson = useStore((s) => s.savePerson);
  const people = usePeople();
  const [d, setD] = useState<Draft>(() => toDraft(existing, params.get('name') ?? ''));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dups, setDups] = useState<DuplicateCandidate[] | null>(null);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setD((x) => ({ ...x, [k]: e.target.value }));

  const liveDups = useMemo(
    () => (d.fullName.trim() || d.email.trim() ? findDuplicateCandidates({ id, fullName: d.fullName, companyName: d.companyName, email: d.email }, people) : []),
    [d.fullName, d.companyName, d.email, people, id],
  );

  if (id && !existing) {
    return (
      <>
        <PageHeader title="人物が見つかりません" back="/people" />
      </>
    );
  }

  const build = (): Person => {
    const now = new Date().toISOString();
    const base: Person = {
      id: existing?.id ?? newId(),
      fullName: d.fullName.trim().replace(/\s+/g, ' '),
      nameKana: opt(d.nameKana),
      companyName: opt(d.companyName),
      department: opt(d.department),
      jobTitle: opt(d.jobTitle),
      email: opt(d.email),
      phone: opt(d.phone),
      companyAddress: opt(d.companyAddress),
      firstMetAt: opt(d.firstMetAt),
      firstMetContext: opt(d.firstMetContext),
      organization: opt(d.organization),
      tags: parseTags(d.tags),
      notes: opt(d.notes),
      csvNotes: existing?.csvNotes,
      sourceRefs: existing?.sourceRefs ?? [{ source: 'manual' }],
      manuallyEditedFields: existing?.manuallyEditedFields,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    // 手動で値を変更・入力した CSV 管理項目を記録（再取込時の衝突表示に使う）
    const edited = new Set<CsvManagedField>(existing?.manuallyEditedFields ?? []);
    for (const f of CSV_MANAGED_FIELDS) {
      if (f === 'csvNotes') continue;
      const before = existing?.[f] ?? undefined;
      if (base[f] !== before && base[f]) edited.add(f);
    }
    base.manuallyEditedFields = edited.size ? [...edited] : undefined;
    return base;
  };

  const doSave = async () => {
    setBusy(true);
    try {
      const p = build();
      await savePerson(p);
      nav(existing ? `/people/${p.id}` : `/people/${p.id}?created=1`, { replace: true });
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  const submit = () => {
    setErr(null);
    if (!d.fullName.trim()) return setErr('氏名を入力してください');
    if (d.email.trim() && !/^[^\s@]+@[^\s@]+$/.test(d.email.trim())) return setErr('メールアドレスの形式を確認してください');
    if (!existing && liveDups.length) return setDups(liveDups);
    void doSave();
  };

  return (
    <>
      <PageHeader title={existing ? '人物を編集' : '人物を追加'} back />
      <Page>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="card space-y-3">
            <Field label="氏名" required>
              <input className="input" value={d.fullName} onChange={set('fullName')} autoComplete="off" autoFocus={!existing} />
            </Field>
            <Field label="ふりがな">
              <input className="input" value={d.nameKana} onChange={set('nameKana')} autoComplete="off" />
            </Field>
            <Field label="会社名">
              <input className="input" value={d.companyName} onChange={set('companyName')} autoComplete="off" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="部署">
                <input className="input" value={d.department} onChange={set('department')} autoComplete="off" />
              </Field>
              <Field label="役職">
                <input className="input" value={d.jobTitle} onChange={set('jobTitle')} autoComplete="off" />
              </Field>
            </div>
          </div>
          {liveDups.length > 0 && (
            <div className="notice text-xs">
              似た人物が登録済みです：
              {liveDups.slice(0, 3).map((c) => (
                <span key={c.person.id} className="ml-1">
                  <Link className="underline" to={`/people/${c.person.id}`}>
                    {c.person.fullName}
                  </Link>
                  （{DUPLICATE_REASON_LABEL[c.reason]}）
                </span>
              ))}
            </div>
          )}
          <details className="card" open={!!existing}>
            <summary className="cursor-pointer font-semibold">連絡先・名刺交換日</summary>
            <div className="mt-3 space-y-3">
              <Field label="メールアドレス">
                <input className="input" type="email" inputMode="email" value={d.email} onChange={set('email')} autoComplete="off" />
              </Field>
              <Field label="電話番号">
                <input className="input" type="tel" inputMode="tel" value={d.phone} onChange={set('phone')} autoComplete="off" />
              </Field>
              <Field label="住所">
                <input className="input" value={d.companyAddress} onChange={set('companyAddress')} autoComplete="off" />
              </Field>
              <Field label="名刺交換日・初めて会った日" hint="面会回数には加算されません">
                <input className="input" type="date" value={d.firstMetAt} onChange={set('firstMetAt')} />
              </Field>
            </div>
          </details>
          <div className="card space-y-3">
            <Field label="知り合ったきっかけ">
              <input className="input" value={d.firstMetContext} onChange={set('firstMetContext')} placeholder="例：○○経営者交流会" />
            </Field>
            <Field label="所属団体">
              <input className="input" value={d.organization} onChange={set('organization')} />
            </Field>
            <Field label="タグ" hint="カンマまたはスペース区切り">
              <input className="input" value={d.tags} onChange={set('tags')} placeholder="例：見込み客, ゴルフ" />
            </Field>
            <Field label="メモ" hint="手動メモはCSV再取込で上書きされません">
              <textarea className="input min-h-24" value={d.notes} onChange={set('notes')} />
            </Field>
          </div>
          {err && <p className="notice-error">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
        </form>
      </Page>
      <ConfirmDialog
        open={!!dups}
        title="重複の可能性があります"
        confirmLabel="別人として保存"
        onCancel={() => setDups(null)}
        onConfirm={() => {
          setDups(null);
          void doSave();
        }}
      >
        <p>次の人物が登録済みです。同じ人なら既存の人物を編集してください。</p>
        <ul className="space-y-1">
          {dups?.map((c) => (
            <li key={c.person.id}>
              <Link className="font-semibold underline" to={`/people/${c.person.id}`}>
                {c.person.fullName}
              </Link>{' '}
              <span className="muted">
                {c.person.companyName ?? ''}（{DUPLICATE_REASON_LABEL[c.reason]}）
              </span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  );
}
