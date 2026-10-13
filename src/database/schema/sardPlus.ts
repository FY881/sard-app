/**
 * Sard 1.1 tables (bookmarks with notes, vocabulary, per-novel meta, tags).
 * Migration: drizzle/20261013120000_sard_plus/migration.sql (all IF NOT EXISTS);
 * `ensureSardPlusTables()` (src/sard/plus/db.ts) runs the same DDL lazily.
 */
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const sardBookmark = sqliteTable(
  'SardBookmark',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    novelId: integer('novelId').notNull(),
    chapterId: integer('chapterId').notNull(),
    novelName: text('novelName'),
    chapterName: text('chapterName'),
    /** 0..1 scroll / page position inside the chapter */
    progress: real('progress').notNull().default(0),
    excerpt: text('excerpt'),
    note: text('note'),
    createdAt: integer('createdAt').notNull(),
  },
  t => [index('sard_bookmark_novel_idx').on(t.novelId, t.createdAt), index('sard_bookmark_chapter_idx').on(t.chapterId)],
);

export const sardVocab = sqliteTable(
  'SardVocab',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    word: text('word').notNull(),
    normalized: text('normalized').notNull(),
    sentence: text('sentence'),
    meaning: text('meaning'),
    novelId: integer('novelId'),
    novelName: text('novelName'),
    chapterId: integer('chapterId'),
    box: integer('box').notNull().default(1),
    dueAt: integer('dueAt').notNull(),
    createdAt: integer('createdAt').notNull(),
    reviewedAt: integer('reviewedAt'),
  },
  t => [uniqueIndex('sard_vocab_normalized_unique').on(t.normalized)],
);

export const sardNovelMeta = sqliteTable('SardNovelMeta', {
  novelId: integer('novelId').primaryKey(),
  status: text('status'),
  rating: integer('rating'),
  note: text('note'),
  updatedAt: integer('updatedAt'),
});

export const sardTag = sqliteTable(
  'SardTag',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: integer('createdAt'),
  },
  t => [uniqueIndex('sard_tag_name_unique').on(t.name)],
);

export const sardNovelTag = sqliteTable(
  'SardNovelTag',
  {
    novelId: integer('novelId').notNull(),
    tagId: integer('tagId').notNull(),
  },
  t => [primaryKey({ columns: [t.novelId, t.tagId] }), index('sard_novel_tag_tag_idx').on(t.tagId)],
);

export type SardBookmarkRow = typeof sardBookmark.$inferSelect;
export type SardVocabRow = typeof sardVocab.$inferSelect;
export type SardNovelMetaRow = typeof sardNovelMeta.$inferSelect;
export type SardTagRow = typeof sardTag.$inferSelect;
