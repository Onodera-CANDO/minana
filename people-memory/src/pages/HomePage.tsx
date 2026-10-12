import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFaceRegisteredSet, useMeetings, usePeople, useStore } from '../app/store';
import { EmptyState, Page, PageHeader, Stat, formatDate } from '../components/ui';
import { PersonCard } from '../components/PersonCard';
import { meetingCount } from '../features/meetings/meetingStats';

// SCR-02 ホーム
export function HomePage() {
  const people = usePeople();
  const meetings = useMeetings();
  const faceSet = useFaceRegisteredSet();
  const peopleById = useStore((s) => s.people);
  const settings = useStore((s) => s.settings);
  const lock = useStore((s) => s.lock);

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: { personId: string; meetingId: string }[] = [];
    for (const m of [...meetings].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))) {
      for (const pid of m.personIds) {
        if (!seen.has(pid) && peopleById[pid]) {
          seen.add(pid);
          out.push({ personId: pid, meetingId: m.id });
        }
      }
      if (out.length >= 5) break;
    }
    return out.slice(0, 5);
  }, [meetings, peopleById]);

  const followUps = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return meetings
      .filter((m) => m.followUpDate && m.followUpDate >= today)
      .sort((a, b) => a.followUpDate!.localeCompare(b.followUpDate!))
      .slice(0, 3);
  }, [meetings]);

  const backupDue = useMemo(() => {
    if (!settings.firstDataAt) return false;
    const last = settings.lastBackupAt ? new Date(settings.lastBackupAt).getTime() : 0;
    return Date.now() - last > settings.backupReminderDays * 86_400_000 || last === 0;
  }, [settings]);

  const meetingsById = useStore((s) => s.meetings);

  return (
    <>
      <PageHeader
        title="People Memory"
        action={
          <button className="btn-ghost px-2 text-sm" onClick={lock} aria-label="今すぐロック">
            🔒 ロック
          </button>
        }
      />
      <Page>
        {backupDue && (
          <div className="notice flex items-center justify-between gap-2">
            <span>{settings.lastBackupAt ? `最後のバックアップから${settings.backupReminderDays}日以上経っています。` : 'まだバックアップがありません。'}</span>
            <Link to="/settings/backup" className="btn-secondary min-h-9 shrink-0 px-3">
              バックアップ
            </Link>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="登録人数" value={people.length} to="/people" />
          <Stat label="顔登録済" value={faceSet.size} to="/people?face=registered" />
          <Stat label="面会記録" value={meetings.length} to="/meetings" />
        </div>
        <Link to="/camera" className="btn-primary w-full py-4 text-base">
          ◉ カメラで照合する
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <Link to="/people/new" className="btn-secondary">
            ＋ 人物を追加
          </Link>
          <Link to="/import" className="btn-secondary">
            ⇪ CSVを取り込む
          </Link>
        </div>
        <Link to="/people" className="btn-ghost w-full">
          🔍 名前・会社で検索
        </Link>

        {followUps.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-bold">フォロー予定</h2>
            {followUps.map((m) => (
              <div key={m.id} className="card p-3 text-sm">
                <p className="font-semibold">
                  {formatDate(m.followUpDate)}：{m.personIds.map((p) => peopleById[p]?.fullName).filter(Boolean).join('、')}
                </p>
                {m.nextTopic && <p className="muted">次回: {m.nextTopic}</p>}
              </div>
            ))}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="font-bold">最近会った人</h2>
          {recent.length === 0 ? (
            <EmptyState title="まだ面会記録がありません">
              <p>人物詳細やカメラ照合の「今日会った」から記録できます。</p>
            </EmptyState>
          ) : (
            recent.map(({ personId, meetingId }) => (
              <PersonCard
                key={personId}
                person={peopleById[personId]}
                meetingCount={meetingCount(meetings, personId)}
                last={meetingsById[meetingId]}
                faceRegistered={faceSet.has(personId)}
                to={`/people/${personId}`}
              />
            ))
          )}
        </section>
      </Page>
    </>
  );
}
