import fs from 'fs';
import path from 'path';
import {
  annotateRepoPlugins, categoriesOf, checkIntegrity, compareVersions, filterByCategory, isCompatible,
  manifestUrlFor, parseRepoManifest, parseSardMeta,
} from '../sardMeta';
import { summarizeRepository } from '@screens/settings/SettingsRepositoryScreen/utils/repoUrl';

// Real «مستودع سَرد» output (test fixture only — nothing here ships in the app).
const fx = (f: string) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
const plugins = JSON.parse(fx('plugins.min.json'));
const manifest = JSON.parse(fx('sard-repo.json'));
const URL = 'https://raw.githubusercontent.com/FY881/sard-plugins/main/.dist/plugins.min.json';

describe('Sard repo extensions (real repo fixture)', () => {
  it('parses every entry sard object', () => {
    const ann = annotateRepoPlugins(plugins, URL);
    expect(ann).toHaveLength(plugins.length);
    for (const p of ann) {
      expect(p.repoUrl).toBe(URL);
      expect(p.sard?.category).toBeTruthy();
      expect(p.sard?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(['ok', 'degraded', 'down', 'unknown']).toContain(p.sard?.health?.status);
      expect(p.sard?.tags.length).toBeGreaterThan(0);
      expect(p.sard?.description_ar).toMatch(/[\u0600-\u06FF]/);
      expect(isCompatible(p.sard)).toBe(true);
    }
    const cats = categoriesOf(ann);
    expect(cats.length).toBeGreaterThan(0);
    expect(filterByCategory(ann, cats[0]).every(p => p.sard?.category === cats[0])).toBe(true);
    expect(filterByCategory(ann, null)).toHaveLength(ann.length);
  });

  it('verifies sha256 of the real plugin file and blocks a modified one', () => {
    const entry = plugins.find((p: any) => p.url.endsWith('/arWikisource.js'));
    const meta = parseSardMeta(entry.sard);
    const code = fx('arWikisource.js');
    expect(checkIntegrity(code, meta)).toEqual({ ok: true, checked: true });
    expect(checkIntegrity(code + '\n//x', meta).ok).toBe(false);
  });

  it('reads sard-repo.json next to plugins.min.json', () => {
    expect(manifestUrlFor(URL)).toBe('https://raw.githubusercontent.com/FY881/sard-plugins/main/.dist/sard-repo.json');
    const m = parseRepoManifest(manifest)!;
    expect(m.name).toBe('مستودع سَرد');
    expect(m.description_ar).toBeTruthy();
    expect(parseRepoManifest([])).toBeUndefined();
  });

  it('counts "\\u200eالعربية" plugins as Arabic', () => {
    const s = summarizeRepository(plugins);
    expect(s.arabicCount).toBe(plugins.filter((p: any) => p.lang.includes('العربية')).length);
    expect(s.arabicCount).toBeGreaterThan(0);
    expect(s.languages.find(l => l.lang === 'العربية')).toBeTruthy();
  });
});

describe('stock LNReader repos stay unchanged', () => {
  const stock = [{ id: 'x.y', name: 'Y', site: 'https://e.org', lang: 'English', version: '1.0.0', url: 'https://e.org/y.js', iconUrl: '' }];
  it('no sard object → same entry, no integrity check, always compatible', () => {
    const ann = annotateRepoPlugins(stock as any[], 'https://e.org/plugins.min.json');
    expect(ann[0]).toBe(stock[0]);
    expect(checkIntegrity('code', undefined)).toEqual({ ok: true, checked: false });
    expect(isCompatible(undefined)).toBe(true);
    expect(categoriesOf(ann)).toEqual([]);
  });
  it('ignores malformed sard data safely', () => {
    expect(parseSardMeta('x')).toBeUndefined();
    const m = parseSardMeta({ sha256: 'zz', tags: [1, 'a'], health: { status: 'weird' }, licenseUrl: 'javascript:alert(1)' })!;
    expect(m.sha256).toBeUndefined();
    expect(m.tags).toEqual(['a']);
    expect(m.health?.status).toBe('unknown');
    expect(m.licenseUrl).toBeUndefined();
    expect(annotateRepoPlugins([{ id: 'a', sard: 5 }] as any[], 'u')[0]).toEqual({ id: 'a' });
  });
  it('respects minAppVersion', () => {
    expect(compareVersions('2.1.4', '2.1.4')).toBe(0);
    expect(compareVersions('2.10.0', '2.9')).toBe(1);
    expect(isCompatible({ tags: [], minAppVersion: '9.0.0' })).toBe(false);
    expect(isCompatible({ tags: [], minAppVersion: '2.0' })).toBe(true);
  });
});
