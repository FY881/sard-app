import {
  applyFilter, buildShareList, cleanTag, colorForTag, matchesFilter, progressOf, queueAdd, queueMove,
  queueRemove, rng, surprisePick, visibleItems, type LibraryItem, type NovelMeta,
} from '../logic/library';
import { formatBytes, isBrokenDownload, remainingOfflineSlots, schedulerBlock, selectForCleanup, DEFAULT_SCHEDULER } from '../logic/offline';

const items: LibraryItem[] = [
  { id: 1, name: 'لورد', author: 'أ', totalChapters: 100, chaptersUnread: 50, chaptersDownloaded: 10, genres: 'فانتازيا' },
  { id: 2, name: 'Beta', totalChapters: 10, chaptersUnread: 10, chaptersDownloaded: 0, genres: 'Action' },
  { id: 3, name: 'جيم', totalChapters: 20, chaptersUnread: 0, chaptersDownloaded: 20 },
];
const metas = new Map<number, NovelMeta>([
  [1, { novelId: 1, status: 'reading', rating: 5, tags: ['مفضلة', 'طويلة'] }],
  [2, { novelId: 2, status: 'planned', tags: ['مفضلة'] }],
  [3, { novelId: 3, status: 'finished', rating: 3, hidden: true }],
]);

describe('library logic', () => {
  it('computes progress and smart filters', () => {
    expect(progressOf(items[0])).toBe(0.5);
    expect(applyFilter(items, metas, { id: 'f', name: 'x', tagsAny: ['مفضلة'] }).map(n => n.id)).toEqual([1, 2]);
    expect(applyFilter(items, metas, { id: 'f', name: 'x', tagsAll: ['مفضلة', 'طويلة'] }).map(n => n.id)).toEqual([1]);
    expect(applyFilter(items, metas, { id: 'f', name: 'x', minRating: 4 }).map(n => n.id)).toEqual([1]);
    expect(applyFilter(items, metas, { id: 'f', name: 'x', statuses: ['planned'], unreadOnly: true }).map(n => n.id)).toEqual([2]);
    expect(applyFilter(items, metas, { id: 'f', name: 'x', downloadedOnly: true, maxProgress: 0.6 }).map(n => n.id)).toEqual([1]);
    expect(matchesFilter(items[1], metas.get(2), { id: 'f', name: 'x', genre: 'action' })).toBe(true);
    expect(matchesFilter(items[0], metas.get(1), { id: 'f', name: 'x', text: 'لورد' })).toBe(true);
  });
  it('hides hidden-shelf novels unless revealed', () => {
    const hidden = new Set([3]);
    expect(visibleItems(items, hidden, false).map(n => n.id)).toEqual([1, 2]);
    expect(visibleItems(items, hidden, true)).toHaveLength(3);
  });
  it('surprise pick respects modes, hidden and exclusions, deterministic with seed', () => {
    const r = rng(42);
    for (let i = 0; i < 20; i++) {
      const p = surprisePick(items, metas, 'unread', r)!;
      expect([1, 2]).toContain(p.id);
    }
    expect(surprisePick(items, metas, 'unstarted', rng(1))?.id).toBe(2);
    expect(surprisePick(items, metas, 'planned', rng(1))?.id).toBe(2);
    expect(surprisePick([items[2]], metas, 'any', rng(1))).toBeUndefined();
    expect(surprisePick(items, metas, 'unread', rng(3), 1)?.id).toBe(2);
  });
  it('builds a share list grouped by status, without hidden', () => {
    const txt = buildShareList(items, metas, 'ar');
    expect(txt).toContain('مكتبتي في سَرد (3)');
    expect(txt).toContain('أقرؤها:');
    expect(txt).toContain('★★★★★');
    expect(txt).not.toContain('جيم');
    expect(buildShareList(items, metas, 'en')).toContain('Planned:');
  });
  it('queue + tag helpers', () => {
    let q = queueAdd([], 1);
    q = queueAdd(queueAdd(q, 2), 1);
    expect(q).toEqual([1, 2]);
    expect(queueMove(queueAdd(q, 3), 3, -2)).toEqual([3, 1, 2]);
    expect(queueRemove(q, 1)).toEqual([2]);
    expect(cleanTag('  #مفضلة، جديدة ')).toBe('مفضلة جديدة');
    expect(colorForTag('x')).toBe(colorForTag('x'));
  });
});

describe('offline logic', () => {
  const now = new Date(2026, 9, 13, 23, 0);
  it('blocks per scheduler conditions', () => {
    const s = { ...DEFAULT_SCHEDULER, enabled: true, chargingOnly: true, windowStart: '22:00', windowEnd: '06:00' };
    expect(schedulerBlock({ ...s, enabled: false }, { connection: 'cellular', charging: false, now })).toBeNull();
    expect(schedulerBlock(s, { connection: 'cellular', charging: true, now })).toBe('wifi');
    expect(schedulerBlock(s, { connection: 'wifi', charging: false, now })).toBe('charging');
    expect(schedulerBlock(s, { connection: 'wifi', charging: true, now: new Date(2026, 9, 13, 12) })).toBe('window');
    expect(schedulerBlock(s, { connection: 'wifi', charging: true, now })).toBeNull();
    expect(schedulerBlock(s, { connection: 'none', charging: true, now })).toBe('offline');
  });
  it('selects read downloads older than N days', () => {
    const day = 86_400_000;
    const t = Date.UTC(2026, 9, 13);
    const iso = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
    const chs = [
      { id: 1, novelId: 1, unread: false, bookmark: false, readTime: iso(t - 20 * day) },
      { id: 2, novelId: 1, unread: true, bookmark: false, readTime: null },
      { id: 3, novelId: 1, unread: false, bookmark: true, readTime: iso(t - 20 * day) },
      { id: 4, novelId: 1, unread: false, bookmark: false, readTime: iso(t - 2 * day) },
    ];
    expect(selectForCleanup(chs, { enabled: true, days: 14, keepBookmarked: true }, t).map(c => c.id)).toEqual([1]);
    expect(selectForCleanup(chs, { enabled: true, days: 14, keepBookmarked: false }, t).map(c => c.id)).toEqual([1, 3]);
  });
  it('integrity, bytes, slots', () => {
    expect(isBrokenDownload(false, null)).toBe(true);
    expect(isBrokenDownload(true, 10)).toBe(true);
    expect(isBrokenDownload(true, 5000, '<p>   </p>')).toBe(true);
    expect(isBrokenDownload(true, 5000, '<p>نص فصل كامل طويل بما يكفي للاختبار</p>')).toBe(false);
    expect(formatBytes(1536, false)).toBe('1.5 KB');
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 م.ب');
    expect(remainingOfflineSlots(290, 5, 300)).toBe(5);
    expect(remainingOfflineSlots(400, 0, 300)).toBe(0);
    expect(remainingOfflineSlots(1, 1, Infinity)).toBe(Infinity);
  });
});
