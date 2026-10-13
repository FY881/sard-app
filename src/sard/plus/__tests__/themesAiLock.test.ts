import crypto from 'crypto';
import { buildLookCss, ornamentizeHtml, SARD_THEMES, textureCss } from '../logic/themes';
import { characters, clozeQuiz, difficulty, keywords, searchText, splitSentences, summarize } from '../logic/textAnalysis';
import { hashPin, isValidPin, lockoutMs, shouldLockOnResume, verifyPin, DEFAULT_LOCK } from '../logic/lock';
import { decryptJson, encryptJson } from '../logic/crypto';
import { rng } from '../logic/library';

const rand = (n: number) => new Uint8Array(crypto.randomBytes(n));

describe('themes & look', () => {
  it('has 8 premium + 3 legend themes with valid colours', () => {
    expect(SARD_THEMES.filter(t => t.tier === 'plus')).toHaveLength(8);
    expect(SARD_THEMES.filter(t => t.tier === 'legend')).toHaveLength(3);
    for (const t of SARD_THEMES) expect(t.backgroundColor).toMatch(/^#[0-9A-F]{6}$/i);
  });
  it('turns scene breaks into ornaments only', () => {
    const html = '<p>نص</p><p>***</p><p>* * *</p><p>ـــــ</p><p>-----</p><p>a***b</p>';
    const out = ornamentizeHtml(html);
    expect(out.match(/sard-ornament/g)).toHaveLength(4);
    expect(out).toContain('<p>نص</p>');
    expect(out).toContain('<p>a***b</p>');
  });
  it('builds css for drop cap, texture, progress bar', () => {
    const css = buildLookCss({ ornaments: true, dropCap: true, progressBar: true, texture: 'linen' }, SARD_THEMES[8]);
    expect(css).toContain('first-letter');
    expect(css).toContain('#sard-progress');
    expect(css).toContain('linear-gradient');
    expect(textureCss('none')).toBe('');
  });
});

const AR = `وقف سليم على التل ينظر إلى المدينة. قال سليم لرفيقه إن الطريق طويل. ابتسم كريم وقال إن السفر ممتع.
سار سليم وكريم في الطريق الطويل نحو المدينة القديمة. كانت المدينة القديمة مليئة بالأسرار والحكايات.
في المساء وصل سليم إلى باب المدينة. همس كريم: هنا تبدأ الحكاية. نظر سليم إلى السماء وتذكر أمه.
قالت أمه يوما إن المدينة تحفظ أسرار من يدخلها. دخل سليم المدينة وقلبه يخفق.`;

describe('on-device text analysis', () => {
  it('splits, summarises in order and finds keywords', () => {
    expect(splitSentences(AR).length).toBeGreaterThan(6);
    const s = summarize(AR, 3);
    expect(s).toHaveLength(3);
    const idx = s.map(x => AR.replace(/\s+/g, ' ').indexOf(x));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    const k = keywords(AR, 5).map(x => x.word);
    expect(k.join(' ')).toMatch(/المدينة|سليم/);
  });
  it('detects recurring names', () => {
    const names = characters(AR).map(c => c.name);
    expect(names).toContain('سليم');
    expect(names).toContain('كريم');
    const en = characters('Harry looked at Ron. Ron smiled. "Harry," said Hermione. Hermione laughed at Harry.').map(c => c.name);
    expect(en).toEqual(expect.arrayContaining(['Harry', 'Hermione']));
  });
  it('rates difficulty and makes cloze questions', () => {
    const d = difficulty(AR);
    expect(d.words).toBeGreaterThan(50);
    expect(d.level).toBeGreaterThanOrEqual(1);
    expect(d.level).toBeLessThanOrEqual(5);
    const q = clozeQuiz(AR, 3, rng(7));
    expect(q.length).toBeGreaterThan(0);
    for (const x of q) {
      expect(x.options).toContain(x.answer);
      expect(x.prompt).toContain('_____');
      expect(new Set(x.options).size).toBe(x.options.length);
    }
  });
  it('searches diacritic-insensitively with snippets', () => {
    const hits = searchText([{ id: 1, name: 'ف١', text: 'وَقَفَ الفارِسُ على التل' }, { id: 2, name: 'ف٢', text: 'لا شيء' }], 'الفارس');
    expect(hits).toHaveLength(1);
    expect(hits[0].chapterId).toBe(1);
    expect(hits[0].snippet).toContain('الفارِسُ');
    expect(searchText([], 'a')).toEqual([]);
  });
});

describe('app lock', () => {
  it('hashes and verifies PINs', () => {
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('1234')).toBe(true);
    const salt = 'abcd';
    const h = hashPin('2468', salt);
    expect(verifyPin('2468', { pinHash: h, pinSalt: salt })).toBe(true);
    expect(verifyPin('2469', { pinHash: h, pinSalt: salt })).toBe(false);
    expect(verifyPin('2468', { pinHash: '', pinSalt: salt })).toBe(false);
  });
  it('relocks after timeout and backs off', () => {
    const s = { ...DEFAULT_LOCK, enabled: true, timeoutMs: 60_000 };
    expect(shouldLockOnResume(s, 0, 30_000)).toBe(false);
    expect(shouldLockOnResume(s, 0, 61_000)).toBe(true);
    expect(shouldLockOnResume(s, null, 1)).toBe(true);
    expect(shouldLockOnResume({ ...s, enabled: false }, null)).toBe(false);
    expect(lockoutMs(4)).toBe(0);
    expect(lockoutMs(5)).toBe(30_000);
    expect(lockoutMs(30)).toBe(15 * 60_000);
  });
});

describe('encrypted backup', () => {
  it('round-trips and rejects wrong passwords / weak passwords', () => {
    const data = { a: 1, text: 'نص عربي', list: [1, 2] };
    const env = encryptJson(data, 'كلمة-سر-قوية', rand, { N: 2 ** 10 });
    expect(env.data).not.toContain('نص');
    expect(decryptJson(env, 'كلمة-سر-قوية')).toEqual(data);
    expect(() => decryptJson(env, 'wrong-pass')).toThrow('wrong-password');
    expect(() => encryptJson(data, '123', rand)).toThrow('weak-password');
    expect(() => decryptJson({ ...env, v: 2 } as any, 'x')).toThrow('bad-format');
  });
});
