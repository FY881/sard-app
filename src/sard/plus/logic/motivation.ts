/**
 * Achievements, XP/levels, daily challenge, monthly wrap, streak freezes and
 * personal challenges. Pure: fed with day totals from SardReadingDay plus
 * counters from the other Sard tables.
 */
import {
  addDays,
  computeStreak,
  fromDayKey,
  mergeDays,
  toDayKey,
  type DayTotal,
} from '../../reader/streaks';
import type { L10n } from '../../membership/tiers';

export interface ReaderStats {
  days: DayTotal[];
  goalMinutes: number;
  libraryCount: number;
  finishedNovels: number;
  highlights: number;
  notes: number;
  bookmarks: number;
  vocab: number;
  vocabMastered: number;
  tags: number;
  ratedNovels: number;
  exports: number;
  readerModePages: number;
  nightMinutes?: number;
  /** distinct novels read */
  novelsRead: number;
  challengesDone: number;
  bestTierRank: number;
}

export const totalMs = (days: DayTotal[]) => days.reduce((a, d) => a + (d.timeSpent || 0), 0);
export const totalChapters = (days: DayTotal[]) => days.reduce((a, d) => a + (d.chaptersRead || 0), 0);

export interface AchievementDef {
  id: string;
  icon: string;
  title: L10n;
  desc: L10n;
  xp: number;
  /** progress value and target */
  measure: (s: ReaderStats, derived: Derived) => [number, number];
}

export interface Derived {
  minutes: number;
  chapters: number;
  longestStreak: number;
  activeDays: number;
  bestDayMinutes: number;
  weekendDays: number;
}

export const derive = (s: ReaderStats, today = new Date()): Derived => {
  const merged = [...mergeDays(s.days).values()].filter(d => d.timeSpent > 0 || (d.chaptersRead ?? 0) > 0);
  const streak = computeStreak(s.days, 0, today);
  return {
    minutes: Math.floor(totalMs(merged) / 60000),
    chapters: totalChapters(merged),
    longestStreak: streak.longest,
    activeDays: merged.length,
    bestDayMinutes: Math.floor(Math.max(0, ...merged.map(d => d.timeSpent)) / 60000),
    weekendDays: merged.filter(d => [5, 6].includes(fromDayKey(d.day).getDay())).length,
  };
};

const A = (
  id: string,
  icon: string,
  ar: [string, string],
  en: [string, string],
  xp: number,
  measure: AchievementDef['measure'],
): AchievementDef => ({ id, icon, title: { ar: ar[0], en: en[0] }, desc: { ar: ar[1], en: en[1] }, xp, measure });

