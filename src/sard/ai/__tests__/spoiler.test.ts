import {
  isSpoilerRisk,
  orderChapters,
  readCutoffIndex,
  selectRecapChapters,
  selectSpoilerSafeChapters,
  type ChapterLite,
} from '../spoiler';
import { groupVolumes, parseVolumeNumber } from '../volumes';

const mk = (n: number, read: boolean, downloaded = true): ChapterLite => ({
  id: 100 + n,
  name: `Chapter ${n}`,
  position: n,
  page: '1',
  unread: !read,
  isDownloaded: downloaded,
});

// read 1..5, unread 6..10; chapter 3 not downloaded
const chapters = Array.from({ length: 10 }, (_, i) =>
  mk(i + 1, i < 5, i !== 2),
).reverse();

describe('spoiler cutoff', () => {
  it('orders by page/position', () => {
    expect(orderChapters(chapters).map(c => c.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });
  it('cutoff = furthest read chapter', () => {
    expect(readCutoffIndex(orderChapters(chapters))).toBe(4);
  });
  it('never returns chapters after the cutoff', () => {
    const sel = selectSpoilerSafeChapters(chapters, { requireDownloaded: true });
    expect(sel.chapters.map(c => c.position)).toEqual([1, 2, 4, 5]);
    expect(sel.missingText.map(c => c.position)).toEqual([3]);
    expect(sel.boundary?.position).toBe(5);
  });
  it('treats a skipped-ahead current chapter as reached (excluded by default)', () => {
    const sel = selectSpoilerSafeChapters(chapters, { currentChapterId: 108 });
    expect(sel.chapters[sel.chapters.length - 1].position).toBe(7);
    const incl = selectSpoilerSafeChapters(chapters, {
      currentChapterId: 108,
      includeCurrent: true,
    });
    expect(incl.chapters[incl.chapters.length - 1].position).toBe(8);
  });
  it('supports incremental windows and max', () => {
    const sel = selectSpoilerSafeChapters(chapters, { afterIndex: 2, max: 1 });
    expect(sel.chapters.map(c => c.position)).toEqual([5]);
    const none = selectSpoilerSafeChapters(chapters, { afterIndex: 4 });
    expect(none.chapters).toEqual([]);
  });
  it('nothing read → empty', () => {
    const fresh = Array.from({ length: 3 }, (_, i) => mk(i + 1, false));
    const sel = selectSpoilerSafeChapters(fresh);
    expect(sel.cutoffIndex).toBe(-1);
    expect(sel.chapters).toEqual([]);
  });
  it('flags spoiler risk for unread chapters only', () => {
    expect(isSpoilerRisk(chapters, 104)).toBe(false);
    expect(isSpoilerRisk(chapters, 109)).toBe(true);
    expect(isSpoilerRisk(chapters, 109, 109)).toBe(false);
  });
});

describe('recap selection', () => {
  it('takes the N downloaded chapters right before the current one', () => {
    const r = selectRecapChapters(chapters, 106, 3);
    expect(r.current?.position).toBe(6);
    expect(r.chapters.map(c => c.position)).toEqual([2, 4, 5]);
    expect(r.missing.map(c => c.position)).toEqual([3]);
  });
  it('first chapter has no previous', () => {
    expect(selectRecapChapters(chapters, 101, 3).hasPrevious).toBe(false);
  });
  it('without current chapter: up to furthest read', () => {
    const r = selectRecapChapters(chapters, undefined, 2);
    expect(r.chapters.map(c => c.position)).toEqual([4, 5]);
  });
});

describe('volumes', () => {
  it('parses volume numbers in English and Arabic', () => {
    expect(parseVolumeNumber('Volume 2 Chapter 10')).toBe(2);
    expect(parseVolumeNumber('Vol.3 Ch.1')).toBe(3);
    expect(parseVolumeNumber('المجلد الثاني - الفصل 5')).toBe(2);
    expect(parseVolumeNumber('المجلد ٤: البداية')).toBe(4);
    expect(parseVolumeNumber('Chapter 1')).toBeUndefined();
  });
  it('groups by names, else blocks', () => {
    const named = [1, 2, 3, 4].map(i => ({
      id: i,
      name: `Volume ${i <= 2 ? 1 : 2} Chapter ${i}`,
      position: i,
    }));
    expect(groupVolumes(named).map(v => v.chapters.length)).toEqual([2, 2]);
    const plain = Array.from({ length: 120 }, (_, i) => ({
      id: i,
      name: `Chapter ${i}`,
      position: i,
    }));
    expect(groupVolumes(plain, 50).map(v => v.chapters.length)).toEqual([
      50, 50, 20,
    ]);
  });
});
