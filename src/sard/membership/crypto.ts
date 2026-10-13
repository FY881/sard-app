/**
 * Pure-JS crypto used by memberships, remote config and plugin checks
 * (@noble: audited, no native code, works in Hermes and in jest).
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export { bytesToHex, hexToBytes, utf8ToBytes };

export const sha256Bytes = (data: Uint8Array | string): Uint8Array =>
  sha256(typeof data === 'string' ? utf8ToBytes(data) : data);

export const sha256Hex = (data: Uint8Array | string): string => bytesToHex(sha256Bytes(data));

export const verifyEd25519 = (
  signature: Uint8Array,
  message: Uint8Array,
  publicKeyHex: string,
): boolean => {
  try {
    return ed25519.verify(signature, message, hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
};

export const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const base64Encode = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
};

export const base64Decode = (text: string): Uint8Array | null => {
  const clean = text.replace(/[\s=]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    value = ((value << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
};

/** Stable JSON (keys sorted recursively), identical to tools/membership/codec.mjs. */
export const canonicalJson = (v: unknown): string => {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return (
      '{' +
      Object.keys(o)
        .filter(k => o[k] !== undefined)
        .sort()
        .map(k => JSON.stringify(k) + ':' + canonicalJson(o[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(v);
};
