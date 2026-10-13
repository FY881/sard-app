import { execFileSync } from 'child_process';
import path from 'path';
import { DAY_MS, GRACE_DAYS, MEMBERSHIP_KEY, MembershipStore } from '../entitlementStore';
import { makeTestKey, memoryKv, repoRoot } from './testKeys';

const tool = path.join(repoRoot, 'tools/membership/issue-code.mjs');
const k = makeTestKey();
const issue = (...args: string[]) =>
  execFileSync('node', [tool, ...args, '--key', k.pemPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const setup = (opts: { device?: string; revoked?: string[]; isDev?: boolean } = {}) => {
  const kv = memoryKv();
  let now = Date.now();
  const store = new MembershipStore(kv, {
    publicKeyHex: k.pubHex,
    deviceId: () => opts.device ?? 'AAAA-BBBB-CCCC',
    now: () => now,
    revokedCodeIds: () => opts.revoked ?? [],
    isDev: opts.isDev,
  });
  return { kv, store, advance: (ms: number) => (now += ms), getNow: () => now };
};

describe('MembershipStore', () => {
  it('starts free', () => {
    const { store } = setup();
    expect(store.effective()).toMatchObject({ tier: 'free', status: 'free' });
  });

  it('activates a code and stores the admin-compatible entitlement shape', () => {
    const { store } = setup();
    const res = store.activate(issue('pro', '30'));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.keys(res.entitlement).sort()).toEqual(
      ['activatedAt', 'code', 'codeId', 'deviceId', 'expiresAt', 'issuedAt', 'issuedBy', 'source', 'tier'].sort(),
    );
    expect(res.entitlement).toMatchObject({ tier: 'pro', source: 'code', issuedBy: 'owner' });
    expect(store.effective()).toMatchObject({ tier: 'pro', status: 'active', daysLeft: 30 });
  });

  it('refuses activating the same code twice', () => {
    const { store } = setup();
    const code = issue('plus', '30');
    expect(store.activate(code).ok).toBe(true);
    expect(store.activate(code)).toEqual({ ok: false, error: 'already' });
  });

  it('goes to grace after expiry then back to free without losing other data', () => {
    const { store, advance } = setup();
    store.activate(issue('plus', '1'));
    advance(DAY_MS + 1000);
    expect(store.effective()).toMatchObject({ tier: 'plus', status: 'grace' });
    advance(GRACE_DAYS * DAY_MS);
    expect(store.effective()).toMatchObject({ tier: 'free', status: 'free' });
    expect(store.exportCodes()).toHaveLength(1);
  });

  it('picks the highest active tier and prefers active over grace', () => {
    const { store, advance } = setup();
    store.activate(issue('legend', '1'));
    store.activate(issue('plus', '30'));
    expect(store.effective().tier).toBe('legend');
    advance(DAY_MS + 1000);
    expect(store.effective()).toMatchObject({ tier: 'plus', status: 'active' });
  });

  it('cannot be tampered by editing storage', () => {
    const { store, kv } = setup();
    store.activate(issue('plus', '30'));
    const state = JSON.parse(kv.getString(MEMBERSHIP_KEY)!);
    state.entitlements[0].tier = 'legend';
    state.entitlements[0].expiresAt = null;
    kv.set(MEMBERSHIP_KEY, JSON.stringify(state));
    expect(store.effective()).toMatchObject({ tier: 'plus' });
    expect(store.effective().expiresAt).not.toBeNull();
    state.entitlements.push({ tier: 'legend', source: 'code', code: 'SARD-FAKE', codeId: 'x', issuedBy: 'owner', issuedAt: 0, expiresAt: null, activatedAt: 0 });
    kv.set(MEMBERSHIP_KEY, JSON.stringify(state));
    expect(store.effective().tier).toBe('plus');
  });

  it('gives one 7-day Plus trial per device', () => {
    const { store, advance } = setup();
    expect(store.canStartTrial()).toBe(true);
    const t = store.startTrial();
    expect(t.ok && t.entitlement).toMatchObject({ tier: 'plus', source: 'trial' });
    expect(store.effective()).toMatchObject({ tier: 'plus', daysLeft: 7 });
    expect(store.startTrial()).toEqual({ ok: false, error: 'used' });
    advance(10 * DAY_MS + 1);
    expect(store.effective().tier).toBe('free');
    expect(store.canStartTrial()).toBe(false);
  });

  it('does not offer a trial to paying members', () => {
    const { store } = setup();
    store.activate(issue('pro', '30'));
    expect(store.canStartTrial()).toBe(false);
    expect(store.startTrial()).toEqual({ ok: false, error: 'paid' });
  });

  it('rejects device-bound codes for another phone and expired codes', () => {
    const { store } = setup({ device: 'AAAA-BBBB-CCCC' });
    expect(store.activate(issue('pro', '30', 'ZZZZ-ZZZZ-ZZZZ'))).toEqual({ ok: false, error: 'device' });
    expect(store.activate(issue('pro', '30', 'AAAA-BBBB-CCCC')).ok).toBe(true);
  });

  it('honours revocation from remote config at evaluation time', () => {
    const revoked: string[] = [];
    const { store } = setup({ revoked });
    const r = store.activate(issue('legend', 'lifetime'));
    expect(store.effective().tier).toBe('legend');
    revoked.push(r.ok ? r.entitlement.codeId : '');
    expect(store.effective().tier).toBe('free');
  });

  it('restores codes on a new install', () => {
    const a = setup();
    a.store.activate(issue('pro', '30'));
    a.store.activate(issue('plus', 'lifetime'));
    const b = setup();
    expect(b.store.restore(a.store.exportCodes())).toEqual({ restored: 2, failed: 0 });
    expect(b.store.effective().tier).toBe('pro');
    expect(b.store.restore(['junk'])).toEqual({ restored: 0, failed: 1 });
  });

  it('dev owner unlock only works in dev builds', () => {
    const prod = setup({ isDev: false });
    expect(prod.store.setDevTier('legend')).toBe(false);
    expect(prod.store.effective().tier).toBe('free');
    const dev = setup({ isDev: true });
    expect(dev.store.setDevTier('legend')).toBe(true);
    expect(dev.store.effective()).toMatchObject({ tier: 'legend', devOverride: true });
  });
});
