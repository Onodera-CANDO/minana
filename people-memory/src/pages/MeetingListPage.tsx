import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMeetings, useStore } from '../app/store';
import { EmptyState, Page, PageHeader, formatDate } from '../components/ui';
import { normalizeText } from '../features/people/normalize';

// 履歴タブ：全面会記録
export function MeetingListPage() {
  const meetings = useMeetings();
  const peopleById = useStore((s) => s.people);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const kw = normalizeText(q);
    return [...meetings]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .filter((m) => {
        if (!kw) return true;
        const hay = normalizeText(
          [m.eventName, m.location, m.summary, m.nextTopic, ...m.personIds.map((p) => peopleById[p]?.fullName)].filter(Boolean).join(' '),
        );
        return hay.includes(kw);
      });
  }, [meetings, peopleById, q]);

  return (
    <>
      <PageHeader
        title="面会履歴"
        action={
          <Link to="/meetings/new" className="btn-primary min-h-9 px-3">
            ＋ 記録
          </Link>
        }
      />
      <Page>
        <input className="input" type="search" placeholder="人物・イベント・内容で検索" value={q} onChange={(e) => setQ(e.target.value)} aria-label="面会履歴を検索" />
        {list.length === 0 ? (
          <EmptyState title={meetings.length ? '該当する記録がありません' : 'まだ面会記録がありません'} />
        ) : (
          <ul className="space-y-2">
            {list.map((m) => (
              <li key={m.id}>
                <Link to={`/meetings/${m.id}/edit`} className="card block p-3 text-sm">
                  <p className="muted text-xs">
                    {formatDate(m.occurredAt, true)} {m.eventName && `・${m.eventName}`} {m.location && `＠${m.location}`}
                  </p>
                  <p className="font-semibold">{m.personIds.map((p) => peopleById[p]?.fullName ?? '（削除済み）').join('、')}</p>
                  {m.summary && <p className="mt-1 line-clamp-2">{m.summary}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Page>
    </>
  );
}
