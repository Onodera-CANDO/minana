import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePeople, useStore } from '../app/store';
import { newId } from '../app/id';
import type { RelationType } from '../types';
import { Field, Page, PageHeader, errorMessage } from '../components/ui';
import { PersonPicker } from '../components/PersonPicker';
import { RELATION_LABEL } from '../features/relations/relations';

// SCR-11 人脈関係（利用者が手動で登録したものだけ。自動生成はしない）
export function RelationFormPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const person = useStore((s) => s.people[id]);
  const saveRelation = useStore((s) => s.saveRelation);
  const people = usePeople();
  const [type, setType] = useState<RelationType>('introduced_by');
  const [mode, setMode] = useState<'existing' | 'external'>('existing');
  const [target, setTarget] = useState<string[]>([]);
  const [externalName, setExternalName] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (!person) return <PageHeader title="人物が見つかりません" back="/people" />;

  const submit = async () => {
    setErr(null);
    if (mode === 'existing' && !target[0]) return setErr('相手の人物を選んでください');
    if (mode === 'external' && !externalName.trim()) return setErr('名前を入力してください');
    try {
      await saveRelation({
        id: newId(),
        fromPersonId: id,
        toPersonId: mode === 'existing' ? target[0] : undefined,
        externalPersonName: mode === 'external' ? externalName.trim() : undefined,
        type,
        note: note.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
      nav(`/people/${id}`, { replace: true });
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="関係を追加" back />
      <Page>
        <p className="muted text-sm">{person.fullName} さんとの関係</p>
        <form
          className="card space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="関係の種類">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as RelationType)}>
              {(Object.keys(RELATION_LABEL) as RelationType[]).map((t) => (
                <option key={t} value={t}>
                  {t === 'introduced_by' ? `紹介者（相手が ${person.fullName} さんを紹介した）` : RELATION_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-2 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} /> 登録済みの人物
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === 'external'} onChange={() => setMode('external')} /> 未登録（名前だけメモ）
            </label>
          </div>
          {mode === 'existing' ? (
            <PersonPicker people={people} selected={target} onChange={setTarget} multiple={false} exclude={[id]} />
          ) : (
            <Field label="名前">
              <input className="input" value={externalName} onChange={(e) => setExternalName(e.target.value)} />
            </Field>
          )}
          <Field label="メモ">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {err && <p className="notice-error">{err}</p>}
          <button className="btn-primary w-full">保存</button>
        </form>
      </Page>
    </>
  );
}
