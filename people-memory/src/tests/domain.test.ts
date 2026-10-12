import { describe, expect, it } from 'vitest';
import { normalizeCompany, normalizeEmail, normalizeName } from '../features/people/normalize';
import { findDuplicateCandidates } from '../features/people/duplicates';
import { searchPeople } from '../features/people/search';
import { detachPersonFromMeetings, findDuplicateMeetings, lastMeeting, meetingCount } from '../features/meetings/meetingStats';
import { relationLabelFor } from '../features/relations/relations';
import type { Meeting } from '../types';
import { person } from './helpers';

const mt = (personIds: string[], occurredAt: string, eventName?: string): Meeting => ({ id: crypto.randomUUID(), personIds, occurredAt, eventName, createdAt: occurredAt, updatedAt: occurredAt });

describe('正規化', () => {
  it('全角半角・空白・かなカナ・旧字体・会社の法人格を吸収', () => {
    expect(normalizeName('髙橋　美咲')).toBe(normalizeName('高橋 美咲'));
    expect(normalizeName('やまだ')).toBe(normalizeName('ヤマダ'));
    expect(normalizeEmail(' ＴＡＲＯ@Example.COM ')).toBe('taro@example.com');
    expect(normalizeCompany('株式会社サンプル')).toBe(normalizeCompany('サンプル（株）'));
  });
});

describe('人物', () => {
  it('手動登録時の重複候補：メール／氏名＋会社／氏名のみ', () => {
    const a = person({ fullName: '山田 太郎', companyName: 'A社', email: 'y@example.com' });
    const b = person({ fullName: '山田太郎', companyName: 'B社' });
    const c = findDuplicateCandidates({ fullName: '山田　太郎', companyName: 'A社', email: '' }, [a, b]);
    expect(c.map((x) => x.reason)).toEqual(['name_company', 'name_only']);
    expect(findDuplicateCandidates({ fullName: '別人', email: 'Y@example.com' }, [a])[0].reason).toBe('email');
  });
  it('キーワード・タグ・会社・顔登録で絞り込み', () => {
    const a = person({ fullName: '山田 太郎', companyName: 'サンプル商事', tags: ['VIP'] });
    const b = person({ fullName: '佐藤 花子', nameKana: 'さとう はなこ', companyName: 'テスト工業' });
    const face = (id: string) => id === a.id;
    expect(searchPeople([a, b], { keyword: 'サトウ' }, face)).toEqual([b]);
    expect(searchPeople([a, b], { tag: 'VIP' }, face)).toEqual([a]);
    expect(searchPeople([a, b], { company: 'テスト' }, face)).toEqual([b]);
    expect(searchPeople([a, b], { face: 'registered' }, face)).toEqual([a]);
    expect(searchPeople([a, b], { face: 'unregistered' }, face)).toEqual([b]);
  });
});

describe('面会', () => {
  it('面会回数は面会レコード数、前回は最新', () => {
    const ms = [mt(['a'], '2026-01-01T10:00:00Z'), mt(['a', 'b'], '2026-03-01T10:00:00Z'), mt(['b'], '2026-02-01T10:00:00Z')];
    expect(meetingCount(ms, 'a')).toBe(2);
    expect(lastMeeting(ms, 'a')?.occurredAt).toBe('2026-03-01T10:00:00Z');
  });
  it('同日・同一イベントの重複を警告', () => {
    const ms = [mt(['a'], '2026-03-01T10:00:00Z', '交流会')];
    expect(findDuplicateMeetings({ id: 'new', personIds: ['a'], occurredAt: '2026-03-01T12:00:00Z', eventName: '交流会' }, ms)).toHaveLength(1);
    expect(findDuplicateMeetings({ id: 'new', personIds: ['a'], occurredAt: '2026-03-01T12:00:00Z', eventName: '別イベント' }, ms)).toHaveLength(0);
    expect(findDuplicateMeetings({ id: 'new', personIds: ['b'], occurredAt: '2026-03-01T12:00:00Z', eventName: '交流会' }, ms)).toHaveLength(0);
  });
  it('人物削除時の面会の扱い', () => {
    const solo = mt(['a'], '2026-01-01T00:00:00Z');
    const shared = mt(['a', 'b'], '2026-01-02T00:00:00Z');
    const r = detachPersonFromMeetings([solo, shared], 'a');
    expect(r.deletedIds).toEqual([solo.id]);
    expect(r.updated[0].personIds).toEqual(['b']);
  });
});

describe('関係', () => {
  it('紹介者は方向で表示が変わる', () => {
    const r = { id: '1', fromPersonId: 'a', toPersonId: 'b', type: 'introduced_by' as const };
    expect(relationLabelFor(r, 'a')).toBe('紹介者');
    expect(relationLabelFor(r, 'b')).toBe('この人が紹介した');
  });
});