export const ACHIEVEMENTS: AchievementDef[] = [
  A('first_chapter', 'book-check-outline', ['البداية', 'أنهِ أول فصل'], ['First steps', 'Finish your first chapter'], 20, (_, d) => [d.chapters, 1]),
  A('chapters_50', 'book-multiple-outline', ['قارئ نشيط', 'أنهِ ٥٠ فصلًا'], ['Active reader', 'Finish 50 chapters'], 60, (_, d) => [d.chapters, 50]),
  A('chapters_250', 'bookshelf', ['نهم القراءة', 'أنهِ ٢٥٠ فصلًا'], ['Bookworm', 'Finish 250 chapters'], 150, (_, d) => [d.chapters, 250]),
  A('chapters_1000', 'library', ['ألف فصل وفصل', 'أنهِ ١٠٠٠ فصل'], ['A thousand and one', 'Finish 1000 chapters'], 400, (_, d) => [d.chapters, 1000]),
  A('chapters_5000', 'castle', ['حارس المكتبة', 'أنهِ ٥٠٠٠ فصل'], ['Library keeper', 'Finish 5000 chapters'], 1000, (_, d) => [d.chapters, 5000]),
  A('minutes_60', 'clock-outline', ['ساعة أولى', 'اقرأ ساعة كاملة'], ['First hour', 'Read for one hour'], 30, (_, d) => [d.minutes, 60]),
  A('minutes_600', 'clock-check-outline', ['عشر ساعات', 'اقرأ ١٠ ساعات'], ['Ten hours', 'Read for 10 hours'], 100, (_, d) => [d.minutes, 600]),
  A('minutes_3000', 'clock-star-four-points-outline', ['خمسون ساعة', 'اقرأ ٥٠ ساعة'], ['Fifty hours', 'Read for 50 hours'], 250, (_, d) => [d.minutes, 3000]),
  A('minutes_12000', 'timer-sand-complete', ['مئتا ساعة', 'اقرأ ٢٠٠ ساعة'], ['Two hundred hours', 'Read for 200 hours'], 700, (_, d) => [d.minutes, 12000]),
  A('marathon', 'run-fast', ['ماراثون', 'اقرأ ٣ ساعات في يوم واحد'], ['Marathon', 'Read 3 hours in one day'], 120, (_, d) => [d.bestDayMinutes, 180]),
  A('streak_3', 'fire', ['شرارة', 'سلسلة ٣ أيام'], ['Spark', '3-day streak'], 30, (_, d) => [d.longestStreak, 3]),
  A('streak_7', 'fire', ['أسبوع متواصل', 'سلسلة ٧ أيام'], ['Week on fire', '7-day streak'], 70, (_, d) => [d.longestStreak, 7]),
  A('streak_30', 'fire-circle', ['شهر بلا انقطاع', 'سلسلة ٣٠ يومًا'], ['Unbroken month', '30-day streak'], 300, (_, d) => [d.longestStreak, 30]),
  A('streak_100', 'campfire', ['مئة يوم', 'سلسلة ١٠٠ يوم'], ['Hundred days', '100-day streak'], 900, (_, d) => [d.longestStreak, 100]),
  A('active_days_60', 'calendar-check-outline', ['عادة راسخة', 'اقرأ في ٦٠ يومًا مختلفًا'], ['Solid habit', 'Read on 60 different days'], 200, (_, d) => [d.activeDays, 60]),
  A('weekend_10', 'beach', ['قارئ العطلات', 'اقرأ في ١٠ أيام عطلة (جمعة/سبت)'], ['Weekend reader', 'Read on 10 weekend days'], 60, (_, d) => [d.weekendDays, 10]),
  A('library_10', 'bookshelf', ['رفّ صغير', 'أضف ١٠ روايات للمكتبة'], ['Small shelf', 'Add 10 novels to your library'], 40, s => [s.libraryCount, 10]),
  A('library_50', 'warehouse', ['مكتبة كبيرة', 'أضف ٥٠ رواية'], ['Big library', 'Add 50 novels'], 120, s => [s.libraryCount, 50]),
  A('finish_1', 'flag-checkered', ['الصفحة الأخيرة', 'أنهِ رواية كاملة'], ['The last page', 'Finish a whole novel'], 100, s => [s.finishedNovels, 1]),
  A('finish_10', 'trophy-outline', ['عشر خواتيم', 'أنهِ ١٠ روايات'], ['Ten endings', 'Finish 10 novels'], 400, s => [s.finishedNovels, 10]),
  A('explorer_5', 'compass-outline', ['مستكشف', 'اقرأ من ٥ روايات مختلفة'], ['Explorer', 'Read 5 different novels'], 50, s => [s.novelsRead, 5]),
  A('highlight_1', 'marker', ['أول تظليل', 'ظلّل مقطعًا'], ['First highlight', 'Highlight a passage'], 15, s => [s.highlights, 1]),
  A('highlight_100', 'format-color-highlight', ['صائد الاقتباسات', '١٠٠ تظليل'], ['Quote hunter', '100 highlights'], 150, s => [s.highlights, 100]),
  A('notes_20', 'note-text-outline', ['المُعلِّق', '٢٠ ملاحظة على التظليلات'], ['Annotator', '20 notes on highlights'], 80, s => [s.notes, 20]),
  A('bookmark_10', 'bookmark-multiple-outline', ['علامات الطريق', '١٠ علامات بملاحظات'], ['Signposts', '10 bookmarks'], 40, s => [s.bookmarks, 10]),
  A('vocab_25', 'alphabetical-variant', ['جامع الكلمات', '٢٥ مفردة في الدفتر'], ['Word collector', '25 words saved'], 60, s => [s.vocab, 25]),
  A('vocab_master_20', 'school-outline', ['متقن المفردات', 'أتقن ٢٠ مفردة في المراجعة'], ['Word master', 'Master 20 words in review'], 150, s => [s.vocabMastered, 20]),
  A('organizer', 'tag-multiple-outline', ['المنظّم', 'أنشئ ٥ وسوم'], ['Organiser', 'Create 5 tags'], 40, s => [s.tags, 5]),
  A('critic', 'star-outline', ['الناقد', 'قيّم ١٠ روايات'], ['Critic', 'Rate 10 novels'], 50, s => [s.ratedNovels, 10]),
  A('exporter', 'file-export-outline', ['صانع الكتب', 'صدّر رواية أو فصلًا'], ['Bookmaker', 'Export a novel or chapter'], 40, s => [s.exports, 1]),
  A('web_reader', 'web', ['قارئ الويب', 'افتح ٥ صفحات بوضع القراءة'], ['Web reader', 'Open 5 pages in reader mode'], 40, s => [s.readerModePages, 5]),
  A('challenger', 'flag-variant-outline', ['المتحدّي', 'أنجز ١٠ تحديات يومية'], ['Challenger', 'Complete 10 daily challenges'], 120, s => [s.challengesDone, 10]),
  A('member', 'crown-outline', ['عضو سَرد', 'فعّل أي عضوية'], ['Sard member', 'Activate any membership'], 50, s => [s.bestTierRank, 1]),
];

