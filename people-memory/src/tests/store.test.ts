import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../app/store';
import { PeopleMemoryDB, getDb, setDbForTest } from '../storage/database';
import { BACKUP_SCHEMA_VERSION, createBackup, decryptBackup, parseBackupFile } from '../features/backup/backup';
import { planImport } from '../features/csv-import/plan';
import { applyPlan } from '../features/csv-import/apply';
import { decodeCsv, parseCsv } from '../features/csv-import/decode';
import { applyMapping, suggestMapping } from '../features/csv-import/mapping';
import { meetingCount } from '../features/meetings/meetingStats';
import type { FaceEmbedding, Meeting } from '../types';
import { person, sample } from './helpers';

const PASS = 'テスト用の長いパスフレーズ';

function freshDb() {
  setDbForTest(new PeopleMemoryDB(`test-${crypto.randomUUID()}`));
}

const S = () => useStore.getState();

function faceOf(personId: string): FaceEmbedding {
  return { id: crypto.randomUUID(), personId, embedding: [0.1, 0.2, 0.3], modelName: 'human-faceres', modelVersion: '3.3.6', consentAt: '2026-10-12T00:00:00Z', consentMethod: 'in_person_confirmed', consentVersion: 'face-consent-v1', createdAt: '2026-10-12T00:00:00Z' };
}
function meetingOf(personIds: string[]): Meeting {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), personIds, occurredAt: now, createdAt: now, updatedAt: now };
}

function importFile(file: string) {
  const p = parseCsv(decodeCsv(sample(file)).text);
  const m = suggestMapping(p.headers);
  const rows = p.rows.map((raw) => ({ raw, mapped: applyMapping(raw, p.headers, m, false) }));
  const plan = planImport(rows, Object.values(S().people), 'sansan');
  return applyPlan(plan, new Map(), new Map(Object.entries(S().people)), { source: 'sansan', batchId: 'b', now: new Date().toISOString(), overwriteManual: false });
}

