import type { FaceEmbedding, ImportBatch, Meeting, Person, PersonRelation } from '../../types';
import { decryptJson, deriveKek, encryptJson, newKdfParams, type EncryptedPayload, type KdfParams } from '../../security/crypto';

// 暗号化バックアップ（仕様 8.3）。生の顔画像は含めない（そもそも保存していない）。

export const BACKUP_FORMAT = 'people-memory-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_SCHEMA_VERSION = 1;
const AAD = `${BACKUP_FORMAT}:v${BACKUP_FORMAT_VERSION}`;

export type BackupData = {
  schemaVersion: number;
  createdAt: string;
  faceModel?: { name: string; version: string };
  people: Person[];
  faces: FaceEmbedding[];
  meetings: Meeting[];
  relations: PersonRelation[];
  importBatches: ImportBatch[];
};

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  createdAt: string;
  kdf: KdfParams;
  payload: EncryptedPayload;
};

export async function createBackup(data: BackupData, passphrase: string): Promise<BackupFile> {
  const kdf = newKdfParams();
  const key = await deriveKek(passphrase, kdf);
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: data.createdAt,
    kdf,
    payload: await encryptJson(key, data, AAD),
  };
}

export function parseBackupFile(text: string): BackupFile {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('バックアップファイルの形式が正しくありません');
  }
  const f = obj as Partial<BackupFile>;
  if (f?.format !== BACKUP_FORMAT) throw new Error('People Memory のバックアップファイルではありません');
  if (f.formatVersion !== BACKUP_FORMAT_VERSION) throw new Error('未対応のバックアップ形式バージョンです');
  if (!f.kdf || f.kdf.name !== 'PBKDF2' || typeof f.kdf.iterations !== 'number' || f.kdf.iterations < 100_000 || !f.kdf.salt)
    throw new Error('バックアップの鍵情報が不正です');
  if (!f.payload?.iv || !f.payload?.ct) throw new Error('バックアップの本体が見つかりません');
  return f as BackupFile;
}

export async function decryptBackup(file: BackupFile, passphrase: string): Promise<BackupData> {
  const key = await deriveKek(passphrase, file.kdf);
  let data: BackupData;
  try {
    data = await decryptJson<BackupData>(key, file.payload, AAD);
  } catch {
    throw new Error('パスフレーズが違うか、ファイルが破損しています');
  }
  validateBackupData(data);
  return data;
}

function isArr(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

export function validateBackupData(d: BackupData): void {
  if (typeof d !== 'object' || d === null) throw new Error('バックアップ内容が不正です');
  if (d.schemaVersion > BACKUP_SCHEMA_VERSION) throw new Error('新しいバージョンのアプリで作成されたバックアップです');
  for (const k of ['people', 'faces', 'meetings', 'relations', 'importBatches'] as const) {
    if (!isArr(d[k])) throw new Error(`バックアップの ${k} が不正です`);
  }
  const ids = new Set<string>();
  for (const p of d.people) {
    if (typeof p.id !== 'string' || typeof p.fullName !== 'string' || !isArr(p.tags) || !isArr(p.sourceRefs))
      throw new Error('人物データの形式が不正です');
    ids.add(p.id);
  }
  for (const f of d.faces) {
    if (!ids.has(f.personId) || !isArr(f.embedding) || f.embedding.some((x) => typeof x !== 'number'))
      throw new Error('顔特徴量データの形式が不正です');
  }
  for (const m of d.meetings) {
    if (typeof m.id !== 'string' || !isArr(m.personIds) || typeof m.occurredAt !== 'string')
      throw new Error('面会データの形式が不正です');
  }
  for (const r of d.relations) {
    if (typeof r.id !== 'string' || typeof r.fromPersonId !== 'string') throw new Error('関係データの形式が不正です');
  }
}

export function backupCounts(d: BackupData) {
  return {
    people: d.people.length,
    faces: d.faces.length,
    facePeople: new Set(d.faces.map((f) => f.personId)).size,
    meetings: d.meetings.length,
    relations: d.relations.length,
    importBatches: d.importBatches.length,
  };
}

export function backupFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `people-memory-backup-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.pmbackup.json`;
}
