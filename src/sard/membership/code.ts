/**
 * Owner-signed membership codes, verified fully offline.
 * Byte layout documented in tools/membership/codec.mjs (kept in sync by a test).
 */
import { base32Decode, base32Encode } from './base32';
import { concatBytes, sha256Bytes, utf8ToBytes, verifyEd25519 } from './crypto';
import { ADMIN_ROLES, tierFromCode, type AdminRole, type Tier } from './tiers';

export const CODE_DOMAIN = 'SARD-CODE-v1';
const PAYLOAD_LEN = 18;
const SIG_LEN = 64;

export interface DecodedCode {
  version: number;
  tier: Tier;
  issuedBy: AdminRole;
  deviceBound: boolean;
  admin: boolean;
  /** 8 hex chars. */
  codeId: string;
  /** ms */
  issuedAt: number;
  /** 0 = lifetime */
  days: number;
  deviceTag: number;
}

export type CodeError =
  | 'format'
  | 'signature'
  | 'version'
  | 'tier'
  | 'role'
  | 'device'
  | 'future'
  | 'expired'
  | 'revoked';

export type VerifyResult =
  | { ok: true; code: DecodedCode; expiresAt: number | null }
  | { ok: false; error: CodeError };

/** Device tag = first 4 bytes of sha256("sard-device:" + id without dashes/spaces, upper-case). */
export const deviceTagFor = (deviceId: string): number => {
  const h = sha256Bytes('sard-device:' + deviceId.replace(/[\s-]/g, '').toUpperCase());
  return ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
};

const u32 = (b: Uint8Array, o: number) =>
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** Pulls the code out of pasted text, a QR payload, or a sard://membership?code= link. */
export const extractCodeText = (input: string): string => {
  const text = (input || '').trim();
  const fromLink = /[?&]code=([^&#\s]+)/i.exec(text);
  if (fromLink) return decodeURIComponent(fromLink[1]);
  const m = /SARD[-\s]?([0-9A-Za-z][0-9A-Za-z\s-]{40,})/i.exec(text);
  return (m ? m[1] : text).trim();
};

export const decodeCode = (
  input: string,
): { payload: Uint8Array; signature: Uint8Array } | null => {
  const raw = extractCodeText(input).replace(/^SARD-?/i, '');
  const bytes = base32Decode(raw);
  if (!bytes || bytes.length < PAYLOAD_LEN + SIG_LEN) return null;
  return {
    payload: bytes.slice(0, PAYLOAD_LEN),
    signature: bytes.slice(PAYLOAD_LEN, PAYLOAD_LEN + SIG_LEN),
  };
};

export const parsePayload = (p: Uint8Array): DecodedCode | CodeError => {
  if (p[0] !== 1) return 'version';
  const tier = tierFromCode(p[1]);
  if (!tier || tier === 'free') return 'tier';
  const role = ADMIN_ROLES[p[2]];
  if (!role || p[2] > 2) return 'role';
  return {
    version: p[0],
    tier,
    issuedBy: role,
    deviceBound: (p[3] & 1) === 1,
    admin: (p[3] & 2) === 2,
    codeId: u32(p, 4).toString(16).padStart(8, '0'),
    issuedAt: u32(p, 8) * 1000,
    days: (p[12] << 8) | p[13],
    deviceTag: u32(p, 14),
  };
};

const DAY = 86_400_000;
/** Codes are valid from issue time; small clock skew tolerated. */
const CLOCK_SKEW = 2 * DAY;

export const verifyCode = (
  input: string,
  opts: {
    publicKeyHex: string;
    deviceId: string;
    now?: number;
    revokedCodeIds?: readonly string[];
  },
): VerifyResult => {
  const parts = decodeCode(input);
  if (!parts) return { ok: false, error: 'format' };
  const msg = concatBytes(utf8ToBytes(CODE_DOMAIN), parts.payload);
  if (!verifyEd25519(parts.signature, msg, opts.publicKeyHex)) {
    return { ok: false, error: 'signature' };
  }
  const code = parsePayload(parts.payload);
  if (typeof code === 'string') return { ok: false, error: code };
  const now = opts.now ?? Date.now();
  if (code.issuedAt > now + CLOCK_SKEW) return { ok: false, error: 'future' };
  if (code.deviceBound && code.deviceTag !== deviceTagFor(opts.deviceId)) {
    return { ok: false, error: 'device' };
  }
  if (opts.revokedCodeIds?.includes(code.codeId)) return { ok: false, error: 'revoked' };
  const expiresAt = code.days === 0 ? null : code.issuedAt + code.days * DAY;
  return { ok: true, code, expiresAt };
};

/** Re-formats a code for display: SARD-XXXX-XXXX-… */
export const formatCodeForDisplay = (input: string): string => {
  const parts = decodeCode(input);
  if (!parts) return input.trim();
  const raw = base32Encode(concatBytes(parts.payload, parts.signature));
  return 'SARD-' + (raw.match(/.{1,4}/g) ?? []).join('-');
};
