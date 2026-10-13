/**
 * Device-side data gathering for the «سَرد+» screens: reader stats for
 * achievements/XP/challenges/wraps, offline storage, cleanup, integrity,
 * download-by-tag and the reading text used by the on-device AI tools.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import * as LegacyFS from 'expo-file-system/legacy';
import { db, dbManager } from '@database/db';
import { chapterSchema } from '@database/schema';
import { deleteChapters, getChapter, getDownloadedChapters } from '@database/queries/ChapterQueries';
import NativeFile from '@modules/native-file';
import { NOVEL_STORAGE } from '@utils/Storages';
import { getPlugin } from '@plugins/pluginManager';
import { countHighlights, ensureSardReaderTables, getReadingDays } from '../reader/db';
import { getSardReaderSettings } from '../reader/settings';
import { toDayKey, type DayTotal } from '../reader/streaks';
import { enqueueChapterDownloads, getQueuedChapterIds, loadLibraryNovels, type LibraryNovel } from '../agents/library';
import { getCurrentTier } from '../membership/service';
import { tierRank } from '../membership/tiers';
import { bookmarkCounts, ensureSardPlusTables, getAllNovelMeta, listBookmarks, listTags, vocabCounts } from './db';
import { challengesStore, countersStore } from './store';
import type { ReaderStats, TodayCounters } from './logic/motivation';
import { isBrokenDownload, selectForCleanup, type CleanupSettings } from './logic/offline';
import { htmlToText } from './logic/readingTime';

const rows = async <T = any>(query: string, params: unknown[] = []): Promise<T[]> => {
  const res = await db.execute(query, params as any);
  return (((res as any)?.rows ?? []) as T[]) || [];
};

/* ------------------------------------------------------------- stats */
export const getReaderStats = async (): Promise<ReaderStats> => {
  ensureSardReaderTables();
  ensureSardPlusTables();
  const [days, library, metas, hl, bm, vc, tags, distinct] = await Promise.all([
    getReadingDays(),
    loadLibraryNovels().catch(() => [] as LibraryNovel[]),
    getAllNovelMeta(),
    countHighlights(),
    bookmarkCounts(),
    vocabCounts(),
    listTags(),
    rows<{ n: number }>('SELECT COUNT(DISTINCT novelId) AS n FROM SardReadingDay WHERE timeSpent > 0 OR chaptersRead > 0'),
  ]);
  const finished = new Set<number>();
  for (const [id, m] of metas) if (m.status === 'finished') finished.add(id);
  for (const n of library) if ((n.totalChapters ?? 0) > 0 && (n.chaptersUnread ?? 0) === 0) finished.add(n.id);
  let rated = 0;
  for (const m of metas.values()) if (m.rating) rated++;
  const counters = countersStore.get();
  return {
    days,
    goalMinutes: getSardReaderSettings().dailyGoalMinutes || 20,
    libraryCount: library.length,
    finishedNovels: finished.size,
    highlights: hl.highlights,
    notes: hl.notes,
    bookmarks: bm.total,
    vocab: vc.total,
    vocabMastered: vc.mastered,
    tags: tags.length,
    ratedNovels: rated,
    exports: counters.exports ?? 0,
    readerModePages: counters.readerModePages ?? 0,
    novelsRead: Number(distinct[0]?.n ?? 0),
    challengesDone: Object.keys(challengesStore.get().done).length,
    bestTierRank: tierRank(getCurrentTier()),
  };
};

/** Raw per-novel per-day rows (wraps, personal challenges). */
export const getNovelDayRows = async (fromDay?: string): Promise<(DayTotal & { novelId: number })[]> => {
  ensureSardReaderTables();
  const list = await rows<any>(
    `SELECT day, novelId, timeSpent, chaptersRead FROM SardReadingDay ${fromDay ? 'WHERE day >= ?' : ''} ORDER BY day`,
    fromDay ? [fromDay] : [],
  );
  return list.map(r => ({
    day: String(r.day),
    novelId: Number(r.novelId),
    timeSpent: Number(r.timeSpent) || 0,
    chaptersRead: Number(r.chaptersRead) || 0,
  }));
};

export const getTodayCounters = async (now = new Date()): Promise<TodayCounters> => {
  ensureSardReaderTables();
  ensureSardPlusTables();
  const day = toDayKey(now);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [d, hl, vc, bm, fresh] = await Promise.all([
    rows<any>('SELECT SUM(timeSpent) AS t, SUM(chaptersRead) AS c FROM SardReadingDay WHERE day = ?', [day]),
    rows<any>('SELECT COUNT(*) AS n FROM SardHighlight WHERE createdAt >= ?', [start]),
    vocabCounts(start),
    bookmarkCounts(start),
    rows<any>('SELECT COUNT(*) AS n FROM (SELECT novelId, MIN(day) AS first FROM SardReadingDay GROUP BY novelId) WHERE first = ?', [day]),
  ]);
  return {
    minutes: Math.floor((Number(d[0]?.t) || 0) / 60000),
    chapters: Number(d[0]?.c) || 0,
    highlights: Number(hl[0]?.n) || 0,
    vocab: vc.recent,
    bookmarks: bm.recent,
    newNovels: Number(fresh[0]?.n) || 0,
  };
};

