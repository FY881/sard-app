import {
  addDays,
  buildHeatmap,
  computeStreak,
  computeYearWrap,
  daysBetween,
  formatDurationAr,
  mergeDays,
  toDayKey,
  weekOverWeek,
  type DayTotal,
} from '../streaks';

const MIN = 60000;
const day = (key: string, minutes: number, chaptersRead = 0): DayTotal => ({
  day: key,
  timeSpent: minutes * MIN,
  chaptersRead,
});
const at = (key: string, hour = 12) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hour);
};

describe('day keys', () => {
  it('formats local days and moves across months/years', () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-10-01', '2026-10-11')).toBe(10);
  });

  it('merges per-novel rows of the same day', () => {
    const m = mergeDays([day('2026-10-10', 5, 1), day('2026-10-10', 7, 2), day('2026-10-09', 1)]);
    expect(m.get('2026-10-10')).toMatchObject({ timeSpent: 12 * MIN, chaptersRead: 3, novels: 2 });
    expect(m.size).toBe(2);
  });
});

describe('computeStreak', () => {
  const today = at('2026-10-11');

  it('counts consecutive goal days including today', () => {
    const s = computeStreak(
      [day('2026-10-09', 25), day('2026-10-10', 30), day('2026-10-11', 20)],
      20,
      today,
    );
    expect(s.current).toBe(3);
    expect(s.todayMet).toBe(true);
    expect(s.atRisk).toBe(false);
    expect(s.todayProgress).toBe(1);
  });

  it('keeps the streak alive (at risk) when today is not met yet', () => {
    const s = computeStreak([day('2026-10-09', 25), day('2026-10-10', 30), day('2026-10-11', 5)], 20, today);
    expect(s.current).toBe(2);
    expect(s.todayMet).toBe(false);
    expect(s.atRisk).toBe(true);
    expect(s.todayProgress).toBeCloseTo(0.25);
  });

  it('breaks on a missed day', () => {
    const s = computeStreak([day('2026-10-08', 30), day('2026-10-10', 30)], 20, today);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(1);
  });

  it('ignores days below goal for the streak', () => {
    const s = computeStreak([day('2026-10-09', 30), day('2026-10-10', 10)], 20, today);
    expect(s.current).toBe(0);
    expect(s.atRisk).toBe(false);
  });

  it('finds the longest historic run', () => {
    const rows = [
      day('2026-09-01', 30),
      day('2026-09-02', 30),
      day('2026-09-03', 30),
      day('2026-09-04', 30),
      day('2026-10-10', 30),
    ];
    const s = computeStreak(rows, 20, today);
    expect(s.longest).toBe(4);
    expect(s.longestStart).toBe('2026-09-01');
    expect(s.longestEnd).toBe('2026-09-04');
    expect(s.current).toBe(1);
  });

  it('treats a 0-minute goal as "any reading"', () => {
    const s = computeStreak([day('2026-10-11', 1)], 0, today);
    expect(s.todayMet).toBe(true);
    expect(computeStreak([{ day: '2026-10-11', timeSpent: 20000 }], 0, today).todayMet).toBe(false);
  });

  it('ignores future rows (clock changes)', () => {
    const s = computeStreak([day('2026-10-12', 30), day('2026-10-11', 30)], 20, today);
    expect(s.current).toBe(1);
    expect(s.qualifyingDays).toBe(1);
  });

  it('handles empty data', () => {
    const s = computeStreak([], 20, today);
    expect(s).toMatchObject({ current: 0, longest: 0, todayMet: false, atRisk: false, todayMs: 0 });
  });
});

describe('buildHeatmap', () => {
  it('builds weeks x 7 grid ending with this week, starting on Saturday', () => {
    const today = at('2026-10-11'); // Sunday
    const grid = buildHeatmap([day('2026-10-11', 45), day('2026-10-10', 5)], 20, 4, today, 6);
    expect(grid).toHaveLength(4);
    grid.forEach(col => expect(col).toHaveLength(7));
    const last = grid[3];
    expect(last[0].day).toBe('2026-10-10'); // Saturday
    expect(last[1].day).toBe('2026-10-11');
    expect(last[1].level).toBe(4); // >= 2x goal
    expect(last[0].level).toBe(1); // < half goal
    expect(last[2].future).toBe(true);
    expect(grid[0][0].day).toBe('2026-09-19');
  });
});

describe('computeYearWrap', () => {
  it('aggregates a year', () => {
    const rows = [
      day('2025-12-31', 100),
      day('2026-01-01', 30, 2),
      day('2026-01-02', 10, 1),
      day('2026-01-03', 60, 3),
      day('2026-03-15', 5),
    ];
    const w = computeYearWrap(rows, 2026, 20);
    expect(w.totalMs).toBe(105 * MIN);
    expect(w.activeDays).toBe(4);
    expect(w.chaptersRead).toBe(6);
    expect(w.longestStreak).toBe(3);
    expect(w.bestDay).toEqual({ day: '2026-01-03', timeSpent: 60 * MIN });
    expect(w.bestMonth?.month).toBe(0);
    expect(w.monthly[2]).toBe(5 * MIN);
    expect(w.goalDays).toBe(2);
    expect(w.averagePerActiveDayMs).toBe((105 / 4) * MIN);
  });

  it('is empty for a year with no reading', () => {
    const w = computeYearWrap([day('2026-01-01', 30)], 2024, 20);
    expect(w.activeDays).toBe(0);
    expect(w.bestDay).toBeUndefined();
    expect(w.favoriteWeekday).toBeUndefined();
  });
});

describe('weekOverWeek / formatting', () => {
  it('sums the last 7 and previous 7 days', () => {
    const today = at('2026-10-11');
    const r = weekOverWeek(
      [day('2026-10-11', 10), day('2026-10-05', 20), day('2026-10-04', 7), day('2026-09-28', 3), day('2026-09-27', 99)],
      today,
    );
    expect(r.thisWeek).toBe(30 * MIN);
    expect(r.lastWeek).toBe(10 * MIN);
  });

  it('formats Arabic durations', () => {
    expect(formatDurationAr(20000)).toBe('أقل من دقيقة');
    expect(formatDurationAr(45 * MIN)).toBe('45 د');
    expect(formatDurationAr(120 * MIN)).toBe('2 س');
    expect(formatDurationAr(135 * MIN)).toBe('2 س 15 د');
  });
});
