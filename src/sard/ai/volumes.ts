/**
 * Volume detection from chapter names / pages (pure).
 * "Volume 2 Chapter 5", "Vol.3", "المجلد الثاني", "المجلد 2"، "Book 4" …
 * Falls back to source pages, then to fixed blocks of 50 chapters.
 */
import { normalizeArabic, toWesternDigits } from './arabic';
import { orderChapters, type ChapterLite } from './spoiler';

const ORDINALS: Record<string, number> = {
  الاول: 1, الاولي: 1, الثاني: 2, الثانيه: 2, التاني: 2, الثالث: 3, الثالثه: 3,
  التالت: 3, الرابع: 4, الخامس: 5, السادس: 6, السابع: 7, الثامن: 8, التامن: 8,
  التاسع: 9, العاشر: 10,
  اول: 1, تاني: 2, ثاني: 2, تالت: 3, ثالث: 3, رابع: 4, خامس: 5, سادس: 6,
  سابع: 7, ثامن: 8, تاسع: 9, عاشر: 10,
};

export const parseOrdinal = (word: string): number | undefined => {
  const w = toWesternDigits(normalizeArabic(word));
  if (/^\d+$/.test(w)) return Number(w);
  return ORDINALS[w] ?? ORDINALS[w.replace(/ه$/, '')];
};

export const parseVolumeNumber = (chapterName: string): number | undefined => {
  const n = toWesternDigits(normalizeArabic(chapterName));
  const en = n.match(/\b(?:volume|vol\.?|book|arc)\s*(\d+)/i);
  if (en) return Number(en[1]);
  const ar = n.match(/(?:المجلد|مجلد|الجزء|جزء|الكتاب)\s*[:\-]?\s*([^\s:\-]+)/);
  if (ar) return parseOrdinal(ar[1]);
  return undefined;
};

export interface VolumeGroup<T> {
  number: number;
  label: string;
  chapters: T[];
  source: 'name' | 'page' | 'block';
}

export const groupVolumes = <T extends ChapterLite>(
  all: T[],
  blockSize = 50,
): VolumeGroup<T>[] => {
  const ordered = orderChapters(all);
  if (!ordered.length) return [];
  const parsed = ordered.map(c => parseVolumeNumber(c.name));
  const named = parsed.filter(v => v !== undefined).length;
  if (named >= ordered.length * 0.6) {
    const groups: VolumeGroup<T>[] = [];
    let last: number | undefined;
    ordered.forEach((c, i) => {
      const v = parsed[i] ?? last ?? 1;
      last = v;
      let g = groups.find(x => x.number === v);
      if (!g) {
        g = { number: v, label: `المجلد ${v}`, chapters: [], source: 'name' };
        groups.push(g);
      }
      g.chapters.push(c);
    });
    return groups.sort((a, b) => a.number - b.number);
  }
  const pages = new Set(ordered.map(c => c.page ?? '1'));
  if (pages.size > 1) {
    const groups = new Map<string, T[]>();
    ordered.forEach(c => {
      const p = c.page ?? '1';
      groups.set(p, [...(groups.get(p) ?? []), c]);
    });
    return Array.from(groups.entries()).map(([p, chapters], i) => ({
      number: i + 1,
      label: `الجزء ${p}`,
      chapters,
      source: 'page' as const,
    }));
  }
  const out: VolumeGroup<T>[] = [];
  for (let i = 0; i < ordered.length; i += blockSize) {
    out.push({
      number: out.length + 1,
      label: `الفصول ${i + 1}–${Math.min(i + blockSize, ordered.length)}`,
      chapters: ordered.slice(i, i + blockSize),
      source: 'block',
    });
  }
  return out;
};
