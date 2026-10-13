import { countWords, estimateChapter, htmlToText, learnWpm, remainingMinutes, defaultWpmFor } from '../logic/readingTime';
import { isWithinWindow, minutesToNextBoundary, parseHm } from '../logic/nightSchedule';
import { addProfile, bindProfile, emptyProfiles, profileForNovel, removeProfile } from '../logic/profiles';
import { contextSentence, isVocabCandidate, nextReview, normalizeWord, isDue } from '../logic/vocab';

describe('reading time', () => {
  it('counts Arabic words ignoring tashkeel and tags', () => {
    expect(countWords('وَقَفَ الفارِسُ عَلى التَّلِّ')).toBe(4);
    expect(countWords(htmlToText('<p>Hello <b>world</b></p><p>مرحبا</p>'))).toBe(3);
    expect(countWords('')).toBe(0);
  });
  it('estimates minutes with defaults and learned speed', () => {
    const html = '<p>' + 'كلمة '.repeat(900) + '</p>';
    expect(defaultWpmFor('كلمة')).toBe(180);
    const e = estimateChapter(html);
    expect(e).toEqual({ words: 900, wpm: 180, minutes: 5 });
    expect(estimateChapter(html, 300).minutes).toBe(3);
    expect(remainingMinutes(e, 0.5)).toBe(3);
    expect(remainingMinutes(e, 1)).toBe(0);
    expect(estimateChapter('').minutes).toBe(0);
  });
  it('learns WPM and ignores outliers', () => {
    expect(learnWpm(undefined, 100, 60_000)).toBeUndefined();
    const a = learnWpm(undefined, 2000, 10 * 60_000)!;
    expect(a).toEqual({ wpm: 200, samples: 1 });
    expect(learnWpm(a, 5000, 60_000)).toBe(a); // 5000 wpm = skimming
    const b = learnWpm(a, 3000, 10 * 60_000)!;
    expect(b.samples).toBe(2);
    expect(b.wpm).toBeGreaterThan(200);
    expect(b.wpm).toBeLessThan(300);
  });
});

describe('night schedule', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 13, h, m);
  it('handles windows crossing midnight', () => {
    expect(parseHm('21:30')).toBe(1290);
    expect(parseHm('25:00')).toBeNull();
    expect(isWithinWindow(at(22), '21:00', '06:00')).toBe(true);
    expect(isWithinWindow(at(3), '21:00', '06:00')).toBe(true);
    expect(isWithinWindow(at(12), '21:00', '06:00')).toBe(false);
    expect(isWithinWindow(at(13), '12:00', '14:00')).toBe(true);
    expect(isWithinWindow(at(14), '12:00', '14:00')).toBe(false);
    expect(isWithinWindow(at(14), '12:00', '12:00')).toBe(false);
    expect(minutesToNextBoundary(at(20, 50), '21:00', '06:00')).toBe(10);
  });
});

describe('reader profiles', () => {
  it('adds, binds, resolves and removes profiles keeping only known fields', () => {
    let s = emptyProfiles();
    const r = addProfile(s, { name: 'ليلي', reader: { theme: '#000', textSize: 20, junk: 1 }, sard: { tashkeel: 'hide', other: 2 } }, 1000);
    s = r.state;
    expect(r.profile.reader).toEqual({ theme: '#000', textSize: 20 });
    expect(r.profile.sard).toEqual({ tashkeel: 'hide' });
    s = bindProfile(s, 7, r.profile.id);
    expect(profileForNovel(s, 7)?.name).toBe('ليلي');
    expect(bindProfile(s, 8, 'nope').bindings['8']).toBeUndefined();
    s = removeProfile(s, r.profile.id);
    expect(profileForNovel(s, 7)).toBeUndefined();
    expect(s.bindings).toEqual({});
  });
});

describe('vocabulary', () => {
  it('normalises words and picks context', () => {
    expect(normalizeWord('  الفَارِسُ،')).toBe('الفارس');
    expect(normalizeWord('أَمير')).toBe('امير');
    expect(isVocabCandidate('كلمة')).toBe(true);
    expect(isVocabCandidate('هذه جملة طويلة جدا لا تصلح')).toBe(false);
    const full = 'بدأ اليوم. وقف الفارس على التل ونظر بعيدا. ثم رحل.';
    expect(contextSentence(full, 'الفارس')).toBe('وقف الفارس على التل ونظر بعيدا.');
  });
  it('schedules Leitner reviews', () => {
    const now = 0;
    expect(nextReview(1, true, now)).toEqual({ box: 2, dueAt: 2 * 86_400_000 });
    expect(nextReview(5, true, now).box).toBe(5);
    expect(nextReview(4, false, now)).toEqual({ box: 1, dueAt: 86_400_000 });
    expect(isDue({ dueAt: 10 }, 11)).toBe(true);
  });
});
