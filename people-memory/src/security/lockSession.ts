import {
  decryptJson,
  deriveKek,
  encryptJson,
  generateDek,
  newKdfParams,
  unwrapDek,
  wrapDek,
} from '../security/crypto';
import { DB_SCHEMA_VERSION, getDb, type KeyMeta } from '../storage/database';
import { migrate } from '../storage/migrations';

const VERIFIER_AAD = 'keyring:verifier';

export async function isInitialized(): Promise<boolean> {
  return (await getDb().keyring.get('keyring')) !== undefined;
}

/** 初回セットアップ: DEK を生成し、パスフレーズ由来の KEK でラップして保存 */
export async function setupPassphrase(passphrase: string): Promise<CryptoKey> {
  const kdf = newKdfParams();
  const kek = await deriveKek(passphrase, kdf);
  const dek = await generateDek();
  const wrappedDek = await wrapDek(dek, kek);
  const meta: KeyMeta = {
    key: 'keyring',
    schemaVersion: DB_SCHEMA_VERSION,
    kdf,
    wrappedDek,
    createdAt: new Date().toISOString(),
  };
  await getDb().keyring.put(meta);
  // 復号検証用（中身は定数のみ）
  await getDb().settings.put({ key: 'verifier', value: await encryptJson(dek, { ok: true }, VERIFIER_AAD) });
  return dek;
}

/** ロック解除: 誤パスフレーズ時は例外 */
export async function unlock(passphrase: string): Promise<CryptoKey> {
  const meta = await getDb().keyring.get('keyring');
  if (!meta) throw new Error('初期設定がされていません');
  await migrate(meta.schemaVersion);
  const kek = await deriveKek(passphrase, meta.kdf);
  try {
    return await unwrapDek(meta.wrappedDek, kek);
  } catch {
    throw new Error('パスフレーズが違います');
  }
}

export async function verifyKey(dek: CryptoKey): Promise<boolean> {
  const v = await getDb().settings.get('verifier');
  if (!v) return true;
  try {
    await decryptJson(dek, v.value as never, VERIFIER_AAD);
    return true;
  } catch {
    return false;
  }
}

/** パスフレーズ変更: DEK は変えずに再ラップするだけなのでデータの再暗号化は不要 */
export async function changePassphrase(current: string, next: string): Promise<void> {
  const dek = await unlock(current);
  const kdf = newKdfParams();
  const kek = await deriveKek(next, kdf);
  const meta = (await getDb().keyring.get('keyring'))!;
  await getDb().keyring.put({ ...meta, kdf, wrappedDek: await wrapDek(dek, kek) });
}

/** 全データ削除（鍵・設定・レコードすべて） */
export async function wipeEverything(): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.records, db.keyring, db.settings, async () => {
    await db.records.clear();
    await db.keyring.clear();
    await db.settings.clear();
  });
}
