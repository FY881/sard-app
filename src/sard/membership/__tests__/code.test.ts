import { execFileSync } from 'child_process';
import path from 'path';
import { base32Decode, base32Encode } from '../base32';
import { deviceTagFor, extractCodeText, formatCodeForDisplay, verifyCode } from '../code';
import { makeTestKey, repoRoot } from './testKeys';

const tool = path.join(repoRoot, 'tools/membership/issue-code.mjs');
const issue = (key: string, ...args: string[]) =>
  execFileSync('node', [tool, ...args, '--key', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

describe('membership codes (owner tool ↔ app verifier)', () => {
  const k = makeTestKey();
  const other = makeTestKey();
  const now = Date.now();

  it('round-trips base32', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 255, 17, 99, 128]);
    expect(Array.from(base32Decode(base32Encode(bytes))!)).toEqual(Array.from(bytes));
    expect(base32Decode('!!')).toBeNull();
  });

  it('verifies a 30-day pro code issued by the Node tool', () => {
    const code = issue(k.pemPath, 'pro', '30');
    expect(code).toMatch(/^SARD-[0-9A-Z-]+$/);
    const res = verifyCode(code, { publicKeyHex: k.pubHex, deviceId: 'ANY', now });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.code.tier).toBe('pro');
    expect(res.code.issuedBy).toBe('owner');
    expect(res.code.days).toBe(30);
    expect(res.code.deviceBound).toBe(false);
    expect(res.expiresAt! - res.code.issuedAt).toBe(30 * 86_400_000);
  });

  it('supports lifetime, legend, admin grants and issuer roles', () => {
    const code = issue(k.pemPath, 'legend', 'lifetime', '--issuer', 'membership_manager', '--admin');
    const res = verifyCode(code, { publicKeyHex: k.pubHex, deviceId: 'X', now });
    expect(res.ok && res.expiresAt).toBeNull();
    expect(res.ok && res.code.admin).toBe(true);
    expect(res.ok && res.code.issuedBy).toBe('membership_manager');
  });

  it('binds to a device id (dashes/case ignored)', () => {
    const code = issue(k.pemPath, 'plus', '7', 'ab12-cd34-ef56');
    expect(verifyCode(code, { publicKeyHex: k.pubHex, deviceId: 'AB12-CD34-EF56', now }).ok).toBe(true);
    expect(verifyCode(code, { publicKeyHex: k.pubHex, deviceId: 'AB12CD34EF56', now }).ok).toBe(true);
    expect(verifyCode(code, { publicKeyHex: k.pubHex, deviceId: 'ZZZZ-CD34-EF56', now })).toEqual({ ok: false, error: 'device' });
    expect(deviceTagFor('ab12-cd34-ef56')).toBe(deviceTagFor('AB12CD34EF56'));
  });

  it('rejects a code signed by another key, tampering, junk and revoked ids', () => {
    const code = issue(other.pemPath, 'legend', 'lifetime');
    expect(verifyCode(code, { publicKeyHex: k.pubHex, deviceId: 'X', now })).toEqual({ ok: false, error: 'signature' });
    const good = issue(k.pemPath, 'plus', '30');
    // flip one character of the payload (tier byte area)
    const chars = good.replace(/^SARD-/, '').replace(/-/g, '').split('');
    chars[3] = chars[3] === 'A' ? 'B' : 'A';
    expect(verifyCode(chars.join(''), { publicKeyHex: k.pubHex, deviceId: 'X', now }).ok).toBe(false);
    expect(verifyCode('hello', { publicKeyHex: k.pubHex, deviceId: 'X', now })).toEqual({ ok: false, error: 'format' });
    const r = verifyCode(good, { publicKeyHex: k.pubHex, deviceId: 'X', now });
    const id = r.ok ? r.code.codeId : '';
    expect(verifyCode(good, { publicKeyHex: k.pubHex, deviceId: 'X', now, revokedCodeIds: [id] })).toEqual({ ok: false, error: 'revoked' });
  });

  it('accepts lower-case, spaces, links and QR payloads', () => {
    const code = issue(k.pemPath, 'plus', '30');
    const messy = ' ' + code.toLowerCase().replace(/-/g, ' ') + ' ';
    expect(verifyCode(messy, { publicKeyHex: k.pubHex, deviceId: 'X', now }).ok).toBe(true);
    const link = `sard://membership?code=${encodeURIComponent(code)}`;
    expect(extractCodeText(link)).toBe(code);
    expect(verifyCode(link, { publicKeyHex: k.pubHex, deviceId: 'X', now }).ok).toBe(true);
    expect(formatCodeForDisplay(messy)).toBe(code);
  });

  it('rejects free tier and future-dated codes', () => {
    const code = issue(k.pemPath, 'pro', '30');
    const past = Date.now() - 10 * 86_400_000;
    expect(verifyCode(code, { publicKeyHex: k.pubHex, deviceId: 'X', now: past })).toEqual({ ok: false, error: 'future' });
    expect(() => issue(k.pemPath, 'free', '30')).toThrow();
  });
});
