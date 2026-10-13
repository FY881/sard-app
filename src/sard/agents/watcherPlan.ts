/**
 * Chapter Watcher planning (pure): which chapters to auto-download.
 * Keeps a buffer of the next N unread chapters downloaded after the reader's
 * furthest-read chapter, honouring Wi-Fi-only.
 */
import {
  orderChapters,
  readCutoffIndex,
  type ChapterLite,
} from '../ai/spoiler';

export type ConnectionKind =
  | 'wifi'
  | 'ethernet'
  | 'cellular'
  | 'none'
  | 'unknown';

export interface WatcherNovelSetting {
  autoDownload: boolean;
  autoDownloadCount: number;
  wifiOnly: boolean;
}

export type WatcherSkip =
  | 'disabled'
  | 'offline'
  | 'not_wifi'
  | 'unknown_network';

export const connectionAllows = (
  kind: ConnectionKind,
  wifiOnly: boolean,
): { ok: true } | { ok: false; reason: WatcherSkip } => {
  if (kind === 'none') return { ok: false, reason: 'offline' };
  if (!wifiOnly) return { ok: true };
  if (kind === 'wifi' || kind === 'ethernet') return { ok: true };
  if (kind === 'unknown') return { ok: false, reason: 'unknown_network' };
  return { ok: false, reason: 'not_wifi' };
};

export const planAutoDownload = <T extends ChapterLite>(
  chapters: T[],
  setting: WatcherNovelSetting,
  queuedChapterIds: Set<number> = new Set(),
): T[] => {
  if (!setting.autoDownload || setting.autoDownloadCount <= 0) return [];
  const ordered = orderChapters(chapters);
  const cutoff = readCutoffIndex(ordered);
  const ahead = ordered.slice(
    cutoff + 1,
    cutoff + 1 + setting.autoDownloadCount,
  );
  return ahead.filter(c => !c.isDownloaded && !queuedChapterIds.has(c.id));
};

/** For «نزّل آخر N فصل» / «الفصول التالية» from the agent chat. */
export const pickChaptersToDownload = <T extends ChapterLite>(
  chapters: T[],
  which: 'latest' | 'next' | 'all',
  count: number | undefined,
  queuedChapterIds: Set<number> = new Set(),
): T[] => {
  const ordered = orderChapters(chapters);
  const notDownloaded = (c: T) =>
    !c.isDownloaded && !queuedChapterIds.has(c.id);
  if (which === 'all') return ordered.filter(notDownloaded);
  const n = Math.max(1, count ?? 10);
  if (which === 'latest') {
    return ordered.slice(Math.max(0, ordered.length - n)).filter(notDownloaded);
  }
  const cutoff = readCutoffIndex(ordered);
  return ordered.slice(cutoff + 1, cutoff + 1 + n).filter(notDownloaded);
};