describe('暗号化ストアとロック', () => {
  beforeEach(async () => {
    freshDb();
    useStore.setState({ status: 'loading', repo: null, people: {}, faces: {}, meetings: {}, relations: {}, importBatches: {} });
    await S().init();
  });

  it('初回は setup、設定後はロック／解除できる。誤パスフレーズは拒否', async () => {
    expect(S().status).toBe('setup');
    await S().setup(PASS);
    const p = person({ fullName: '暗号 太郎', email: 'secret@example.com' });
    await S().savePerson(p);
    S().lock();
    expect(S().status).toBe('locked');
    expect(S().people).toEqual({});
    await expect(S().unlock('まちがったパスフレーズです')).rejects.toThrow('パスフレーズが違います');
    await S().unlock(PASS);
    expect(S().people[p.id].fullName).toBe('暗号 太郎');
  });

  it('IndexedDB 上に個人情報・特徴量が平文で残らない', async () => {
    await S().setup(PASS);
    const p = person({ fullName: '平文チェック', email: 'plain@example.com' });
    await S().savePerson(p);
    await S().saveFaces([faceOf(p.id)]);
    const raw = JSON.stringify(await getDb().records.toArray());
    expect(raw).not.toContain('平文チェック');
    expect(raw).not.toContain('plain@example.com');
    expect(raw).not.toContain('0.1,0.2,0.3');
    const keyring = JSON.stringify(await getDb().keyring.toArray());
    expect(keyring).not.toContain(PASS);
  });

  it('CSV再取込後も顔特徴量・面会履歴・手動メモが残り、面会回数は変わらない', async () => {
    await S().setup(PASS);
    const r1 = importFile('sansan_dummy_utf8_bom.csv');
    await S().savePeople([...r1.creates, ...r1.updates]);
    const hanako = Object.values(S().people).find((p) => p.sourceRefs.some((r) => r.externalCardId === 'C0002'))!;
    await S().savePerson({ ...hanako, notes: '大事なメモ' });
    await S().saveFaces([faceOf(hanako.id)]);
    await S().saveMeeting(meetingOf([hanako.id]));
    const before = meetingCount(Object.values(S().meetings), hanako.id);

    const r2 = importFile('sansan_dummy_reimport.csv');
    await S().savePeople([...r2.creates, ...r2.updates]);
    S().lock();
    await S().unlock(PASS);

    const after = S().people[hanako.id];
    expect(after.jobTitle).toBe('代表取締役社長');
    expect(after.notes).toBe('大事なメモ');
    expect(Object.values(S().faces).filter((f) => f.personId === hanako.id)).toHaveLength(1);
    expect(meetingCount(Object.values(S().meetings), hanako.id)).toBe(before);
    expect(before).toBe(1);
  });

  it('人物削除で顔・関係を削除し、共有の面会からは参加者だけ外す', async () => {
    await S().setup(PASS);
    const a = person({ fullName: 'A' });
    const b = person({ fullName: 'B' });
    await S().savePeople([a, b]);
    await S().saveFaces([faceOf(a.id)]);
    const solo = meetingOf([a.id]);
    const shared = meetingOf([a.id, b.id]);
    await S().saveMeeting(solo);
    await S().saveMeeting(shared);
    await S().saveRelation({ id: 'r1', fromPersonId: b.id, toPersonId: a.id, type: 'introduced_by' });
    await S().deletePerson(a.id);
    expect(S().people[a.id]).toBeUndefined();
    expect(Object.values(S().faces)).toHaveLength(0);
    expect(Object.values(S().relations)).toHaveLength(0);
    expect(S().meetings[solo.id]).toBeUndefined();
    expect(S().meetings[shared.id].personIds).toEqual([b.id]);
    // 永続化も反映されている
    S().lock();
    await S().unlock(PASS);
    expect(Object.keys(S().people)).toEqual([b.id]);
    expect(Object.values(S().meetings)).toHaveLength(1);
  });

  it('暗号化バックアップを別のストレージ（新規DB）に復元できる', async () => {
    await S().setup(PASS);
    const a = person({ fullName: 'バックアップ 花子' });
    await S().savePerson(a);
    await S().saveFaces([faceOf(a.id)]);
    await S().saveMeeting(meetingOf([a.id]));
    const file = await createBackup(
      { schemaVersion: BACKUP_SCHEMA_VERSION, createdAt: new Date().toISOString(), people: Object.values(S().people), faces: Object.values(S().faces), meetings: Object.values(S().meetings), relations: [], importBatches: [] },
      'バックアップ用パスフレーズ',
    );
    const text = JSON.stringify(file);
    expect(text).not.toContain('バックアップ 花子');

    // 別端末を想定：新しいDBで初期設定 → 復元
    freshDb();
    useStore.setState({ status: 'loading', repo: null, people: {}, faces: {}, meetings: {}, relations: {}, importBatches: {} });
    await S().init();
    await S().setup('別端末のパスフレーズです');
    await expect(decryptBackup(parseBackupFile(text), 'ちがうパスフレーズです')).rejects.toThrow();
    const data = await decryptBackup(parseBackupFile(text), 'バックアップ用パスフレーズ');
    await S().replaceAll(data);
    S().lock();
    await S().unlock('別端末のパスフレーズです');
    expect(S().people[a.id].fullName).toBe('バックアップ 花子');
    expect(Object.values(S().faces)).toHaveLength(1);
    expect(Object.values(S().meetings)).toHaveLength(1);
  });

  it('全データ削除で setup に戻る', async () => {
    await S().setup(PASS);
    await S().savePerson(person({ fullName: 'X' }));
    await S().wipeAll();
    expect(S().status).toBe('setup');
    expect(await getDb().records.count()).toBe(0);
    expect(await getDb().keyring.count()).toBe(0);
  });
});

describe('バックアップファイル検証', () => {
  it('不正な形式・改ざんを検出', async () => {
    expect(() => parseBackupFile('not json')).toThrow();
    expect(() => parseBackupFile('{"format":"x"}')).toThrow();
    const f = await createBackup({ schemaVersion: 1, createdAt: '', people: [], faces: [], meetings: [], relations: [], importBatches: [] }, 'long enough pass');
    const tampered = { ...f, payload: { ...f.payload, ct: f.payload.ct.slice(0, -4) + 'AAAA' } };
    await expect(decryptBackup(parseBackupFile(JSON.stringify(tampered)), 'long enough pass')).rejects.toThrow();
  });
});
