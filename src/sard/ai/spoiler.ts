/**
 * Spoiler cutoff (pure). Decides which chapters the AI may "know about".
 *
 * Rule: AI context may only contain chapters the reader has already reached:
 *  - chapters marked read (unread === false), and everything before the
 *    furthest read chapter (reading order, not read time);
 *  - optionally the current chapter (when it is finished or explicitly asked);
 *  - «ما سبق» uses chapters strictly BEFORE the current one.
 * Nothing after the cutoff is ever sent to the model.
 */

export interface ChapterLite {
  id: number;
  name: string;
  position?: number | null;
  page?: string | null;
  chapterNumber?: number | null;
  unread?: boolean | null;
  isDownloaded?: boolean | null;
  progress?: number | null;
}

const pageNum = (p?: string | null) => {
  const n = Number(p ?? 1);
  return Number.isFinite(n) ? n : 1;
};

/** Reading order: page, then position, then id (matches LNReader). */
export const orderChapters = <T extends ChapterLite>(chapters: T[]): T[] =>
  [...chapters].sort(
    (a, b) =>
      pageNum(a.page) - pageNum(b.page) ||
      (a.position ?? 0) - (b.position ?? 0) ||
      a.id - b.id,
  );

export const isRead = (c: ChapterLite) =>
  c.unread === false || (c.progress ?? 0) >= 97;

/** Index (in reading order) of the furthest chapter the reader has reached. */
export const readCutoffIndex = (
  ordered: ChapterLite[],
  options: { currentChapterId?: number; includeCurrent?: boolean } = {},
): number => {
  let cutoff = -1;
  ordered.forEach((c, i) => {
    if (isRead(c)) cutoff = i;
  });
  if (options.currentChapterId !== undefined) {
    const cur = ordered.findIndex(c => c.id === options.currentChapterId);
    if (cur >= 0) {
      const curLimit = options.includeCurrent ? cur : cur - 1;
      cutoff = Math.max(cutoff, curLimit);
    }
  }
  return cutoff;
};

export interface SpoilerSafeSelection<T> {
  /** Allowed chapters in reading order (oldest → newest). */
  chapters: T[];
  cutoffIndex: number;
  /** The last chapter the AI may know about (the boundary). */
  boundary?: T;
  /** Allowed chapters skipped because their text is not downloaded. */
  missingText: T[];
}

export const selectSpoilerSafeChapters = <T extends ChapterLite>(
  all: T[],
  options: {
    currentChapterId?: number;
    includeCurrent?: boolean;
    requireDownloaded?: boolean;
    /** Keep only the newest N allowed chapters. */
    max?: number;
    /** Only chapters after this reading index (incremental glossary). */
    afterIndex?: number;
  } = {},
): SpoilerSafeSelection<T> => {
  const ordered = orderChapters(all);
  const cutoffIndex = readCutoffIndex(ordered, options);
  const from = Math.max(0, (options.afterIndex ?? -1) + 1);
  const window = cutoffIndex >= from ? ordered.slice(from, cutoffIndex + 1) : [];
  const missingText = options.requireDownloaded
    ? window.filter(c => !c.isDownloaded)
    : [];
  let chapters = options.requireDownloaded
    ? window.filter(c => !!c.isDownloaded)
    : window;
  if (options.max !== undefined && chapters.length > options.max) {
    chapters = chapters.slice(chapters.length - options.max);
  }
  return {
    chapters,
    cutoffIndex,
    boundary: cutoffIndex >= 0 ? ordered[cutoffIndex] : undefined,
    missingText,
  };
};

/** Chapters for «ما سبق»: the N chapters right before `currentChapterId`. */
export const selectRecapChapters = <T extends ChapterLite>(
  all: T[],
  currentChapterId: number | undefined,
  count: number,
) => {
  const ordered = orderChapters(all);
  let curIndex =
    currentChapterId === undefined
      ? -1
      : ordered.findIndex(c => c.id === currentChapterId);
  if (curIndex < 0) {
    // No current chapter: recap up to the furthest read chapter (inclusive).
    curIndex = readCutoffIndex(ordered) + 1;
  }
  const previous = ordered.slice(0, Math.max(0, curIndex));
  const downloaded = previous.filter(c => !!c.isDownloaded);
  const lastN = previous.slice(Math.max(0, previous.length - count));
  return {
    current: ordered[curIndex] as T | undefined,
    hasPrevious: previous.length > 0,
    chapters: downloaded.slice(Math.max(0, downloaded.length - count)),
    /** Of the N immediately-previous chapters, which lack text on disk. */
    missing: lastN.filter(c => !c.isDownloaded),
  };
};

/** True when summarising/reading `chapterId` would reveal unread content. */
export const isSpoilerRisk = (
  all: ChapterLite[],
  chapterId: number,
  currentChapterId?: number,
) => {
  const ordered = orderChapters(all);
  const idx = ordered.findIndex(c => c.id === chapterId);
  if (idx < 0) return false;
  const cutoff = readCutoffIndex(ordered, {
    currentChapterId,
    includeCurrent: true,
  });
  return idx > cutoff;
};
