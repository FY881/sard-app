/**
 * What the reader is showing right now (novel, chapter, scroll progress),
 * kept in memory so the «سَرد+» reader tab can bookmark the current spot,
 * plus one-shot "open this chapter at this position" jumps for bookmarks.
 */
import { create } from 'zustand';

export interface ReaderSessionState {
  novelId?: number;
  novelName?: string;
  pluginId?: string;
  novelPath?: string;
  novelCover?: string | null;
  chapterId?: number;
  chapterName?: string;
  chapterPath?: string;
  /** 0..1 */
  progress: number;
  /** words in the chapter (reading time) */
  words: number;
  /** a short text near the current position (bookmark excerpt) */
  excerpt?: string;
  openedAt: number;
}

export const useReaderSession = create<ReaderSessionState>(() => ({ progress: 0, words: 0, openedAt: 0 }));

export const setReaderSession = (patch: Partial<ReaderSessionState>) => useReaderSession.setState(patch);

let jump: { chapterId: number; progress: number; at: number } | null = null;

export const requestProgressJump = (chapterId: number, progress: number) => {
  jump = { chapterId, progress: Math.min(1, Math.max(0, progress)), at: Date.now() };
};

export const takeProgressJump = (chapterId: number, now = Date.now()): number | undefined => {
  if (!jump || jump.chapterId !== chapterId) return undefined;
  const p = now - jump.at < 120_000 ? jump.progress : undefined;
  jump = null;
  return p;
};
