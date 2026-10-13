/** App-lock rules: PIN hashing and when to ask again. */
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export interface LockSettings {
  enabled: boolean;
  biometric: boolean;
  /** pbkdf2-sha256 hex of the PIN, empty when no PIN set */
  pinHash: string;
  pinSalt: string;
  /** relock after the app was in background this long (ms); 0 = every time */
  timeoutMs: number;
  /** hidden shelf requires unlocking even when the app lock is off */
  lockHiddenShelf: boolean;
  hideInRecents: boolean;
}

export const DEFAULT_LOCK: LockSettings = {
  enabled: false,
  biometric: true,
  pinHash: '',
  pinSalt: '',
  timeoutMs: 60_000,
  lockHiddenShelf: true,
  hideInRecents: false,
};

export const LOCK_TIMEOUTS = [0, 30_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export const isValidPin = (pin: string) => /^\d{4,8}$/.test(pin);

export const hashPin = (pin: string, saltHex: string): string =>
  bytesToHex(pbkdf2(sha256, utf8ToBytes(pin), utf8ToBytes(saltHex), { c: 20_000, dkLen: 32 }));

export const verifyPin = (pin: string, s: Pick<LockSettings, 'pinHash' | 'pinSalt'>) => {
  if (!s.pinHash || !isValidPin(pin)) return false;
  const h = hashPin(pin, s.pinSalt);
  // constant-time compare
  let diff = h.length ^ s.pinHash.length;
  for (let i = 0; i < Math.min(h.length, s.pinHash.length); i++) diff |= h.charCodeAt(i) ^ s.pinHash.charCodeAt(i);
  return diff === 0;
};

export const shouldLockOnResume = (s: LockSettings, backgroundAt: number | null, now = Date.now()) =>
  s.enabled && (backgroundAt === null || now - backgroundAt >= s.timeoutMs);

/** Wrong-PIN backoff: 5 free tries, then 30 s doubling up to 15 min. */
export const lockoutMs = (failures: number) =>
  failures < 5 ? 0 : Math.min(15 * 60_000, 30_000 * 2 ** (failures - 5));