export interface AchievementProgress {
  def: AchievementDef;
  value: number;
  target: number;
  unlocked: boolean;
  ratio: number;
}

export const evaluateAchievements = (s: ReaderStats, today = new Date()): AchievementProgress[] => {
  const d = derive(s, today);
  return ACHIEVEMENTS.map(def => {
    const [value, target] = def.measure(s, d);
    return { def, value, target, unlocked: value >= target, ratio: Math.min(1, target ? value / target : 1) };
  });
};

/** Achievements that just became unlocked compared with the saved set. */
export const newlyUnlocked = (progress: AchievementProgress[], known: ReadonlySet<string>) =>
  progress.filter(p => p.unlocked && !known.has(p.def.id)).map(p => p.def);

/* ------------------------------------------------------------- XP / level */
export const xpFrom = (s: ReaderStats, unlockedIds: Iterable<string>, challengesDone: number): number => {
  const d = derive(s);
  let xp = d.minutes + d.chapters * 5 + s.highlights * 2 + s.vocab + challengesDone * 25;
  const set = new Set(unlockedIds);
  for (const a of ACHIEVEMENTS) if (set.has(a.id)) xp += a.xp;
  return xp;
};

/** Level n needs 100·n·(n+1)/2 XP in total (100, 300, 600, …). */
export const levelFor = (xp: number) => {
  let level = 1;
  while (100 * (level * (level + 1)) / 2 <= xp) level++;
  const prevNeed = (100 * ((level - 1) * level)) / 2;
  const nextNeed = (100 * (level * (level + 1))) / 2;
  return { level, xp, into: xp - prevNeed, span: nextNeed - prevNeed, toNext: nextNeed - xp };
};

export const LEVEL_TITLES: L10n[] = [
  { ar: 'قارئ ناشئ', en: 'Novice' },
  { ar: 'قارئ', en: 'Reader' },
  { ar: 'قارئ نهم', en: 'Avid reader' },
  { ar: 'راوٍ', en: 'Storyteller' },
  { ar: 'حكيم الروايات', en: 'Lore sage' },
  { ar: 'سيد السرد', en: 'Master of tales' },
];
export const levelTitle = (level: number) => LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 3))];

/* -------------------------------------------------------- daily challenge */
export type ChallengeKind = 'minutes' | 'chapters' | 'highlight' | 'vocab' | 'bookmark' | 'newNovel';

export interface DailyChallenge {
  day: string;
  kind: ChallengeKind;
  target: number;
  title: L10n;
}

const hash = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};

