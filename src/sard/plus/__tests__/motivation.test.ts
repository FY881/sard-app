import {
  ACHIEVEMENTS, applyStreakFreezes, challengeProgress, computeMonthWrap, customChallengeProgress, dailyChallengeFor,
  emptyFreeze, evaluateAchievements, levelFor, monthsWithReading, newlyUnlocked, xpFrom, type ReaderStats,
} from '../logic/motivation';
import { addDays, toDayKey } from '../../reader/streaks';

const min = 60000;
const today = new Date(2026, 9, 13, 12);
const tk = toDayKey(today);
const base: ReaderStats = {
  days: [], goalMinutes: 20, libraryCount: 0, finishedNovels: 0, highlights: 0, notes: 0, bookmarks: 0,
  vocab: 0, vocabMastered: 0, tags: 0, ratedNovels: 0, exports: 0, readerModePages: 0, novelsRead: 0,
  challengesDone: 0, bestTierRank: 0,
};

describe('achievements & xp', () => {
  it('has 30+ unique achievements', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
  it('unlocks from stats', () => {
    const days = Array.from({ length: 7 }, (_, i) => ({ day: addDays(tk, -i), timeSpent: 30 * min, chaptersRead: 3 }));
    const s = { ...base, days, highlights: 1, libraryCount: 12, bestTierRank: 2 };
    const p = evaluateAchievements(s, today);
    const ids = p.filter(x => x.unlocked).map(x => x.def.id);
    expect(ids).toEqual(expect.arrayContaining(['first_chapter', 'streak_7', 'minutes_60', 'highlight_1', 'library_10', 'member']));
    expect(ids).not.toContain('streak_30');
    expect(newlyUnlocked(p, new Set(['first_chapter'])).map(d => d.id)).not.toContain('first_chapter');
    const xp = xpFrom(s, ids, 0);
    expect(xp).toBeGreaterThan(210 + 21 * 5);
  });
  it('levels grow quadratically', () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(100).level).toBe(2);
    expect(levelFor(299).level).toBe(2);
    expect(levelFor(300)).toMatchObject({ level: 3, into: 0, span: 300 });
  });
});

describe('daily challenge', () => {
  it('is stable per day and scaled', () => {
    const a = dailyChallengeFor(tk, [], 20);
    expect(dailyChallengeFor(tk, [], 20)).toEqual(a);
    const kinds = new Set(Array.from({ length: 30 }, (_, i) => dailyChallengeFor(addDays(tk, i), [], 20).kind));
    expect(kinds.size).toBeGreaterThan(3);
    const c = { day: tk, kind: 'minutes' as const, target: 20, title: { ar: '', en: '' } };
    expect(challengeProgress(c, { minutes: 10, chapters: 0, highlights: 0, vocab: 0, bookmarks: 0, newNovels: 0 })).toBe(0.5);
  });
});

describe('month wrap + archive', () => {
  it('computes totals, best day, run and previous month delta', () => {
    const rows = [
      { day: '2026-09-30', timeSpent: 10 * min, chaptersRead: 1, novelId: 1 },
      { day: '2026-10-01', timeSpent: 30 * min, chaptersRead: 2, novelId: 1 },
      { day: '2026-10-02', timeSpent: 50 * min, chaptersRead: 4, novelId: 2 },
      { day: '2026-10-05', timeSpent: 5 * min, chaptersRead: 0, novelId: 1 },
    ];
    const w = computeMonthWrap(rows, 2026, 9);
    expect(w.totalMs).toBe(85 * min);
    expect(w.chapters).toBe(6);
    expect(w.activeDays).toBe(3);
    expect(w.longestRun).toBe(2);
    expect(w.bestDay).toEqual({ day: '2026-10-02', ms: 50 * min });
    expect(w.vsPreviousMs).toBe(75 * min);
    expect(w.topNovelIds[0]).toEqual({ novelId: 2, ms: 50 * min });
    expect(w.daysInMonth).toBe(31);
    expect(monthsWithReading(rows)).toEqual([{ year: 2026, month: 9 }, { year: 2026, month: 8 }]);
  });
});

describe('streak freeze', () => {
  it('covers a single missed day and earns freezes every 7 days', () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => ({ day: addDays(tk, -2 - i), timeSpent: 25 * min })),
      { day: tk, timeSpent: 25 * min },
    ];
    const r = applyStreakFreezes(rows, 20, { ...emptyFreeze(), available: 1 }, 2, today);
    expect(r.state.used).toContain(addDays(tk, -1));
    expect(r.state.available).toBeGreaterThanOrEqual(1); // used one, then earned one at 7
    const none = applyStreakFreezes(rows, 20, emptyFreeze(), 0, today);
    expect(none.state.used).toEqual([]);
  });
});

describe('custom challenges', () => {
  it('measures chapters/minutes/novels within dates', () => {
    const rows = [
      { day: '2026-10-01', timeSpent: 30 * min, chaptersRead: 3, novelId: 1 },
      { day: '2026-10-02', timeSpent: 10 * min, chaptersRead: 1, novelId: 2 },
      { day: '2026-11-02', timeSpent: 10 * min, chaptersRead: 9, novelId: 3 },
    ];
    const c = { id: 'c', title: 't', kind: 'chapters' as const, target: 4, startDay: '2026-10-01', endDay: '2026-10-31', createdAt: 0 };
    expect(customChallengeProgress(c, rows)).toMatchObject({ value: 4, done: true });
    expect(customChallengeProgress({ ...c, kind: 'minutes', target: 60 }, rows)).toMatchObject({ value: 40, done: false });
    expect(customChallengeProgress({ ...c, kind: 'novels', target: 2 }, rows).value).toBe(2);
  });
});
