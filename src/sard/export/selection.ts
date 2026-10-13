/**
 * Pure chapter-selection logic for the export engine.
 *
 * Positions are 1-based indexes into the novel's chapter list in reading
 * order (the same order the novel screen shows by default), so "1-50" always
 * means "the first fifty chapters" regardless of how a source numbers them.
 */

export type ExportScope = 'all' | 'downloaded' | 'range';

export type MissingPolicy = 'download' | 'skip';

export interface SelectableChapter {
  id: number;
  name: string;
  isDownloaded: boolean | null;
  chapterNumber?: number | null;
  page?: string | null;
  position?: number | null;
}

export interface RangeSegment {
  from: number;
  to: number;
}

export type RangeParseResult =
  | { ok: true; segments: RangeSegment[] }
  | { ok: false; reason: 'empty' | 'syntax' | 'order' | 'bounds' };

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Converts Arabic-Indic and Persian digits to ASCII digits. */
export const normalizeDigits = (text: string): string =>
  text.replace(/[٠-٩۰-۹]/g, digit => {
    const a = ARABIC_INDIC.indexOf(digit);
    return String(a >= 0 ? a : EXTENDED_ARABIC_INDIC.indexOf(digit));
  });

/**
 * Parses a human range expression like "1-50, 60, 75–80" (also accepts the
 * Arabic comma «،», en/em dashes, "إلى" and Arabic-Indic digits).
 * Segments are merged and sorted. `total` bounds-checks when given.
 */
export const parseRangeExpression = (
  input: string,
  total?: number,
): RangeParseResult => {
  const text = normalizeDigits(input)
    .replace(/\s*(?:إلى|الى|to)\s*/gi, '-')
    .replace(/[–—~:]/g, '-')
    .replace(/[،؛;]/g, ',')
    .trim();
  if (!text) {
    return { ok: false, reason: 'empty' };
  }
  const parts = text
    .split(/[,\s]+/)
    .map(part => part.trim())
    .filter(Boolean);
  const segments: RangeSegment[] = [];
  for (const part of parts) {
    const match = /^(\d+)(?:-(\d+)?)?$/.exec(part);
    if (!match) {
      return { ok: false, reason: 'syntax' };
    }
    const from = Number(match[1]);
    const openEnded = part.endsWith('-');
    const to =
      match[2] !== undefined
        ? Number(match[2])
        : openEnded
        ? total ?? NaN
        : from;
    if (!Number.isFinite(to)) {
      return { ok: false, reason: 'syntax' };
    }
    if (from < 1 || to < 1) {
      return { ok: false, reason: 'bounds' };
    }
    if (from > to) {
      return { ok: false, reason: 'order' };
    }
    if (total !== undefined && to > total) {
      return { ok: false, reason: 'bounds' };
    }
    segments.push({ from, to });
  }
  return { ok: true, segments: mergeSegments(segments) };
};

export const mergeSegments = (segments: RangeSegment[]): RangeSegment[] => {
  const sorted = [...segments].sort((a, b) => a.from - b.from);
  const merged: RangeSegment[] = [];
  for (const segment of sorted) {
    const last = merged[merged.length - 1];
    if (last && segment.from <= last.to + 1) {
      last.to = Math.max(last.to, segment.to);
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
};

export const segmentsToText = (segments: RangeSegment[]): string =>
  segments
    .map(s => (s.from === s.to ? `${s.from}` : `${s.from}-${s.to}`))
    .join(', ');

/** Sorts chapters in reading order: page (numeric), then position, then id. */
export const sortChaptersForReading = <T extends SelectableChapter>(
  chapters: T[],
): T[] =>
  [...chapters].sort((a, b) => {
    const pa = Number(a.page ?? 0) || 0;
    const pb = Number(b.page ?? 0) || 0;
    if (pa !== pb) return pa - pb;
    const qa = a.position ?? Number.MAX_SAFE_INTEGER;
    const qb = b.position ?? Number.MAX_SAFE_INTEGER;
    if (qa !== qb) return qa - qb;
    return a.id - b.id;
  });

export interface SelectionSpec {
  scope: ExportScope;
  /** Required for scope 'range'. */
  range?: string;
}

export interface SelectionItem<T extends SelectableChapter> {
  chapter: T;
  /** 1-based position in the novel's reading order. */
  position: number;
}

export type SelectionResult<T extends SelectableChapter> =
  | {
      ok: true;
      selected: SelectionItem<T>[];
      downloaded: SelectionItem<T>[];
      missing: SelectionItem<T>[];
      firstPosition: number;
      lastPosition: number;
    }
  | {
      ok: false;
      reason: 'empty' | 'syntax' | 'order' | 'bounds' | 'noChapters';
    };

export const selectChapters = <T extends SelectableChapter>(
  chapters: T[],
  spec: SelectionSpec,
): SelectionResult<T> => {
  const ordered = sortChaptersForReading(chapters).map((chapter, index) => ({
    chapter,
    position: index + 1,
  }));
  if (!ordered.length) {
    return { ok: false, reason: 'noChapters' };
  }

  let selected: SelectionItem<T>[];
  if (spec.scope === 'range') {
    const parsed = parseRangeExpression(spec.range ?? '', ordered.length);
    if (!parsed.ok) {
      return { ok: false, reason: parsed.reason };
    }
    selected = ordered.filter(item =>
      parsed.segments.some(
        s => item.position >= s.from && item.position <= s.to,
      ),
    );
  } else if (spec.scope === 'downloaded') {
    selected = ordered.filter(item => Boolean(item.chapter.isDownloaded));
  } else {
    selected = ordered;
  }

  if (!selected.length) {
    return { ok: false, reason: 'empty' };
  }

  return {
    ok: true,
    selected,
    downloaded: selected.filter(item => Boolean(item.chapter.isDownloaded)),
    missing: selected.filter(item => !item.chapter.isDownloaded),
    firstPosition: selected[0].position,
    lastPosition: selected[selected.length - 1].position,
  };
};

/** Above this many chapters a single PDF is split automatically. */
export const AUTO_SPLIT_THRESHOLD = 400;
export const AUTO_SPLIT_SIZE = 250;

/**
 * Splits items into parts of `perPart` (0 = one part, unless the list is
 * larger than AUTO_SPLIT_THRESHOLD, then AUTO_SPLIT_SIZE is used).
 */
export const splitIntoParts = <T>(items: T[], perPart: number): T[][] => {
  let size = Math.floor(perPart);
  if (!size || size < 1) {
    size = items.length > AUTO_SPLIT_THRESHOLD ? AUTO_SPLIT_SIZE : items.length;
  }
  if (size < 1) return [];
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    parts.push(items.slice(i, i + size));
  }
  return parts;
};

/** Strips characters that are illegal in SAF/FAT file names. */
export const sanitizeFileName = (name: string, fallback = 'novel'): string => {
  const cleaned = name
    .trim()
    .replace(/\.(pdf|epub)$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  // Keep names well below the 255-byte limit (Arabic = 2 bytes / char).
  return (cleaned || fallback).slice(0, 100);
};

export const partFileName = (
  base: string,
  part: number,
  parts: number,
  suffixTemplate: (part: number) => string,
): string =>
  parts > 1
    ? `${sanitizeFileName(base)} - ${suffixTemplate(part)}`
    : sanitizeFileName(base);
