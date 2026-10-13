/**
 * Loads chapter text for AI features (device only).
 * Downloaded chapters are read from disk. Network fetching through the
 * novel's own installed plugin happens only when the caller explicitly allows
 * it (e.g. the user asked to summarise a chapter that is not downloaded).
 */
import NativeFile from '@modules/native-file';
import { NOVEL_STORAGE } from '@utils/Storages';
import { getPlugin } from '@plugins/pluginManager';
import { htmlToPlainText } from './text';

const MAX_CACHE = 60;
const cache = new Map<number, string>();

const remember = (id: number, text: string) => {
  cache.delete(id);
  cache.set(id, text);
  while (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
};

export const chapterFilePath = (
  pluginId: string,
  novelId: number,
  chapterId: number,
) => `${NOVEL_STORAGE}/${pluginId}/${novelId}/${chapterId}/index.html`;

export const loadChapterPlainText = async (
  novel: { id: number; pluginId: string },
  chapter: { id: number; path: string; isDownloaded?: boolean | null },
  options: { allowNetwork?: boolean } = {},
): Promise<string | undefined> => {
  const hit = cache.get(chapter.id);
  if (hit !== undefined) return hit;
  try {
    const html = await NativeFile.readFile(
      chapterFilePath(novel.pluginId, novel.id, chapter.id),
    );
    const text = htmlToPlainText(html);
    if (text) {
      remember(chapter.id, text);
      return text;
    }
  } catch {
    // not on disk
  }
  if (!options.allowNetwork) return undefined;
  const plugin = getPlugin(novel.pluginId);
  if (!plugin) return undefined;
  const html = await plugin.parseChapter(chapter.path);
  const text = htmlToPlainText(html ?? '');
  if (text) remember(chapter.id, text);
  return text || undefined;
};

export const clearChapterTextCache = () => cache.clear();