/** Same challenge all day; scaled to the reader's recent average. */
export const dailyChallengeFor = (day: string, recentDays: DayTotal[], goalMinutes: number): DailyChallenge => {
  const merged = mergeDays(recentDays);
  let mins = 0;
  let chs = 0;
  let n = 0;
  for (let i = 1; i <= 14; i++) {
    const d = merged.get(addDays(day, -i));
    if (d && d.timeSpent > 0) {
      mins += d.timeSpent / 60000;
      chs += d.chaptersRead ?? 0;
      n++;
    }
  }
  const avgMin = n ? mins / n : goalMinutes || 15;
  const avgCh = n ? chs / n : 2;
  const kinds: ChallengeKind[] = ['minutes', 'chapters', 'minutes', 'highlight', 'chapters', 'vocab', 'bookmark'];
  const kind = kinds[hash(day) % kinds.length];
  switch (kind) {
    case 'minutes': {
      const target = Math.max(10, Math.round((avgMin * 1.2) / 5) * 5);
      return { day, kind, target, title: { ar: `اقرأ ${target} دقيقة اليوم`, en: `Read ${target} minutes today` } };
    }
    case 'chapters': {
      const target = Math.max(2, Math.round(avgCh * 1.25));
      return { day, kind, target, title: { ar: `أنهِ ${target} فصول اليوم`, en: `Finish ${target} chapters today` } };
    }
    case 'highlight':
      return { day, kind, target: 2, title: { ar: 'ظلّل مقطعين يعجبانك', en: 'Highlight two passages you like' } };
    case 'vocab':
      return { day, kind, target: 3, title: { ar: 'أضف ٣ مفردات لدفترك', en: 'Add 3 words to your notebook' } };
    case 'bookmark':
      return { day, kind, target: 1, title: { ar: 'ضع علامة بملاحظة في فصل', en: 'Leave a bookmark with a note' } };
    default:
      return { day, kind: 'newNovel', target: 1, title: { ar: 'ابدأ رواية جديدة', en: 'Start a new novel' } };
  }
};

export interface TodayCounters {
  minutes: number;
  chapters: number;
  highlights: number;
  vocab: number;
  bookmarks: number;
  newNovels: number;
}

export const challengeProgress = (c: DailyChallenge, t: TodayCounters): number => {
  const v = {
    minutes: t.minutes,
    chapters: t.chapters,
    highlight: t.highlights,
    vocab: t.vocab,
    bookmark: t.bookmarks,
    newNovel: t.newNovels,
  }[c.kind];
  return Math.min(1, v / c.target);
};

/* ------------------------------------------------------------ month wrap */
export interface MonthWrap {
  year: number;
  /** 0-based */
  month: number;
  totalMs: number;
  chapters: number;
  activeDays: number;
  daysInMonth: number;
  bestDay?: { day: string; ms: number };
  longestRun: number;
  perDay: number[];
  vsPreviousMs: number;
  topNovelIds: { novelId: number; ms: number }[];
}

