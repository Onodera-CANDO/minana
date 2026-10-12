import type { Meeting } from '../../types';

// 面会回数は「明示登録された面会レコード」の集計値のみ（CSV件数・顔照合回数は含めない）

export function meetingsForPerson(meetings: Meeting[], personId: string): Meeting[] {
  return meetings
    .filter((m) => m.personIds.includes(personId))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function meetingCount(meetings: Meeting[], personId: string): number {
  return meetings.reduce((n, m) => (m.personIds.includes(personId) ? n + 1 : n), 0);
}

export function lastMeeting(meetings: Meeting[], personId: string): Meeting | undefined {
  return meetingsForPerson(meetings, personId)[0];
}

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 同日・同一イベント（イベント名未入力なら同日）での重複登録を検出 */
export function findDuplicateMeetings(draft: Pick<Meeting, 'id' | 'personIds' | 'occurredAt' | 'eventName'>, meetings: Meeting[]): Meeting[] {
  const day = localDay(draft.occurredAt);
  const ev = (draft.eventName ?? '').trim();
  return meetings.filter(
    (m) =>
      m.id !== draft.id &&
      localDay(m.occurredAt) === day &&
      (m.eventName ?? '').trim() === ev &&
      m.personIds.some((p) => draft.personIds.includes(p)),
  );
}

/** 人物削除時: 面会から人物を外し、参加者がいなくなった面会は削除対象にする */
export function detachPersonFromMeetings(meetings: Meeting[], personId: string): { updated: Meeting[]; deletedIds: string[] } {
  const updated: Meeting[] = [];
  const deletedIds: string[] = [];
  const now = new Date().toISOString();
  for (const m of meetings) {
    if (!m.personIds.includes(personId)) continue;
    const rest = m.personIds.filter((p) => p !== personId);
    if (rest.length === 0) deletedIds.push(m.id);
    else updated.push({ ...m, personIds: rest, updatedAt: now });
  }
  return { updated, deletedIds };
}
