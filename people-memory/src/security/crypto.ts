// Web Crypto API による暗号化ユーティリティ。
// 鍵構成: パスフレーズ --PBKDF2(SHA-256)--> KEK(AES-GCM) で、ランダム生成した DEK(AES-GCM 256bit) をラップして保存。
// レコードは DEK で AES-GCM 暗号化する。パスフレーズ・鍵は永続保存しない。

export const CRYPTO_VERSION = 1;
export const DEFAULT_KDF_ITERATIONS = 310_000;

export type KdfParams = {
  name: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: string; // base64
};

export type EncryptedPayload = {
  v: number; // record format version
  iv: string; // base64
  ct: string; // base64
};

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function newKdfParams(iterations = DEFAULT_KDF_ITERATIONS): KdfParams {
  return { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(randomBytes(16)) };
}

export async function deriveKek(passphrase: string, kdf: KdfParams): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: kdf.hash, iterations: kdf.iterations, salt: fromB64(kdf.salt) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  );
}

export async function generateDek(): Promise<CryptoKey> {
  // extractable は wrapKey のために true が必要（ラップ以外で export しない）
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<EncryptedPayload> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv });
  return { v: CRYPTO_VERSION, iv: toB64(iv), ct: toB64(ct) };
}

export async function unwrapDek(wrapped: EncryptedPayload, kek: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    fromB64(wrapped.ct),
    kek,
    { name: 'AES-GCM', iv: fromB64(wrapped.iv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(key: CryptoKey, value: unknown, aad?: string): Promise<EncryptedPayload> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, ...(aad ? { additionalData: enc.encode(aad) } : {}) },
    key,
    enc.encode(JSON.stringify(value)),
  );
  return { v: CRYPTO_VERSION, iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJson<T>(key: CryptoKey, payload: EncryptedPayload, aad?: string): Promise<T> {
  if (payload.v !== CRYPTO_VERSION) throw new Error('未対応の暗号化レコード形式です');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(payload.iv), ...(aad ? { additionalData: enc.encode(aad) } : {}) },
    key,
    fromB64(payload.ct),
  );
  return JSON.parse(dec.decode(pt)) as T;
}

/** パスフレーズの最低要件（十分な長さ） */
export function validatePassphrase(p: string): string | null {
  if (p.length < 10) return 'パスフレーズは10文字以上にしてください';
  if (/^(.)\1+$/.test(p)) return '同じ文字の繰り返しは使えません';
  return null;
}