export const novelNames = async (ids: number[]): Promise<Map<number, string>> => {
  if (!ids.length) return new Map();
  const list = await rows<any>(`SELECT id, name FROM Novel WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  return new Map(list.map(r => [Number(r.id), String(r.name)]));
};

/* ------------------------------------------------------------ offline */
export const downloadedCount = async (): Promise<number> => {
  const r = await dbManager
    .select({ n: sql<number>`COUNT(*)` })
    .from(chapterSchema)
    .where(eq(chapterSchema.isDownloaded, true))
    .get();
  return Number(r?.n ?? 0);
};

const fileUri = (p: string) => (p.startsWith('file://') ? p : `file://${p}`);

export interface NovelStorage {
  novelId: number;
  name: string;
  pluginId: string;
  cover: string | null;
  chapters: number;
  readChapters: number;
  bytes: number | null;
}

export const getStorageByNovel = async (): Promise<{ novels: NovelStorage[]; totalBytes: number; freeBytes: number | null }> => {
  const downloaded = await getDownloadedChapters();
  const map = new Map<number, NovelStorage>();
  for (const c of downloaded) {
    let n = map.get(c.novelId);
    if (!n) {
      n = { novelId: c.novelId, name: c.novelName, pluginId: c.pluginId, cover: c.novelCover, chapters: 0, readChapters: 0, bytes: null };
      map.set(c.novelId, n);
    }
    n.chapters++;
    if (!c.unread) n.readChapters++;
  }
  let total = 0;
  for (const n of map.values()) {
    try {
      const info = await LegacyFS.getInfoAsync(fileUri(`${NOVEL_STORAGE}/${n.pluginId}/${n.novelId}`), { size: true } as any);
      n.bytes = info.exists && typeof (info as any).size === 'number' ? (info as any).size : null;
      total += n.bytes ?? 0;
    } catch {
      n.bytes = null;
    }
  }
  let free: number | null = null;
  try {
    free = await LegacyFS.getFreeDiskStorageAsync();
  } catch {
    free = null;
  }
  return { novels: [...map.values()].sort((a, b) => (b.bytes ?? b.chapters) - (a.bytes ?? a.chapters)), totalBytes: total, freeBytes: free };
};

/** Deletes downloads of read chapters of one novel (or all). */
export const deleteReadDownloads = async (novelId?: number): Promise<number> => {
  const downloaded = (await getDownloadedChapters()).filter(c => !c.unread && (novelId === undefined || c.novelId === novelId));
  return deleteDownloadedGroup(downloaded);
};

const deleteDownloadedGroup = async (list: { id: number; novelId: number; pluginId: string }[]) => {
  const groups = new Map<number, { pluginId: string; ids: number[] }>();
  for (const c of list) {
    const g = groups.get(c.novelId) ?? { pluginId: c.pluginId, ids: [] };
    g.ids.push(c.id);
    groups.set(c.novelId, g);
  }
  for (const [nid, g] of groups) await deleteChapters(g.pluginId, nid, g.ids).catch(() => {});
  return list.length;
};

export const deleteAllDownloadsOfNovel = async (novelId: number) => {
  const downloaded = (await getDownloadedChapters()).filter(c => c.novelId === novelId);
  return deleteDownloadedGroup(downloaded);
};

/** Smart cleanup: downloads of chapters read more than N days ago. */
export const runSmartCleanup = async (s: CleanupSettings, dryRun = false): Promise<number> => {
  const downloaded = await getDownloadedChapters();
  const sardMarked = s.keepBookmarked ? new Set((await listBookmarks()).map(b => b.chapterId)) : new Set<number>();
  const picked = selectForCleanup(
    downloaded.map(c => ({ id: c.id, novelId: c.novelId, unread: !!c.unread, bookmark: !!c.bookmark || sardMarked.has(c.id), readTime: c.readTime })),
    s,
  );
  if (dryRun) return picked.length;
  const ids = new Set(picked.map(p => p.id));
  return deleteDownloadedGroup(downloaded.filter(c => ids.has(c.id)));
};

export const chapterHtmlFile = (pluginId: string, novelId: number, chapterId: number) =>
  `${NOVEL_STORAGE}/${pluginId}/${novelId}/${chapterId}/index.html`;

/** Finds downloaded chapters whose files are missing/empty. `fix` re-queues them. */
export const checkDownloadIntegrity = async (fix = false, onProgress?: (done: number, total: number) => void) => {
  const downloaded = await getDownloadedChapters();
  const broken: typeof downloaded = [];
  for (let i = 0; i < downloaded.length; i++) {
    const c = downloaded[i];
    const path = chapterHtmlFile(c.pluginId, c.novelId, c.id);
    let exists = false;
    let html: string | null = null;
    try {
      exists = await NativeFile.exists(path);
      if (exists) html = await NativeFile.readFile(path);
    } catch {
      exists = false;
    }
    if (isBrokenDownload(exists, html === null ? null : html.length, html)) broken.push(c);
    if (i % 20 === 0) onProgress?.(i, downloaded.length);
  }
  if (fix && broken.length) {
    const ids = broken.map(b => b.id);
    await dbManager.write(async tx => {
      await tx.update(chapterSchema).set({ isDownloaded: false }).where(inArray(chapterSchema.id, ids)).run();
    });
    const byNovel = new Map<number, typeof broken>();
    for (const b of broken) byNovel.set(b.novelId, [...(byNovel.get(b.novelId) ?? []), b]);
    for (const [, list] of byNovel) {
      enqueueChapterDownloads({ id: list[0].novelId, name: list[0].novelName, pluginId: list[0].pluginId }, list);
    }
  }
  return { checked: downloaded.length, broken: broken.length };
};

/** Queues unread, not-yet-downloaded chapters of every novel with a tag. */
export const downloadByTag = async (tagName: string, cap: number): Promise<number> => {
  const metas = await getAllNovelMeta();
  const novelIds = [...metas.values()].filter(m => m.tags?.includes(tagName)).map(m => m.novelId);
  if (!novelIds.length) return 0;
  const library = await loadLibraryNovels();
  const queued = getQueuedChapterIds();
  let room = cap === Infinity ? Infinity : Math.max(0, cap - (await downloadedCount()) - queued.size);
  let total = 0;
  for (const n of library.filter(l => novelIds.includes(l.id))) {
    if (room <= 0) break;
    const chapters = await dbManager
      .select({ id: chapterSchema.id, name: chapterSchema.name })
      .from(chapterSchema)
      .where(and(eq(chapterSchema.novelId, n.id), eq(chapterSchema.unread, true), eq(chapterSchema.isDownloaded, false)))
      .orderBy(chapterSchema.position)
      .all();
    const todo = chapters.filter(c => !queued.has(c.id)).slice(0, room === Infinity ? undefined : room);
    if (!todo.length) continue;
    enqueueChapterDownloads(n, todo);
    total += todo.length;
    if (room !== Infinity) room -= todo.length;
  }
  return total;
};

/* ------------------------------------------------- chapter text (AI) */
export const novelChaptersLite = async (novelId: number) =>
  dbManager
    .select({ id: chapterSchema.id, name: chapterSchema.name, isDownloaded: chapterSchema.isDownloaded, unread: chapterSchema.unread, position: chapterSchema.position })
    .from(chapterSchema)
    .where(eq(chapterSchema.novelId, novelId))
    .orderBy(chapterSchema.position)
    .all();

/** Plain text of a chapter: the downloaded file first, else the installed plugin. */
export const getChapterText = async (novel: { id: number; pluginId: string }, chapterId: number): Promise<string> => {
  const path = chapterHtmlFile(novel.pluginId, novel.id, chapterId);
  try {
    if (await NativeFile.exists(path)) return htmlToText(await NativeFile.readFile(path));
  } catch {
    // fall through to the plugin
  }
  const chapter = await getChapter(chapterId);
  const plugin = getPlugin(novel.pluginId);
  if (!chapter || !plugin) throw new Error('chapter-unavailable');
  return htmlToText(await plugin.parseChapter(chapter.path));
};

/** Text of the last `n` read chapters of a novel (offline recap). */
export const lastReadChaptersText = async (novel: { id: number; pluginId: string }, n = 3) => {
  const list = (await novelChaptersLite(novel.id)).filter(c => !c.unread);
  const last = list.slice(-n);
  const parts: { name: string; text: string }[] = [];
  for (const c of last) {
    try {
      parts.push({ name: c.name, text: await getChapterText(novel, c.id) });
    } catch {
      // skip chapters that cannot be read offline
    }
  }
  return parts;
};

/** Downloaded chapters' text of a novel, for full-text search. */
export const downloadedChaptersText = async (novel: { id: number; pluginId: string }, limit = 400) => {
  const list = (await novelChaptersLite(novel.id)).filter(c => c.isDownloaded).slice(0, limit);
  const out: { id: number; name: string; text: string }[] = [];
  for (const c of list) {
    try {
      out.push({ id: c.id, name: c.name, text: htmlToText(await NativeFile.readFile(chapterHtmlFile(novel.pluginId, novel.id, c.id))) });
    } catch {
      // ignore unreadable files
    }
  }
  return out;
};
