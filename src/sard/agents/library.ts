/**
 * Library data access shared by the agents (device only).
 * Reuses LNReader queries and its background task queue.
 */
import { and, eq, sql } from 'drizzle-orm';
import { dbManager } from '@database/db';
import { chapterSchema } from '@database/schema';
import { getLibraryNovelsFromDb } from '@database/queries/LibraryQueries';
import {
  BACKGROUND_TASKS_STORE_KEY,
  backgroundTasks,
  type QueuedBackgroundTask,
} from '@services/backgroundTasks';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import type { ChapterInfo, DBNovelInfo } from '@database/types';
import type { ShelfNovel } from './shelves';

export type LibraryNovel = DBNovelInfo;

export const loadLibraryNovels = async (): Promise<LibraryNovel[]> =>
  (await getLibraryNovelsFromDb()) as LibraryNovel[];

const loadUnreadDownloadedCounts = async () => {
  const rows = await dbManager
    .select({
      novelId: chapterSchema.novelId,
      n: sql<number>`count(*)`,
    })
    .from(chapterSchema)
    .where(
      and(eq(chapterSchema.unread, true), eq(chapterSchema.isDownloaded, true)),
    )
    .groupBy(chapterSchema.novelId)
    .all();
  return new Map(rows.map(r => [r.novelId, Number(r.n) || 0]));
};

export const loadShelfNovels = async (): Promise<ShelfNovel[]> => {
  const [novels, unreadDl] = await Promise.all([
    loadLibraryNovels(),
    loadUnreadDownloadedCounts(),
  ]);
  return novels.map(n => ({
    id: n.id,
    name: n.name,
    pluginId: n.pluginId,
    path: n.path,
    cover: n.cover,
    status: n.status,
    totalChapters: n.totalChapters ?? 0,
    chaptersUnread: n.chaptersUnread ?? 0,
    chaptersDownloaded: n.chaptersDownloaded ?? 0,
    unreadDownloaded: unreadDl.get(n.id) ?? 0,
    lastReadAt: n.lastReadAt,
  }));
};

/** Chapter ids already waiting in LNReader's download queue. */
export const getQueuedChapterIds = (): Set<number> => {
  const queue =
    getMMKVObject<QueuedBackgroundTask[]>(BACKGROUND_TASKS_STORE_KEY) ?? [];
  const ids = new Set<number>();
  for (const item of queue) {
    if (item?.task?.name !== 'DOWNLOAD_CHAPTER') continue;
    for (const c of item.task.data.chapters) ids.add(c.chapterId);
  }
  return ids;
};

const MAX_PER_TASK = 100;

/** Enqueues downloads through LNReader's own background queue. */
export const enqueueChapterDownloads = (
  novel: { id: number; name: string; pluginId: string },
  chapters: Pick<ChapterInfo, 'id' | 'name'>[],
) => {
  for (let i = 0; i < chapters.length; i += MAX_PER_TASK) {
    backgroundTasks.enqueue({
      name: 'DOWNLOAD_CHAPTER',
      data: {
        novelName: novel.name,
        novelId: novel.id,
        pluginId: novel.pluginId,
        chapters: chapters.slice(i, i + MAX_PER_TASK).map(c => ({
          chapterId: c.id,
          chapterName: c.name,
          novelId: novel.id,
        })),
      },
    });
  }
  return chapters.length;
};

export const startLibraryUpdate = () =>
  backgroundTasks.enqueue({ name: 'UPDATE_LIBRARY' });
