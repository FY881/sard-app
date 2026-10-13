import { category } from './category';
import { novel } from './novel';
import { chapter } from './chapter';
import { novelCategory } from './novelCategory';
import { repository } from './repository';
import {
  sardAiCache,
  sardGlossaryEntry,
  sardNovelAgent,
  sardAgentLog,
  sardChatMessage,
} from './sardAi';
import { sardHighlight, sardReadingDay } from './sardReader';
import { sardBookmark, sardNovelMeta, sardNovelTag, sardTag, sardVocab } from './sardPlus';

export {
  category as categorySchema,
  type CategoryRow,
  type CategoryInsert,
} from './category';
export { novel as novelSchema, type NovelRow, type NovelInsert } from './novel';
export {
  chapter as chapterSchema,
  type ChapterRow,
  type ChapterInsert,
} from './chapter';
export {
  novelCategory as novelCategorySchema,
  type NovelCategoryRow,
  type NovelCategoryInsert,
} from './novelCategory';
export {
  repository as repositorySchema,
  type RepositoryRow,
  type RepositoryInsert,
} from './repository';

export * from './sardAi';
export * from './sardReader';
export * from './sardPlus';

/**
 * Unified schema object containing all database tables
 * Use this with Drizzle ORM for type-safe database operations
 */
export const schema = {
  category,
  novel,
  chapter,
  novelCategory,
  repository,
  sardAiCache,
  sardGlossaryEntry,
  sardNovelAgent,
  sardAgentLog,
  sardChatMessage,
  sardHighlight,
  sardReadingDay,
  sardBookmark,
  sardVocab,
  sardNovelMeta,
  sardTag,
  sardNovelTag,
} as const;

export type Schema = typeof schema;
