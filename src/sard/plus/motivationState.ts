/**
 * One snapshot of everything motivational: achievements (persisting newly
 * unlocked ones), XP/level, today's challenge (marking it done), streak with
 * freezes (Pro+), and personal challenges.
 */
import { showToast } from '@utils/showToast';
import { addDays, computeStreak, toDayKey } from '../reader/streaks';
import { canUse, currentLimit } from '../membership/service';
import { tr } from '../i18n';
import { getNovelDayRows, getReaderStats, getTodayCounters } from './data';
import { achievementsStore, challengesStore, freezeStore } from './store';
import {
  applyStreakFreezes,
  challengeProgress,
  customChallengeProgress,
  dailyChallengeFor,
  evaluateAchievements,
  levelFor,
  levelTitle,
  newlyUnlocked,
  xpFrom,
  type AchievementProgress,
  type CustomChallenge,
  type DailyChallenge,
  type ReaderStats,
} from './logic/motivation';

export interface MotivationSnapshot {
  stats: ReaderStats;
  achievements: AchievementProgress[];
  unlockedCount: number;
  xp: number;
  level: ReturnType<typeof levelFor> & { title: string };
  challenge: DailyChallenge;
  challengeRatio: number;
  challengeDone: boolean;
  streak: ReturnType<typeof computeStreak>;
  freezes: { available: number; cap: number; used: string[] };
  custom: { c: CustomChallenge; p: ReturnType<typeof customChallengeProgress> }[];
}

export const loadMotivation = async (opts: { toast?: boolean } = {}): Promise<MotivationSnapshot> => {
  const now = new Date();
  const today = toDayKey(now);
  const [stats, counters, rows] = await Promise.all([
    getReaderStats(),
    getTodayCounters(now),
    getNovelDayRows(addDays(today, -400)),
  ]);

  // Streak (with freezes for Pro / Legend).
  const cap = canUse('motivation.streakFreeze').allowed ? currentLimit('streakFreezes') : 0;
  let streakRows = stats.days;
  let freeze = freezeStore.get();
  if (cap > 0) {
    const applied = applyStreakFreezes(stats.days, stats.goalMinutes, freeze, cap, now);
    streakRows = applied.rows;
    freeze = applied.state;
    freezeStore.set(freeze);
  }
  const streak = computeStreak(streakRows, stats.goalMinutes, now);

  // Today's challenge.
  const challenge = dailyChallengeFor(today, stats.days, stats.goalMinutes);
  const ratio = challengeProgress(challenge, counters);
  let ch = challengesStore.get();
  if (ratio >= 1 && !ch.done[today]) {
    ch = challengesStore.update(c => ({ ...c, done: { ...c.done, [today]: Date.now() } }));
    if (opts.toast) showToast(tr({ ar: 'أنجزت تحدي اليوم! +٢٥ خبرة', en: 'Daily challenge done! +25 XP' }));
  }
  stats.challengesDone = Object.keys(ch.done).length;

  // Achievements.
  const achievements = evaluateAchievements(stats, now);
  const known = achievementsStore.get().unlocked;
  const fresh = newlyUnlocked(achievements, new Set(Object.keys(known)));
  if (fresh.length) {
    const stamp = Date.now();
    achievementsStore.update(a => ({ unlocked: { ...a.unlocked, ...Object.fromEntries(fresh.map(f => [f.id, stamp])) } }));
    if (opts.toast) showToast(tr({ ar: `إنجاز جديد: ${fresh[0].title.ar}`, en: `New achievement: ${fresh[0].title.en}` }));
  }
  const unlockedIds = Object.keys(achievementsStore.get().unlocked);
  const xp = xpFrom(stats, unlockedIds, stats.challengesDone);
  const lv = levelFor(xp);

  return {
    stats,
    achievements,
    unlockedCount: unlockedIds.length,
    xp,
    level: { ...lv, title: tr(levelTitle(lv.level)) },
    challenge,
    challengeRatio: ratio,
    challengeDone: !!ch.done[today],
    streak,
    freezes: { available: freeze.available, cap, used: freeze.used },
    custom: ch.custom.map(c => ({ c, p: customChallengeProgress(c, rows) })),
  };
};
