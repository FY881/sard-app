/**
 * Pure reading-goal / streak / yearly-wrap math. Days are local calendar days
 * written as `YYYY-MM-DD` keys; durations are milliseconds.
 */

export interface DayTotal {
  day: string; // YYYY-MM-DD (local)
  timeSpent: number; // ms
  chaptersRead?: number;
  novels?: number;
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** Local calendar-day key for a date. */
export const toDayKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Parses a `YYYY-MM-DD` key into a local Date at midnight. */
export const fromDayKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** Day key `offset` days away from `key` (DST-safe). */
export const addDays = (key: string, offset: number): string => {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + offset);
  return toDayKey(d);
};

/** Whole days from `a` to `b` (b - a). */
export const daysBetween = (a: string, b: string): number => {
  const da = fromDayKey(a);
  const db = fromDayKey(b);
  return Math.round(
    (Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) -
      Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) /
      86400000,
  );
};

/** Merges duplicate day rows (e.g. one row per novel) into one per day. */
export const mergeDays = (rows: DayTotal[]): Map<string, DayTotal> => {
  const map = new Map<string, DayTotal>();
  for (const r of rows) {
    if (!r?.day) continue;
    const cur = map.get(r.day);
    if (cur) {
      cur.timeSpent += r.timeSpent || 0;
      cur.chaptersRead = (cur.chaptersRead || 0) + (r.chaptersRead || 0);
      cur.novels = (cur.novels || 0) + (r.novels ?? 1);
    } else {
      map.set(r.day, {
        day: r.day,
        timeSpent: r.timeSpent || 0,
        chaptersRead: r.chaptersRead || 0,
        novels: r.novels ?? 1,
      });
    }
  }
  return map;
};

export interface StreakInfo {
  /** Consecutive qualifying days ending today (or yesterday if today is not met yet). */
  current: number;
  longest: number;
  /** Whether today already meets the goal. */
  todayMet: boolean;
  /** Streak is alive but today still needs reading to keep it. */
  atRisk: boolean;
  todayMs: number;
  goalMs: number;
  /** 0..1 progress towards today's goal. */
  todayProgress: number;
  longestStart?: string;
  longestEnd?: string;
  qualifyingDays: number;
}

/**
 * A day qualifies when its reading time reaches the daily goal. A goal of 0
 * means "any reading counts" (at least one minute).
 */
