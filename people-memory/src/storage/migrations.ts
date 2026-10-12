// レコード形式・鍵形式のマイグレーション置き場。
// v1 が初版のため現時点で処理はない。形式を変える場合は CRYPTO_VERSION / DB_SCHEMA_VERSION を上げ、ここに変換処理を追加する。
import { DB_SCHEMA_VERSION } from './database';

export function needsMigration(storedSchemaVersion: number): boolean {
  return storedSchemaVersion < DB_SCHEMA_VERSION;
}

export async function migrate(storedSchemaVersion: number): Promise<void> {
  if (storedSchemaVersion > DB_SCHEMA_VERSION) {
    throw new Error('このデータは新しいバージョンのアプリで作成されています。アプリを更新してください。');
  }
}