export const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`;

export const computeMonthWrap = (
  rows: (DayTotal & { novelId?: number })[],
  year: number,
  month: number,
): MonthWrap => {
  const prefix = monthKey(year, month) + '-';
  const prev = month === 0 ? monthKey(year - 1, 11) : monthKey(year, month - 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const perDay = new Array<number>(daysInMonth).fill(0);
  const perNovel = new Map<number, number>();
  let chapters = 0;
  let prevMs = 0;
  for (const r of rows) {
    if (r.day.startsWith(prev + '-')) prevMs += r.timeSpent || 0;
    if (!r.day.startsWith(prefix)) continue;
    const dom = Number(r.day.slice(8, 10));
    perDay[dom - 1] += r.timeSpent || 0;
    chapters += r.chaptersRead || 0;
    if (r.novelId !== undefined) perNovel.set(r.novelId, (perNovel.get(r.novelId) ?? 0) + (r.timeSpent || 0));
  }
  let best: MonthWrap['bestDay'];
  let run = 0;
  let longestRun = 0;
  perDay.forEach((ms, i) => {
    if (ms > 0 && (!best || ms > best.ms)) best = { day: `${prefix}${String(i + 1).padStart(2, '0')}`, ms };
    run = ms > 0 ? run + 1 : 0;
    longestRun = Math.max(longestRun, run);
  });
  const totalMsVal = perDay.reduce((a, b) => a + b, 0);
  return {
    year,
    month,
    totalMs: totalMsVal,
    chapters,
    activeDays: perDay.filter(x => x > 0).length,
    daysInMonth,
    bestDay: best,
    longestRun,
    perDay,
    vsPreviousMs: totalMsVal - prevMs,
    topNovelIds: [...perNovel.entries()]
      .filter(([, ms]) => ms > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([novelId, ms]) => ({ novelId, ms })),
  };
};

/** Months (newest first) that have any reading — for the Legend archive. */
export const monthsWithReading = (rows: DayTotal[]): { year: number; month: number }[] => {
  const set = new Set<string>();
  for (const r of rows) if ((r.timeSpent || 0) > 0 || (r.chaptersRead || 0) > 0) set.add(r.day.slice(0, 7));
  return [...set]
    .sort()
    .reverse()
    .map(k => ({ year: Number(k.slice(0, 4)), month: Number(k.slice(5, 7)) - 1 }));
};

/* ---------------------------------------------------------- streak freeze */
export interface FreezeState {
  /** banked freezes */
  available: number;
  /** day keys protected by a freeze */
  used: string[];
  /** streak length at which the last freeze was earned */
  earnedAtStreak: number;
}

export const emptyFreeze = (): FreezeState => ({ available: 0, used: [], earnedAtStreak: 0 });

/**
 * Applies freezes: a single missed day between two reading days (or yesterday,
 * keeping today's streak alive) is covered when a freeze is banked. Earns one
 * freeze per 7 streak days up to `cap`. Returns rows with frozen days filled
 * in (counted as meeting the goal) and the new state.
 */
export const applyStreakFreezes = (
  rows: DayTotal[],
  goalMinutes: number,
  state: FreezeState,
  cap: number,
  today = new Date(),
): { rows: DayTotal[]; state: FreezeState } => {
  const goalMs = Math.max(1, goalMinutes) * 60000;
  const merged = mergeDays(rows);
  const used = new Set(state.used);
  let available = Math.min(state.available, cap);
  const todayKey = toDayKey(today);
  const meets = (k: string) => used.has(k) || (merged.get(k)?.timeSpent ?? 0) >= goalMs;
  // Cover yesterday if it was missed but the day before qualified.
  const y = addDays(todayKey, -1);
  if (cap > 0 && available > 0 && !meets(y) && meets(addDays(todayKey, -2))) {
    used.add(y);
    available--;
  }
  const withFrozen = [...rows, ...[...used].filter(k => !merged.has(k) || (merged.get(k)!.timeSpent < goalMs)).map(day => ({ day, timeSpent: goalMs, chaptersRead: 0, novels: 0 }))];
  const streak = computeStreak(withFrozen, goalMinutes, today);
  let earnedAtStreak = state.earnedAtStreak > streak.current ? 0 : state.earnedAtStreak;
  while (cap > 0 && streak.current - earnedAtStreak >= 7 && available < cap) {
    available++;
    earnedAtStreak += 7;
  }
  return { rows: withFrozen, state: { available, used: [...used].sort(), earnedAtStreak } };
};

/* ----------------------------------------------------- personal challenges */
export type CustomGoalKind = 'chapters' | 'minutes' | 'novels';

export interface CustomChallenge {
  id: string;
  title: string;
  kind: CustomGoalKind;
  target: number;
  startDay: string;
  endDay: string;
  createdAt: number;
}

export const customChallengeProgress = (
  c: CustomChallenge,
  rows: (DayTotal & { novelId?: number })[],
): { value: number; ratio: number; done: boolean; expired: boolean; daysLeft: number } => {
  let value = 0;
  const novels = new Set<number>();
  for (const r of rows) {
    if (r.day < c.startDay || r.day > c.endDay) continue;
    if (c.kind === 'chapters') value += r.chaptersRead || 0;
    else if (c.kind === 'minutes') value += (r.timeSpent || 0) / 60000;
    else if (r.novelId !== undefined && ((r.timeSpent || 0) > 0 || (r.chaptersRead || 0) > 0)) novels.add(r.novelId);
  }
  if (c.kind === 'novels') value = novels.size;
  value = Math.floor(value);
  const today = toDayKey(new Date());
  return {
    value,
    ratio: Math.min(1, value / Math.max(1, c.target)),
    done: value >= c.target,
    expired: today > c.endDay,
    daysLeft: Math.max(0, Math.round((fromDayKey(c.endDay).getTime() - fromDayKey(today).getTime()) / 86_400_000)),
  };
};
