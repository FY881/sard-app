/**
 * Saves a reader-mode page the user chose to keep as a chapter of one local
 * novel («صفحات محفوظة من الويب»). Uses the existing local-novel storage
 * layout (NOVEL_STORAGE/local/<novelId>/<chapterId>/index.html), so the page
 * opens in the regular reader, works offline, and can be exported. Nothing
 * here changes the database schema.
 */
import dayjs from 'dayjs';
import { and, eq } from 'drizzle-orm';

import NativeFile from '@modules/native-file';
import { dbManager } from '@database/db';
import { chapterSchema, novelSchema } from '@database/schema';
import { getChapter } from '@database/queries/ChapterQueries';
import {
  getNovelById,
  updateNovelCategoryById,
} from '@database/queries/NovelQueries';
import { NOVEL_STORAGE } from '@utils/Storages';
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import type { ChapterInfo, NovelInfo } from '@database/types';

import { buildSavedPageHtml } from './savedPageHtml';
import { readerModeStrings as S } from '../export/strings';
import type { ExtractedArticle } from './extract';

const NOVEL_ID_KEY = 'SARD_SAVED_WEB_PAGES_NOVEL_ID';
const DEFAULT_CATEGORY_ID = 2;

const ensureSavedPagesNovel = async (): Promise<number> => {
  const known = getMMKVObject<number>(NOVEL_ID_KEY);
  if (known && getNovelById(known)) {
    return known;
  }
  const { insertId } = await dbManager.write(async tx =>
    tx
      .insert(novelSchema)
      .values({
        name: S.savedNovelName,
        path: `sard-saved-web-pages-${Date.now()}`,
        pluginId: 'local',
        inLibrary: true,
        isLocal: true,
      })
      .run(),
  );
  if (insertId === undefined || insertId < 0) {
    throw new Error('novel insert failed');
  }
  const dir = `${NOVEL_STORAGE}/local/${insertId}`;
  await NativeFile.mkdir(dir);
  await dbManager.write(async tx =>
    tx
      .update(novelSchema)
      .set({
        path: dir,
        summary: S.savedNovelSummary,
        author: 'سَرد',
        totalPages: 0,
      })
      .where(eq(novelSchema.id, insertId))
      .run(),
  );
  try {
    await updateNovelCategoryById(insertId, [DEFAULT_CATEGORY_ID]);
  } catch {
    // Category assignment is cosmetic; the novel is still in the library.
  }
  setMMKVObject(NOVEL_ID_KEY, insertId);
  return insertId;
};

export interface SavedPage {
  novel: NovelInfo;
  chapter: ChapterInfo;
}

export const savePageAsChapter = async (
  article: ExtractedArticle,
): Promise<SavedPage> => {
  const novelId = await ensureSavedPagesNovel();

  // Same page saved again: update its content instead of duplicating it.
  // The source url lives in the scanlator column (unused for local novels).
  const existing = await dbManager
    .select()
    .from(chapterSchema)
    .where(
      and(
        eq(chapterSchema.novelId, novelId),
        eq(chapterSchema.scanlator, article.url),
      ),
    )
    .get();

  let chapterId: number;
  if (existing) {
    chapterId = existing.id;
    await dbManager.write(async tx =>
      tx
        .update(chapterSchema)
        .set({ name: article.title, isDownloaded: true })
        .where(eq(chapterSchema.id, chapterId))
        .run(),
    );
  } else {
    const rows = await dbManager
      .select({ id: chapterSchema.id })
      .from(chapterSchema)
      .where(eq(chapterSchema.novelId, novelId))
      .all();
    const { insertId } = await dbManager.write(async tx =>
      tx
        .insert(chapterSchema)
        .values({
          novelId,
          name: article.title,
          path: `${NOVEL_STORAGE}/local/${novelId}/web-${Date.now()}`,
          releaseTime: dayjs().toISOString(),
          position: rows.length,
          scanlator: article.url,
          isDownloaded: true,
        })
        .run(),
    );
    if (insertId === undefined || insertId < 0) {
      throw new Error('chapter insert failed');
    }
    chapterId = insertId;
  }

  const dir = `${NOVEL_STORAGE}/local/${novelId}/${chapterId}`;
  await NativeFile.mkdir(dir);
  await NativeFile.writeFile(`${dir}/index.html`, buildSavedPageHtml(article));

  const novel = getNovelById(novelId);
  const chapter = await getChapter(chapterId);
  if (!novel || !chapter) {
    throw new Error('saved page not found');
  }
  return { novel, chapter };
};
