import Dexie, { type Table } from 'dexie';
import type { EncryptedPayload, KdfParams } from '../security/crypto';

// IndexedDB スキーマ。個人情報は records テーブルに暗号化ペイロードとしてのみ保存する。
// 平文の索引は「レコード種別」と「ID（UUID）」だけ（漏えい時に推測できるのは件数程度）。

export type RecordKind = 'person' | 'face' | 'meeting' | 'relation' | 'importBatch';

export type EncryptedRecord = {
  key: string; // `${kind}:${id}`
  kind: RecordKind;
  id: string;
  payload: EncryptedPayload;
};

export type KeyMeta = {
  key: 'keyring';
  schemaVersion: number;
  kdf: KdfParams;
  wrappedDek: EncryptedPayload;
  createdAt: string;
};

/** 個人情報を含まない設定・統計（平文） */
export type PlainSetting = { key: string; value: unknown };

export class PeopleMemoryDB extends Dexie {
  records!: Table<EncryptedRecord, string>;
  keyring!: Table<KeyMeta, string>;
  settings!: Table<PlainSetting, string>;

  constructor(name = 'people-memory') {
    super(name);
    this.version(1).stores({
      records: 'key, kind',
      keyring: 'key',
      settings: 'key',
    });
  }
}

export const DB_SCHEMA_VERSION = 1;

let dbInstance: PeopleMemoryDB | null = null;
export function getDb(): PeopleMemoryDB {
  if (!dbInstance) dbInstance = new PeopleMemoryDB();
  return dbInstance;
}
/** テスト用 */
export function setDbForTest(db: PeopleMemoryDB) {
  dbInstance = db;
}
