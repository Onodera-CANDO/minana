import { decryptJson, encryptJson } from '../security/crypto';
import { getDb, type EncryptedRecord, type RecordKind } from './database';

// 種別ごとに暗号化して保存するリポジトリ。AAD に `${kind}:${id}` を使い、レコードの入替えを検知する。

export class EncryptedRepository {
  constructor(private readonly key: CryptoKey) {}

  private async toRecord(kind: RecordKind, id: string, value: unknown): Promise<EncryptedRecord> {
    const k = `${kind}:${id}`;
    return { key: k, kind, id, payload: await encryptJson(this.key, value, k) };
  }

  async put<T extends { id: string }>(kind: RecordKind, value: T): Promise<void> {
    await getDb().records.put(await this.toRecord(kind, value.id, value));
  }

  async putMany<T extends { id: string }>(kind: RecordKind, values: T[]): Promise<void> {
    const recs = await Promise.all(values.map((v) => this.toRecord(kind, v.id, v)));
    await getDb().records.bulkPut(recs);
  }

  async delete(kind: RecordKind, id: string): Promise<void> {
    await getDb().records.delete(`${kind}:${id}`);
  }

  async deleteMany(kind: RecordKind, ids: string[]): Promise<void> {
    await getDb().records.bulkDelete(ids.map((id) => `${kind}:${id}`));
  }

  async loadAll<T>(kind: RecordKind): Promise<T[]> {
    const recs = await getDb().records.where('kind').equals(kind).toArray();
    return Promise.all(recs.map((r) => decryptJson<T>(this.key, r.payload, r.key)));
  }

  /** 全レコードを置換（暗号化を先に済ませてから単一トランザクションで入替え） */
  async replaceAll(groups: { kind: RecordKind; values: { id: string }[] }[]): Promise<void> {
    const recs: EncryptedRecord[] = [];
    for (const g of groups) {
      recs.push(...(await Promise.all(g.values.map((v) => this.toRecord(g.kind, v.id, v)))));
    }
    const db = getDb();
    await db.transaction('rw', db.records, async () => {
      await db.records.clear();
      await db.records.bulkPut(recs);
    });
  }

  async clearAll(): Promise<void> {
    await getDb().records.clear();
  }

  async count(kind: RecordKind): Promise<number> {
    return getDb().records.where('kind').equals(kind).count();
  }
}
