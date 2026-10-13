import crypto from 'crypto';
import { canonicalJson } from '../crypto';
import { CONFIG_DOMAIN, SardFlags, parseRemoteConfig } from '../flags';
import { checkFeature } from '../gate';
import { FEATURES, FEATURE_KEYS, featuresByCategory } from '../features';
import { TIER_LIMITS, TIERS } from '../tiers';
import { makeTestKey, memoryKv } from './testKeys';

const k = makeTestKey();
const sign = (body: Record<string, unknown>) => ({
  ...body,
  signature: crypto
    .sign(null, Buffer.from(CONFIG_DOMAIN + canonicalJson(body)), k.privateKey)
    .toString('base64'),
});

describe('sardFlags remote config', () => {
  it('accepts a correctly signed config and kill-switches a feature', () => {
    const flags = new SardFlags(memoryKv(), k.pubHex);
    expect(flags.isEnabled('library.tags')).toBe(true);
    const res = flags.apply(sign({ v: 1, issuedAt: 100, flags: { 'library.tags': false }, revokedCodeIds: ['0a0b0c0d'] }));
    expect(res.ok).toBe(true);
    expect(flags.isEnabled('library.tags')).toBe(false);
    expect(flags.isEnabled('library.surpriseMe')).toBe(true);
    expect(flags.revokedCodeIds()).toEqual(['0a0b0c0d']);
  });

  it('rejects unsigned, tampered, expired and older configs', () => {
    const flags = new SardFlags(memoryKv(), k.pubHex);
    const good = sign({ v: 1, issuedAt: 200, flags: { 'library.tags': false } });
    expect(flags.apply({ ...good, flags: { 'library.tags': true } })).toEqual({ ok: false, error: 'signature' });
    expect(flags.apply({ v: 1, issuedAt: 1, signature: 'AA==' })).toEqual({ ok: false, error: 'signature' });
    expect(flags.apply('{not json')).toEqual({ ok: false, error: 'json' });
    expect(parseRemoteConfig(sign({ v: 1, issuedAt: 1, expiresAt: 10 }), k.pubHex, 20_000).ok).toBe(false);
    expect(flags.apply(good).ok).toBe(true);
    expect(flags.apply(sign({ v: 1, issuedAt: 100 }))).toEqual({ ok: false, error: 'stale' });
  });

  it('killAll turns off everything except core reading', () => {
    const flags = new SardFlags(memoryKv(), k.pubHex);
    flags.apply(sign({ v: 1, issuedAt: 1, killAll: true, message: { ar: 'صيانة', en: 'Maintenance' } }));
    expect(flags.isEnabled('export.fullNovel')).toBe(false);
    expect(flags.isEnabled('core.reading')).toBe(true);
    expect(flags.message()?.ar).toBe('صيانة');
  });

  it('local user toggles', () => {
    const flags = new SardFlags(memoryKv(), k.pubHex);
    flags.setLocal('motivation.quoteOfDay', false);
    expect(flags.isEnabled('motivation.quoteOfDay')).toBe(false);
    flags.setLocal('motivation.quoteOfDay', undefined);
    expect(flags.isEnabled('motivation.quoteOfDay')).toBe(true);
  });
});

describe('gate + registry', () => {
  const on = () => true;
  it('gates by tier, flag and limit', () => {
    expect(checkFeature('export.fullNovel', 'free', on)).toMatchObject({ allowed: false, reason: 'tier', requiredTier: 'plus' });
    expect(checkFeature('export.fullNovel', 'plus', on).allowed).toBe(true);
    expect(checkFeature('export.fullNovel', 'legend', () => false)).toMatchObject({ allowed: false, reason: 'disabled' });
    expect(checkFeature('reading.readerProfiles', 'free', on, 1)).toMatchObject({ allowed: false, reason: 'limit', requiredTier: 'plus', limit: 1 });
    expect(checkFeature('reading.readerProfiles', 'plus', on, 4).allowed).toBe(true);
    expect(checkFeature('reading.readerProfiles', 'plus', on, 5)).toMatchObject({ reason: 'limit', requiredTier: 'pro' });
    expect(checkFeature('reading.readerProfiles', 'pro', on, 999).allowed).toBe(true);
    expect(checkFeature('ai.cloud', 'free', on)).toMatchObject({ allowed: true, limit: 5 });
    expect(checkFeature('ai.cloud', 'legend', on).limit).toBe(Infinity);
  });

  it('matches the 1.1 plan matrix', () => {
    expect(TIER_LIMITS.aiDaily).toEqual({ free: 5, plus: 50, pro: 200, legend: Infinity });
    expect(TIER_LIMITS.offlineChapters.free).toBe(300);
    expect(TIER_LIMITS.readerProfiles).toEqual({ free: 1, plus: 5, pro: Infinity, legend: Infinity });
    expect(FEATURES['privacy.appLock'].tier).toBe('free');
    expect(FEATURES['privacy.hiddenShelf'].tier).toBe('plus');
    expect(FEATURES['motivation.monthlyWrap'].tier).toBe('free');
    expect(FEATURES['motivation.wrapShareCard'].tier).toBe('pro');
    expect(FEATURES['motivation.wrapArchive'].tier).toBe('legend');
    expect(FEATURES['export.templates'].tier).toBe('pro');
    expect(FEATURES['export.batch'].tier).toBe('legend');
  });

  it('every feature has bilingual text and a valid tier; free stays strong', () => {
    for (const key of FEATURE_KEYS) {
      const d = FEATURES[key];
      expect(TIERS).toContain(d.tier);
      expect(d.title.ar).toMatch(/[\u0600-\u06FF]/);
      expect(d.desc.ar).toMatch(/[\u0600-\u06FF]/);
      expect(d.title.en.length).toBeGreaterThan(2);
      expect(d.desc.en.length).toBeGreaterThan(5);
    }
    const nonPremium = FEATURE_KEYS.filter(k2 => FEATURES[k2].category !== 'premium');
    expect(nonPremium.length).toBeGreaterThanOrEqual(58);
    const free = nonPremium.filter(k2 => FEATURES[k2].tier === 'free');
    expect(free.length / nonPremium.length).toBeGreaterThan(0.55);
    expect(featuresByCategory().filter(c => c.items.length).length).toBe(9);
  });
});

describe('tools/membership/sign-config.mjs', () => {
  it('produces configs the app accepts', () => {
    const { execFileSync } = require('child_process');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { repoRoot } = require('./testKeys');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-')), 'c.json');
    fs.writeFileSync(file, JSON.stringify({ flags: { 'agents.all': false }, message: { ar: 'تجربة', en: 'Test' } }));
    const out = execFileSync('node', [path.join(repoRoot, 'tools/membership/sign-config.mjs'), file, '--key', k.pemPath], { encoding: 'utf8' });
    const flags = new SardFlags(memoryKv(), k.pubHex);
    expect(flags.apply(out).ok).toBe(true);
    expect(flags.isEnabled('agents.all')).toBe(false);
  });
});
