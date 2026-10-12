import { describe, expect, it } from 'vitest';
import { decryptJson, deriveKek, encryptJson, generateDek, newKdfParams, unwrapDek, validatePassphrase, wrapDek } from '../security/crypto';

describe('crypto', () => {
  it('AES-GCM で暗号化・復号できる（平文は残らない）', async () => {
    const key = await generateDek();
    const payload = await encryptJson(key, { name: '山田 太郎', emb: [0.1, 0.2] }, 'person:1');
    expect(payload.ct).not.toContain('山田');
    expect(atob(payload.ct)).not.toContain('山田');
    expect(await decryptJson(key, payload, 'person:1')).toEqual({ name: '山田 太郎', emb: [0.1, 0.2] });
  });

  it('AAD（レコードキー）が違うと復号できない', async () => {
    const key = await generateDek();
    const payload = await encryptJson(key, { a: 1 }, 'person:1');
    await expect(decryptJson(key, payload, 'person:2')).rejects.toThrow();
  });

  it('パスフレーズ由来の鍵で DEK をラップ／アンラップできる', async () => {
    const kdf = newKdfParams(100_000);
    const dek = await generateDek();
    const wrapped = await wrapDek(dek, await deriveKek('correct horse battery', kdf));
    const dek2 = await unwrapDek(wrapped, await deriveKek('correct horse battery', kdf));
    const p = await encryptJson(dek, { ok: 1 });
    expect(await decryptJson(dek2, p)).toEqual({ ok: 1 });
    await expect(unwrapDek(wrapped, await deriveKek('wrong passphrase!!', kdf))).rejects.toThrow();
  });

  it('短いパスフレーズを拒否', () => {
    expect(validatePassphrase('short')).not.toBeNull();
    expect(validatePassphrase('aaaaaaaaaaaa')).not.toBeNull();
    expect(validatePassphrase('長めの合言葉です1234')).toBeNull();
  });
});
