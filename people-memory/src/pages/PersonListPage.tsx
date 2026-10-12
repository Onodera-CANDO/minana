import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFaceRegisteredSet, useMeetings, usePeople } from '../app/store';
import { EmptyState, Page, PageHeader } from '../components/ui';
import { PersonCard } from '../components/PersonCard';
import { allTags, searchPeople, sortPeopleByKana, type PersonFilter } from '../features/people/search';
import { lastMeeting, meetingCount } from '../features/meetings/meetingStats';

const PAGE = 50;

// SCR-05 人物一覧
export function PersonListPage() {
  const people = usePeople();
  const meetings = useMeetings();
  const faceSet = useFaceRegisteredSet();
  const [params, setParams] = useSearchParams();
  const [limit, setLimit] = useState(PAGE);

  const filter: PersonFilter = {
    keyword: params.get('q') ?? '',
    tag: params.get('tag') ?? '',
    company: params.get('company') ?? '',
    face: (params.get('face') as PersonFilter['face']) || 'all',
  };
  const setF = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== 'all') next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  const tags = useMemo(() => allTags(people), [people]);
  const results = useMemo(
    () => sortPeopleByKana(searchPeople(people, filter, (id) => faceSet.has(id))),
    [people, faceSet, filter.keyword, filter.tag, filter.company, filter.face],
  );

  return (
    <>
      <PageHeader
        title="人物"
        action={
          <Link to="/people/new" className="btn-primary min-h-9 px-3">
            ＋ 追加
          </Link>
        }
      />
      <Page>
        <div className="space-y-2">
          <input
            className="input"
            type="search"
            placeholder="名前・ふりがな・会社・メモで検索"
            aria-label="キーワード検索"
            value={filter.keyword}
            onChange={(e) => setF('q', e.target.value)}
          />
          <div className="grid grid-cols-3 gap-2">
            <input className="input" placeholder="会社" aria-label="会社で絞り込み" value={filter.company} onChange={(e) => setF('company', e.target.value)} />
            <select className="input" aria-label="タグで絞り込み" value={filter.tag} onChange={(e) => setF('tag', e.target.value)}>
              <option value="">タグ：全て</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select className="input" aria-label="顔登録状況で絞り込み" value={filter.face} onChange={(e) => setF('face', e.target.value)}>
              <option value="all">顔：全て</option>
              <option value="registered">顔登録済</option>
              <option value="unregistered">顔未登録</option>
            </select>
          </div>
          <p className="muted text-xs">
            {results.length}件 / 全{people.length}件
          </p>
        </div>
        {people.length === 0 ? (
          <EmptyState title="まだ人物が登録されていません">
            <div className="flex justify-center gap-2">
              <Link to="/people/new" className="btn-primary">
                ＋ 手動で追加
              </Link>
              <Link to="/import" className="btn-secondary">
                CSVを取り込む
              </Link>
            </div>
          </EmptyState>
        ) : results.length === 0 ? (
          <EmptyState title="該当する人物がいません">
            <Link to={`/people/new?name=${encodeURIComponent(filter.keyword ?? '')}`} className="btn-secondary">
              ＋ この名前で新規登録
            </Link>
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {results.slice(0, limit).map((p) => (
              <li key={p.id}>
                <PersonCard
                  person={p}
                  meetingCount={meetingCount(meetings, p.id)}
                  last={lastMeeting(meetings, p.id)}
                  faceRegistered={faceSet.has(p.id)}
                  to={`/people/${p.id}`}
                />
              </li>
            ))}
            {results.length > limit && (
              <li>
                <button className="btn-secondary w-full" onClick={() => setLimit((l) => l + PAGE)}>
                  さらに表示（残り{results.length - limit}件）
                </button>
              </li>
            )}
          </ul>
        )}
      </Page>
    </>
  );
}
