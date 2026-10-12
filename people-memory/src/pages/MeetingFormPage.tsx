import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMeetings, usePeople, useStore } from '../app/store';
import { newId } from '../app/id';
import type { Meeting } from '../types';
import { ConfirmDialog, Field, Page, PageHeader, errorMessage, formatDate, fromLocalInput, toLocalInput } from '../components/ui';
import { PersonPicker } from '../components/PersonPicker';
import { findDuplicateMeetings } from '../features/meetings/meetingStats';

function initialDate(param: string | null): string {
  if (param) {
    const d = new Date(param.replace(/\//g, '-'));
    if (!Number.isNaN(d.getTime())) {
      d.setHours(12, 0, 0, 0);
      return d.toISOString();
    }
  }
  return new Date().toISOString();
}

// SCR-10 面会記録
export function MeetingFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const existing = useStore((s) => (id ? s.meetings[id] : undefined));
  const saveMeeting = useStore((s) => s.saveMeeting);
  const deleteMeeting = useStore((s) => s.deleteMeeting);
  const people = usePeople();
  const meetings = useMeetings();
  const preset = params.get('person');

  const [personIds, setPersonIds] = useState<string[]>(existing?.personIds ?? (preset ? [preset] : []));
  const [occurredAt, setOccurredAt] = useState(toLocalInput(existing?.occurredAt ?? initialDate(params.get('date'))));
  const [location, setLocation] = useState(existing?.location ?? '');
  const [eventName, setEventName] = useState(existing?.eventName ?? '');
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [nextTopic, setNextTopic] = useState(existing?.nextTopic ?? '');
  const [followUpDate, setFollowUpDate] = useState(existing?.followUpDate ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [dups, setDups] = useState<Meeting[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const peopleById = useStore((s) => s.people);

  if (id && !existing) return <PageHeader title="面会記録が見つかりません" back="/meetings" />;

  const build = (): Meeting => {
    const now = new Date().toISOString();
    return {
      id: existing?.id ?? newId(),
      personIds,
      occurredAt: fromLocalInput(occurredAt),
      location: location.trim() || undefined,
      eventName: eventName.trim() || undefined,
      summary: summary.trim() || undefined,
      nextTopic: nextTopic.trim() || undefined,
      followUpDate: followUpDate || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  };

  const doSave = async (m: Meeting) => {
    try {
      await saveMeeting(m);
      nav(personIds.length === 1 ? `/people/${personIds[0]}` : '/meetings', { replace: true });
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  const submit = () => {
    setErr(null);
    if (personIds.length === 0) return setErr('参加者を1人以上選んでください');
    if (!occurredAt) return setErr('日時を入力してください');
    const m = build();
    const d = findDuplicateMeetings(m, meetings);
    if (d.length) return setDups(d);
    void doSave(m);
  };

  return (
    <>
      <PageHeader title={existing ? '面会記録を編集' : '面会を記録'} back />
      <Page>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="card space-y-3">
            <Field label="参加者" required>
              <PersonPicker people={people} selected={personIds} onChange={setPersonIds} />
            </Field>
            <Field label="日時" required>
              <input className="input" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="場所">
                <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
              </Field>
              <Field label="イベント名">
                <input className="input" value={eventName} onChange={(e) => setEventName(e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="card space-y-3">
            <Field label="内容・話題">
              <textarea className="input min-h-20" value={summary} onChange={(e) => setSummary(e.target.value)} />
            </Field>
            <Field label="次回話すこと・約束">
              <textarea className="input min-h-16" value={nextTopic} onChange={(e) => setNextTopic(e.target.value)} />
            </Field>
            <Field label="フォロー予定日">
              <input className="input" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            </Field>
          </div>
          {err && <p className="notice-error">{err}</p>}
          <button className="btn-primary w-full">保存</button>
          {existing && (
            <button type="button" className="btn-secondary w-full text-rose-600" onClick={() => setConfirmDelete(true)}>
              この面会記録を削除
            </button>
          )}
        </form>
      </Page>
      <ConfirmDialog
        open={!!dups}
        title="同じ日の面会が登録済みです"
        confirmLabel="それでも保存"
        onCancel={() => setDups(null)}
        onConfirm={() => {
          setDups(null);
          void doSave(build());
        }}
      >
        <p>重複登録ではありませんか？</p>
        <ul className="list-disc pl-5">
          {dups?.map((m) => (
            <li key={m.id}>
              {formatDate(m.occurredAt, true)} {m.eventName ?? ''}：{m.personIds.map((p) => peopleById[p]?.fullName).filter(Boolean).join('、')}
            </li>
          ))}
        </ul>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDelete}
        title="面会記録を削除"
        danger
        confirmLabel="削除する"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteMeeting(existing!.id);
          nav(-1);
        }}
      >
        <p>この面会記録を削除します。面会回数も再集計されます。</p>
      </ConfirmDialog>
    </>
  );
}
