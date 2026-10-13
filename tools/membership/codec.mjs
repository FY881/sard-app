/**
 * Sard membership code codec (Node side). Must stay byte-compatible with
 * src/sard/membership/code.ts — a jest test issues codes with this file and
 * verifies them with the app code.
 *
 * Payload (18 bytes, big-endian):
 *   0  version (1)
 *   1  tier      0 free · 1 plus · 2 pro · 3 legend
 *   2  issuer    0 owner · 1 general_manager · 2 membership_manager (others rejected)
 *   3  flags     bit0 device-bound · bit1 admin grant (source "admin")
 *   4  codeId    u32 random
 *   8  issuedAt  u32 unix seconds
 *  12  days      u16 (0 = lifetime)
 *  14  deviceTag u32 = first 4 bytes of sha256("sard-device:" + deviceId), 0 when unbound
 * Signature: Ed25519 over utf8("SARD-CODE-v1") || payload (64 bytes).
 * Text: Crockford base32 of payload||signature, grouped by 4, prefixed "SARD-".
 */
import crypto from 'node:crypto';

export const CODE_DOMAIN = 'SARD-CODE-v1';
export const CONFIG_DOMAIN = 'SARD-CONFIG-v1';
export const TIERS = ['free', 'plus', 'pro', 'legend'];
export const ROLES = ['owner', 'general_manager', 'membership_manager'];
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const base32Encode = bytes => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

export const deviceTag = deviceId =>
  crypto.createHash('sha256').update('sard-device:' + deviceId.replace(/[\s-]/g, '').toUpperCase()).digest().readUInt32BE(0);

export const packPayload = ({ tier, issuer = 0, admin = false, codeId, issuedAt, days, device }) => {
  const buf = Buffer.alloc(18);
  buf[0] = 1;
  buf[1] = TIERS.indexOf(tier);
  if (buf[1] < 1 || buf[1] > 3) throw new Error('tier must be plus | pro | legend');
  buf[2] = issuer;
  const tag = device ? deviceTag(device) : 0;
  buf[3] = (device ? 1 : 0) | (admin ? 2 : 0);
  buf.writeUInt32BE(codeId >>> 0, 4);
  buf.writeUInt32BE(issuedAt >>> 0, 8);
  if (!Number.isInteger(days) || days < 0 || days > 65535) throw new Error('days must be 0..65535');
  buf.writeUInt16BE(days, 12);
  buf.writeUInt32BE(tag >>> 0, 14);
  return buf;
};

export const formatCode = raw => 'SARD-' + raw.match(/.{1,4}/g).join('-');







export const signCode = (privateKey, fields) => {
  const payload = packPayload(fields);
  const sig = crypto.sign(null, Buffer.concat([Buffer.from(CODE_DOMAIN), payload]), privateKey);
  return formatCode(base32Encode(Buffer.concat([payload, sig])));
};

/** Stable JSON: object keys sorted recursively (same as app canonicalJson). */
export const canonicalJson = v => {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
};

export const signConfig = (privateKey, config) => {
  const { signature: _drop, ...body } = config;
  const msg = Buffer.from(CONFIG_DOMAIN + canonicalJson(body));
  return { ...body, signature: crypto.sign(null, msg, privateKey).toString('base64') };
};
