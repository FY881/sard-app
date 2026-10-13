import {
  classifyNovel,
  computeShelves,
  DEFAULT_SHELF_RULES,
  type ShelfNovel,
} from '../shelves';
import { dedupeKey, findDuplicateGroups } from '../dedupe';
import { buildTasteProfile, rankCandidates, splitGenres } from '../taste';
import {
  connectionAllows,
  pickChaptersToDownload,
  planAutoDownload,
} from '../watcherPlan';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();

const novel = (p: Partial<ShelfNovel>): ShelfNovel => ({
  id: 1,
  name: 'N',
  pluginId: 'p',
  path: '/n',
  totalChapters: 100,
  chaptersUnread: 100,
  chaptersDownloaded: 0,
  unreadDownloaded: 0,
  lastReadAt: null,
  status: 'Ongoing',
  ...p,
});

const R = DEFAULT_SHELF_RULES;

describe('smart shelves', () => {
  it('not started', () => {
    expect(classifyNovel(novel({}), R, NOW).shelves).toEqual(['not_started']);
  });
  it('paused after N days', () => {
    const p = classifyNovel(
      novel({ chaptersUnread: 60, lastReadAt: daysAgo(20) }),
      R,
      NOW,
    );
    expect(p.shelves).toEqual(['paused']);
    expect(p.reasons.paused).toContain('20');
  });
  it('recently read is not paused', () => {
    expect(
      classifyNovel(novel({ chaptersUnread: 60, lastReadAt: daysAgo(2) }), R, NOW)
        .shelves,
    ).toEqual([]);
  });
  it('accepts sqlite "YYYY-MM-DD HH:MM:SS" dates', () => {
    const p = classifyNovel(
      novel({ chaptersUnread: 60, lastReadAt: '2026-09-01 10:00:00' }),
      R,
      NOW,
    );
    expect(p.shelves).toEqual(['paused']);
  });
  it('near finish by remaining count or ratio', () => {
    expect(
      classifyNovel(
        novel({ chaptersUnread: 8, lastReadAt: daysAgo(1), status: 'Completed' }),
        R,
        NOW,
      ).shelves,
    ).toEqual(['near_finish']);
    const big = novel({
      totalChapters: 1000,
      chaptersUnread: 100,
      lastReadAt: daysAgo(1),
    });
    expect(classifyNovel(big, R, NOW).shelves).toContain('near_finish');
  });
  it('binge ready with many downloaded unread chapters', () => {
    const p = classifyNovel(
      novel({ chaptersUnread: 50, unreadDownloaded: 30, lastReadAt: daysAgo(1) }),
      R,
      NOW,
    );
    expect(p.shelves).toEqual(['binge_ready']);
  });
  it('finished', () => {
    expect(
      classifyNovel(novel({ chaptersUnread: 0, lastReadAt: daysAgo(1) }), R, NOW)
        .shelves,
    ).toEqual(['finished']);
  });
  it('a novel can sit on several shelves; computeShelves sorts', () => {
    const list = [
      novel({
        id: 1,
        name: 'A',
        chaptersUnread: 5,
        unreadDownloaded: 5,
        lastReadAt: daysAgo(30),
      }),
      novel({ id: 2, name: 'B', chaptersUnread: 2, lastReadAt: daysAgo(1) }),
      novel({
        id: 3,
        name: 'C',
        chaptersUnread: 40,
        unreadDownloaded: 40,
        lastReadAt: daysAgo(1),
      }),
    ];
    const s = computeShelves(list, R, NOW);
    expect(s.near_finish.map(i => i.novel.id)).toEqual([2, 1]);
    expect(s.paused.map(i => i.novel.id)).toEqual([1]);
    expect(s.binge_ready.map(i => i.novel.id)).toEqual([3]);
  });
});

