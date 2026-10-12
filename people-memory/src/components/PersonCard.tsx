import { Link } from 'react-router-dom';
import type { Meeting, Person } from '../types';
import { formatDate } from './ui';

export function PersonCard({
  person,
  meetingCount,
  last,
  faceRegistered,
  to,
  compact,
}: {
  person: Person;
  meetingCount: number;
  last?: Meeting;
  faceRegistered?: boolean;
  to?: string;
  compact?: boolean;
}) {
  const body = (
    <div className="flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-100 text-lg font-bold text-teal-800 dark:bg-teal-900 dark:text-teal-100" aria-hidden>
        {person.fullName.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold">{person.fullName}</p>
          {faceRegistered && <span className="chip" title="顔登録済み">顔</span>}
        </div>
        <p className="muted truncate text-sm">
          {[person.companyName, person.jobTitle].filter(Boolean).join(' / ') || '会社・役職 未登録'}
        </p>
        {!compact && (
          <p className="muted mt-1 text-xs">
            面会 {meetingCount}回{last ? ` ・ 前回 ${formatDate(last.occurredAt)}${last.location ? `（${last.location}）` : ''}` : ''}
          </p>
        )}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="card block p-3 active:bg-slate-50 dark:active:bg-slate-800">
      {body}
    </Link>
  ) : (
    <div className="card p-3">{body}</div>
  );
}