export const computeStreak = (
  rows: DayTotal[],
  goalMinutes: number,
  today: Date = new Date(),
): StreakInfo => {
  const goalMs = Math.max(1, goalMinutes) * 60000;
  const days = mergeDays(rows);
  const todayKey = toDayKey(today);
  const qualifies = (key: string) => (days.get(key)?.timeSpent ?? 0) >= goalMs;

  const todayMs = days.get(todayKey)?.timeSpent ?? 0;
  const todayMet = todayMs >= goalMs;

  let current = 0;
  let cursor = todayMet ? todayKey : addDays(todayKey, -1);
  while (qualifies(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const qualifying = [...days.keys()]
    .filter(k => k <= todayKey && qualifies(k))
    .sort();
  let longest = 0;
  let longestStart: string | undefined;
  let longestEnd: string | undefined;
  let run = 0;
  let runStart = '';
  let prev: string | null = null;
  for (const k of qualifying) {
    if (prev && daysBetween(prev, k) === 1) run++;
    else {
      run = 1;
      runStart = k;
    }
    if (run > longest) {
      longest = run;
      longestStart = runStart;
      longestEnd = k;
    }
    prev = k;
  }

  return {
    current,
    longest: Math.max(longest, current),
    todayMet,
    atRisk: !todayMet && current > 0,
    todayMs,
    goalMs,
    todayProgress: Math.min(1, todayMs / goalMs),
    longestStart,
    longestEnd,
    qualifyingDays: qualifying.length,
  };
};

export interface HeatCell {
  day: string;
  timeSpent: number;
  /** 0 (none) .. 4 (goal reached twice or more). */
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

/**
 * Builds a GitHub-style grid of `weeks` columns × 7 rows that ends with the
 * week containing `today`. `weekStartsOn` 6 = Saturday (common in Egypt/KSA).
 */
export const buildHeatmap = (
  rows: DayTotal[],
  goalMinutes: number,
  weeks = 15,
  today: Date = new Date(),
  weekStartsOn = 6,
): HeatCell[][] => {
  const days = mergeDays(rows);
  const goalMs = Math.max(1, goalMinutes) * 60000;
  const todayKey = toDayKey(today);
  const offset = (today.getDay() - weekStartsOn + 7) % 7;
  const firstKey = addDays(todayKey, -offset - (weeks - 1) * 7);
  const grid: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const key = addDays(firstKey, w * 7 + d);
      const ms = days.get(key)?.timeSpent ?? 0;
      const ratio = ms / goalMs;
      const level: HeatCell['level'] =
        ms <= 0 ? 0 : ratio < 0.5 ? 1 : ratio < 1 ? 2 : ratio < 2 ? 3 : 4;
      col.push({ day: key, timeSpent: ms, level, future: key > todayKey });
    }
    grid.push(col);
  }
  return grid;
};

export interface YearWrap {
  year: number;
  totalMs: number;
  activeDays: number;
  chaptersRead: number;
  longestStreak: number;
  bestDay?: { day: string; timeSpent: number };
  bestMonth?: { month: number; timeSpent: number }; // 0-based month
  monthly: number[]; // ms per month, 12 entries
  averagePerActiveDayMs: number;
  favoriteWeekday?: number; // 0 = Sunday
  goalDays: number;
}

export const computeYearWrap = (
  rows: DayTotal[],
  year: number,
  goalMinutes: number,
): YearWrap => {
  const goalMs = Math.max(1, goalMinutes) * 60000;
  const days = [...mergeDays(rows).values()].filter(
    d => d.day.startsWith(`${year}-`) && d.timeSpent > 0,
  );
  const monthly = new Array<number>(12).fill(0);
  const weekday = new Array<number>(7).fill(0);
  let totalMs = 0;
  let chaptersRead = 0;
  let bestDay: YearWrap['bestDay'];
  let goalDays = 0;
  for (const d of days) {
    totalMs += d.timeSpent;
    chaptersRead += d.chaptersRead || 0;
    const date = fromDayKey(d.day);
    monthly[date.getMonth()] += d.timeSpent;
    weekday[date.getDay()] += d.timeSpent;
    if (!bestDay || d.timeSpent > bestDay.timeSpent) {
      bestDay = { day: d.day, timeSpent: d.timeSpent };
    }
    if (d.timeSpent >= goalMs) goalDays++;
  }
  let bestMonth: YearWrap['bestMonth'];
  monthly.forEach((ms, month) => {
    if (ms > 0 && (!bestMonth || ms > bestMonth.timeSpent)) {
      bestMonth = { month, timeSpent: ms };
    }
  });
  let favoriteWeekday: number | undefined;
  weekday.forEach((ms, i) => {
    if (ms > 0 && (favoriteWeekday === undefined || ms > weekday[favoriteWeekday]))
      favoriteWeekday = i;
  });

  // Longest streak of active (any reading) days within the year.
  const sorted = days.map(d => d.day).sort();
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const k of sorted) {
    run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prev = k;
  }

  return {
    year,
    totalMs,
    activeDays: days.length,
    chaptersRead,
    longestStreak,
    bestDay,
    bestMonth,
    monthly,
    averagePerActiveDayMs: days.length ? totalMs / days.length : 0,
    favoriteWeekday,
    goalDays,
  };
};

/** Total ms for the 7 days ending today, and the 7 before that. */
export const weekOverWeek = (
  rows: DayTotal[],
  today: Date = new Date(),
): { thisWeek: number; lastWeek: number } => {
  const days = mergeDays(rows);
  const t = toDayKey(today);
  let thisWeek = 0;
  let lastWeek = 0;
  for (let i = 0; i < 14; i++) {
    const ms = days.get(addDays(t, -i))?.timeSpent ?? 0;
    if (i < 7) thisWeek += ms;
    else lastWeek += ms;
  }
  return { thisWeek, lastWeek };
};

/** "1 س 20 د" style compact Arabic duration. */
export const formatDurationAr = (ms: number): string => {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return 'أقل من دقيقة';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} د`;
  if (m === 0) return `${h} س`;
  return `${h} س ${m} د`;
};
