/**
 * Librarian dedupe: same title added from different sources (pure).
 */
import { editDistance, jaccard, normalizeText } from '../ai/arabic';

const NOISE_TOKENS = new Set([
  'novel', 'webnovel', 'web', 'ln', 'wn', 'raw', 'raws', 'light', 'the',
  'completed', 'complete', 'ongoing', 'official', 'translation', 'translated',
  'arabic', 'english', 'mtl', 'remastered', 'روايه', 'مترجمه', 'مكتمله',
  'كامله', 'ويب', 'الروايه',
]);

/** Title key ignoring brackets, punctuation, noise words and diacritics. */
export const dedupeKey = (title: string) =>
  normalizeText(
    title
      .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, ' ')
      .replace(/\s[-–—|]\s.*$/, m =>
        /(novel|ln|wn|مترجم|روايه|رواية)/i.test(m) ? ' ' : m,
      ),
  )
    .split(' ')
    .filter(t => t && !NOISE_TOKENS.has(t))
    .join(' ');

export interface DedupeNovel {
  id: number;
  name: string;
  pluginId: string;
  author?: string | null;
  totalChapters?: number | null;
  chaptersUnread?: number | null;
  lastReadAt?: string | null;
}

export interface DuplicateGroup<T> {
  key: string;
  novels: T[];
  /** Suggested one to keep (most progress, then most chapters). */
  keep: T;
  /** True when grouped by fuzzy match rather than identical key. */
  fuzzy: boolean;
}

const readCount = (n: DedupeNovel) =>
  Math.max(0, (n.totalChapters ?? 0) - (n.chaptersUnread ?? 0));

const similar = (a: string, b: string) => {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  if (jaccard(a.split(' '), b.split(' ')) >= 0.8) return true;
  const maxLen = Math.max(a.length, b.length);
  const limit = Math.max(1, Math.floor(maxLen * 0.12));
  return editDistance(a, b, limit) <= limit;
};

const authorsConflict = (a?: string | null, b?: string | null) => {
  if (!a || !b) return false;
  const x = normalizeText(a);
  const y = normalizeText(b);
  return !!x && !!y && x !== y && !x.includes(y) && !y.includes(x);
};

export const findDuplicateGroups = <T extends DedupeNovel>(
  novels: T[],
): DuplicateGroup<T>[] => {
  const keyed = novels
    .map(n => ({ n, key: dedupeKey(n.name) }))
    .filter(x => x.key);
  const groups: { key: string; items: T[]; fuzzy: boolean }[] = [];
  for (const { n, key } of keyed) {
    const compatible = (g: { items: T[] }) =>
      !g.items.some(i => authorsConflict(i.author, n.author));
    let g = groups.find(x => x.key === key && compatible(x));
    if (!g) {
      g = groups.find(x => similar(x.key, key) && compatible(x));
      if (g) g.fuzzy = true;
    }
    if (g) g.items.push(n);
    else groups.push({ key, items: [n], fuzzy: false });
  }
  return groups
    .filter(g => g.items.length > 1)
    .map(g => {
      const keep = [...g.items].sort(
        (a, b) =>
          readCount(b) - readCount(a) ||
          (b.totalChapters ?? 0) - (a.totalChapters ?? 0) ||
          a.id - b.id,
      )[0];
      return { key: g.key, novels: g.items, keep, fuzzy: g.fuzzy };
    });
};
