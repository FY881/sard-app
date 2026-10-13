/**
 * Password-encrypted backups: scrypt (N=2^15, r=8, p=1) → AES-256-GCM.
 * Random bytes are injected (expo-crypto on device, node crypto in tests).
 */
import { gcm } from '@noble/ciphers/aes.js';
import { scrypt } from '@noble/hashes/scrypt.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { base64Decode, base64Encode } from '../../membership/crypto';

export interface EncryptedEnvelope {
  sard: 'encrypted-backup';
  v: 1;
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  cipher: 'aes-256-gcm';
  nonce: string;
  data: string;
  createdAt: string;
}

export type RandomBytes = (n: number) => Uint8Array;

export const DEFAULT_N = 2 ** 15;

const deriveKey = (password: string, salt: Uint8Array, N: number, r: number, p: number) =>
  scrypt(utf8ToBytes(password.normalize('NFC')), salt, { N, r, p, dkLen: 32 });

export const encryptJson = (
  value: unknown,
  password: string,
  randomBytes: RandomBytes,
  opts: { N?: number; now?: Date } = {},
): EncryptedEnvelope => {
  if (!password || password.length < 6) throw new Error('weak-password');
  const N = opts.N ?? DEFAULT_N;
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = deriveKey(password, salt, N, 8, 1);
  const ct = gcm(key, nonce).encrypt(utf8ToBytes(JSON.stringify(value)));
  return {
    sard: 'encrypted-backup',
    v: 1,
    kdf: { name: 'scrypt', N, r: 8, p: 1, salt: base64Encode(salt) },
    cipher: 'aes-256-gcm',
    nonce: base64Encode(nonce),
    data: base64Encode(ct),
    createdAt: (opts.now ?? new Date()).toISOString(),
  };
};

export const isEncryptedEnvelope = (v: unknown): v is EncryptedEnvelope =>
  !!v && typeof v === 'object' && (v as EncryptedEnvelope).sard === 'encrypted-backup';

export const decryptJson = <T = unknown>(env: EncryptedEnvelope, password: string): T => {
  if (!isEncryptedEnvelope(env) || env.v !== 1 || env.kdf?.name !== 'scrypt') throw new Error('bad-format');
  const { N, r, p } = env.kdf;
  if (N > 2 ** 20 || r > 16 || p > 4) throw new Error('bad-format');
  const salt = base64Decode(env.kdf.salt);
  const nonce = base64Decode(env.nonce);
  const data = base64Decode(env.data);
  if (!salt || !nonce || !data) throw new Error('bad-format');
  const key = deriveKey(password, salt, N, r, p);
  let plain: Uint8Array;
  try {
    plain = gcm(key, nonce).decrypt(data);
  } catch {
    throw new Error('wrong-password');
  }
  return JSON.parse(bytesToUtf8(plain)) as T;
};