describe('dedupe across sources', () => {
  it('normalizes noise in titles', () => {
    expect(dedupeKey('Shadow Slave (Web Novel) [Completed]')).toBe(
      'shadow slave',
    );
    expect(dedupeKey('رواية عبد الظل - مترجمة')).toBe('عبد الظل');
  });
  it('groups identical and fuzzy titles, suggests keeper with most progress', () => {
    const groups = findDuplicateGroups([
      {
        id: 1,
        name: 'Shadow Slave',
        pluginId: 'a',
        totalChapters: 2000,
        chaptersUnread: 1500,
      },
      {
        id: 2,
        name: 'Shadow Slave (Novel)',
        pluginId: 'b',
        totalChapters: 2100,
        chaptersUnread: 2100,
      },
      {
        id: 3,
        name: 'Shadow Slav',
        pluginId: 'c',
        totalChapters: 10,
        chaptersUnread: 10,
      },
      { id: 4, name: 'Lord of the Mysteries', pluginId: 'a' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].novels.map(n => n.id).sort()).toEqual([1, 2, 3]);
    expect(groups[0].keep.id).toBe(1);
  });
  it('does not merge same title by different authors', () => {
    expect(
      findDuplicateGroups([
        { id: 1, name: 'Overlord', pluginId: 'a', author: 'Kugane Maruyama' },
        { id: 2, name: 'Overlord', pluginId: 'b', author: 'Someone Else' },
      ]),
    ).toEqual([]);
  });
});

describe('recommender taste', () => {
  const profile = buildTasteProfile([
    {
      name: 'A',
      pluginId: 'p1',
      genres: 'Fantasy, Action',
      totalChapters: 300,
      chaptersUnread: 0,
      inLibrary: true,
    },
    {
      name: 'B',
      pluginId: 'p1',
      genres: 'فانتازيا، Romance',
      totalChapters: 50,
      chaptersUnread: 40,
      inLibrary: true,
    },
    {
      name: 'C',
      pluginId: 'p2',
      genres: 'Horror',
      totalChapters: 10,
      chaptersUnread: 10,
      inLibrary: true,
    },
  ]);
  it('splits genres in Arabic and English', () => {
    expect(splitGenres('فانتازيا، أكشن / Action | Drama')).toEqual([
      'فانتازيا',
      'أكشن',
      'Action',
      'Drama',
    ]);
  });
  it('weights genres by engagement', () => {
    expect(profile.topGenres[0]).toBe('Fantasy');
    expect(profile.genres.get('horror')!).toBeLessThan(
      profile.genres.get('fantasy')!,
    );
  });
  it('ranks matching candidates first, excludes library, explains why', () => {
    const ranked = rankCandidates(
      profile,
      [
        {
          name: 'Horror Thing',
          path: '/h',
          pluginId: 'p2',
          pluginName: 'S2',
          genres: 'Horror',
          rank: 0,
        },
        {
          name: 'Epic Fantasy',
          path: '/f',
          pluginId: 'p1',
          pluginName: 'S1',
          genres: 'Fantasy, Action',
          rank: 3,
        },
        {
          name: 'A',
          path: '/a',
          pluginId: 'p1',
          pluginName: 'S1',
          genres: 'Fantasy',
          rank: 1,
        },
      ],
      [{ name: 'A', path: '/a', pluginId: 'p1' }],
    );
    expect(ranked.map(r => r.name)).toEqual(['Epic Fantasy', 'Horror Thing']);
    expect(ranked[0].why).toContain('لأنك تحب');
    expect(ranked[0].why).toContain('S1');
  });
});

describe('chapter watcher planning', () => {
  const chapters = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    name: `c${i + 1}`,
    position: i + 1,
    unread: i >= 5,
    isDownloaded: i === 6,
  }));
  const on = { autoDownload: true, autoDownloadCount: 4, wifiOnly: true };
  it('keeps N chapters ahead of the last read one', () => {
    expect(planAutoDownload(chapters, on).map(c => c.id)).toEqual([6, 8, 9]);
  });
  it('skips queued and disabled', () => {
    expect(planAutoDownload(chapters, { ...on, autoDownload: false })).toEqual(
      [],
    );
    expect(planAutoDownload(chapters, on, new Set([6])).map(c => c.id)).toEqual(
      [8, 9],
    );
  });
  it('wifi-only gating', () => {
    expect(connectionAllows('wifi', true)).toEqual({ ok: true });
    expect(connectionAllows('cellular', true)).toEqual({
      ok: false,
      reason: 'not_wifi',
    });
    expect(connectionAllows('cellular', false)).toEqual({ ok: true });
    expect(connectionAllows('unknown', true)).toEqual({
      ok: false,
      reason: 'unknown_network',
    });
    expect(connectionAllows('none', false)).toEqual({
      ok: false,
      reason: 'offline',
    });
  });
  it('agent download picks latest / next / all', () => {
    expect(pickChaptersToDownload(chapters, 'latest', 3).map(c => c.id)).toEqual(
      [18, 19, 20],
    );
    expect(pickChaptersToDownload(chapters, 'next', 3).map(c => c.id)).toEqual(
      [6, 8],
    );
    expect(pickChaptersToDownload(chapters, 'all', undefined)).toHaveLength(19);
  });
});
