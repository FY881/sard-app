/** Night schedule: "HH:MM" windows that may cross midnight. */
export const parseHm = (hm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

export const isWithinWindow = (date: Date, start: string, end: string): boolean => {
  const s = parseHm(start);
  const e = parseHm(end);
  if (s === null || e === null || s === e) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  return s < e ? now >= s && now < e : now >= s || now < e;
};

/** Minutes until the next boundary (for scheduling a re-check). */
export const minutesToNextBoundary = (date: Date, start: string, end: string): number => {
  const s = parseHm(start);
  const e = parseHm(end);
  if (s === null || e === null) return 60;
  const now = date.getHours() * 60 + date.getMinutes();
  const d = (x: number) => (x - now + 1440) % 1440 || 1440;
  return Math.min(d(s), d(e));
};
