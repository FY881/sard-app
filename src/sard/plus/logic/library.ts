/** Library organising logic: statuses, smart filters, surprise picks, sharing. */
export type ReadingStatus = 'reading' | 'planned' | 'finished' | 'paused' | 'dropped';
export const READING_STATUSES: ReadingStatus[] = ['reading', 'planned', 'finished', 'paused', 'dropped'];

export interface NovelMeta {
  novelId: number;
  status?: ReadingStatus | null;
  rating?: number | null;
  note?: string | null;
  hidden?: boolean;
  tags?: string[];
}

export interface LibraryItem {
  id: number;
  name: string;
  author?: string | null;
  genres?: string | null;
  totalChapters?: number | null;
  chaptersUnread?: number | null;
  chaptersDownloaded?: number | null;
  lastReadAt?: string | null;
  pluginId?: string;
}

export interface SmartFilter {
  id: string;
  name: string;
  tagsAll?: string[];
  tagsAny?: string[];
  statuses?: ReadingStatus[];
  minRating?: number;
  unreadOnly?: boolean;
  downloadedOnly?: boolean;
  /** 0..1 */
  minProgress?: number;
  maxProgress?: number;
  genre?: string;
  text?: string;
}

export const progressOf = (n: LibraryItem): number => {
  const total = n.totalChapters ?? 0;
  if (!total) return 0;
  return Math.min(1, Math.max(0, (total - (n.chaptersUnread ?? total)) / total));
};

const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[\u064B-\u065F\u0640]/g, '');

export const matchesFilter = (n: LibraryItem, meta: NovelMeta | undefined, f: SmartFilter): boolean => {
  const tags = meta?.tags ?? [];
  if (f.tagsAll?.length && !f.tagsAll.every(t => tags.includes(t))) return false;
  if (f.tagsAny?.length && !f.tagsAny.some(t => tags.includes(t))) return false;
  if (f.statuses?.length && !(meta?.status && f.statuses.includes(meta.status))) return false;
  if (f.minRating && (meta?.rating ?? 0) < f.minRating) return false;
  if (f.unreadOnly && !(n.chaptersUnread && n.chaptersUnread > 0)) return false;
  if (f.downloadedOnly && !(n.chaptersDownloaded && n.chaptersDownloaded > 0)) return false;
  const p = progressOf(n);
  if (f.minProgress !== undefined && p < f.minProgress) return false;
  if (f.maxProgress !== undefined && p > f.maxProgress) return false;
  if (f.genre && !norm(n.genres).includes(norm(f.genre))) return false;
  if (f.text) {
    const q = norm(f.text);
    if (!norm(n.name).includes(q) && !norm(n.author).includes(q) && !norm(meta?.note).includes(q)) return false;
  }
  return true;
};

export const applyFilter = (items: LibraryItem[], metas: Map<number, NovelMeta>, f: SmartFilter) =>
  items.filter(n => matchesFilter(n, metas.get(n.id), f));

/** Hidden-shelf aware view of the library. */
export const visibleItems = <T extends { id: number }>(items: T[], hidden: ReadonlySet<number>, reveal: boolean) =>
  reveal || hidden.size === 0 ? items : items.filter(n => !hidden.has(n.id));

/** Deterministic PRNG (mulberry32) so tests and "same pick until reroll" work. */
export const rng = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type SurpriseMode = 'any' | 'unread' | 'unstarted' | 'planned';

export const surprisePick = <T extends LibraryItem>(
  items: T[],
  metas: Map<number, NovelMeta>,
  mode: SurpriseMode,
  random: () => number = Math.random,
  excludeId?: number,
): T | undefined => {
  const pool = items.filter(n => {
    if (n.id === excludeId && items.length > 1) return false;
    const meta = metas.get(n.id);
    if (meta?.hidden) return false;
    if (meta?.status === 'dropped' || meta?.status === 'finished') return mode === 'any';
    if (mode === 'unread') return (n.chaptersUnread ?? 0) > 0;
    if (mode === 'unstarted') return progressOf(n) === 0 && (n.totalChapters ?? 0) > 0;
    if (mode === 'planned') return meta?.status === 'planned';
    return true;
  });
  if (!pool.length) return undefined;
  // Prefer ones not touched for a while: weight = 1 + days since last read (capped).
  const now = Date.now();
  const weights = pool.map(n => {
    const last = n.lastReadAt ? Date.parse(n.lastReadAt.replace(' ', 'T')) : NaN;
    const days = Number.isFinite(last) ? Math.min(60, (now - last) / 86_400_000) : 30;
    return 1 + days;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
};

export const STATUS_LABELS: Record<ReadingStatus, { ar: string; en: string; icon: string }> = {
  reading: { ar: 'أقرؤها', en: 'Reading', icon: 'book-open-page-variant-outline' },
  planned: { ar: 'مخطط لها', en: 'Planned', icon: 'calendar-clock-outline' },
  finished: { ar: 'أنهيتها', en: 'Finished', icon: 'check-decagram-outline' },
  paused: { ar: 'متوقفة', en: 'Paused', icon: 'pause-circle-outline' },
  dropped: { ar: 'تركتها', en: 'Dropped', icon: 'close-circle-outline' },
};

export const buildShareList = (
  items: LibraryItem[],
  metas: Map<number, NovelMeta>,
  lang: 'ar' | 'en',
  includeHidden = false,
): string => {
  const groups = new Map<string, string[]>();
  for (const n of items) {
    const meta = metas.get(n.id);
    if (meta?.hidden && !includeHidden) continue;
    const status = meta?.status ?? null;
    const key = status ? STATUS_LABELS[status][lang] : lang === 'ar' ? 'بدون حالة' : 'No status';
    const stars = meta?.rating ? ' ' + '★'.repeat(meta.rating) + '☆'.repeat(5 - meta.rating) : '';
    const by = n.author ? (lang === 'ar' ? ` — ${n.author}` : ` — ${n.author}`) : '';
    const pct = Math.round(progressOf(n) * 100);
    const line = `• ${n.name}${by}${stars}${pct ? ` (${pct}%)` : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  const head = lang === 'ar' ? `مكتبتي في سَرد (${items.length})` : `My Sard library (${items.length})`;
  const body = [...groups.entries()]
    .map(([k, lines]) => `${k}:\n${lines.sort((a, b) => a.localeCompare(b, lang)).join('\n')}`)
    .join('\n\n');
  return `${head}\n\n${body}`.trim();
};

/** Ordered up-next queue helpers. */
export const queueAdd = (q: number[], id: number) => (q.includes(id) ? q : [...q, id]);
export const queueRemove = (q: number[], id: number) => q.filter(x => x !== id);
export const queueMove = (q: number[], id: number, delta: number) => {
  const i = q.indexOf(id);
  if (i < 0) return q;
  const j = Math.min(q.length - 1, Math.max(0, i + delta));
  const next = q.slice();
  next.splice(i, 1);
  next.splice(j, 0, id);
  return next;
};

export const TAG_COLORS = ['#E57373', '#F06292', '#BA68C8', '#7986CB', '#4FC3F7', '#4DB6AC', '#81C784', '#FFD54F', '#FF8A65', '#A1887F'];
export const colorForTag = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
};
export const cleanTag = (name: string) => name.replace(/[#,،]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 32);
