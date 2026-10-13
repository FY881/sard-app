/**
 * Sard reader tables (additive; owned by the reader track).
 * Migration: drizzle/20261011150000_sard_reader/migration.sql
 * Every statement is `IF NOT EXISTS`, and `ensureSardReaderTables()`
 * (src/sard/reader/db.ts) runs the same DDL lazily, so the features work
 * even before the migration is registered in drizzle/migrations.js.
 */
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

/** A highlighted passage (optionally with a note) inside a chapter. */
export const sardHighlight = sqliteTable(
  'SardHighlight',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    novelId: integer('novelId').notNull(),
    chapterId: integer('chapterId').notNull(),
    /** Snapshots so the list survives novels/chapters being removed. */
    novelName: text('novelName'),
    novelCover: text('novelCover'),
    pluginId: text('pluginId'),
    novelPath: text('novelPath'),
    chapterName: text('chapterName'),
    chapterPath: text('chapterPath'),
    text: text('text').notNull(),
    note: text('note'),
    color: text('color').notNull().default('yellow'),
    /** Offsets in the normalised chapter text (no harakat/tatweel, western digits). */
    startOffset: integer('startOffset').notNull(),
    endOffset: integer('endOffset').notNull(),
    prefix: text('prefix'),
    suffix: text('suffix'),
    /** Set when the passage can no longer be located in the chapter text. */
    orphaned: integer('orphaned', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('createdAt').notNull(),
    updatedAt: integer('updatedAt').notNull(),
  },
  table => [
    index('sard_highlight_chapter_idx').on(table.chapterId),
    index('sard_highlight_novel_idx').on(table.novelId, table.createdAt),
  ],
);

/** Reading time per local calendar day and novel (goals, streaks, wrap). */
export const sardReadingDay = sqliteTable(
  'SardReadingDay',
  {
    /** Local day, YYYY-MM-DD. */
    day: text('day').notNull(),
    novelId: integer('novelId').notNull(),
    /** Milliseconds. */
    timeSpent: integer('timeSpent').notNull().default(0),
    chaptersRead: integer('chaptersRead').notNull().default(0),
    updatedAt: integer('updatedAt'),
  },
  table => [
    primaryKey({ columns: [table.day, table.novelId] }),
    index('sard_reading_day_day_idx').on(table.day),
  ],
);

export type SardHighlightRow = typeof sardHighlight.$inferSelect;
export type SardHighlightInsert = typeof sardHighlight.$inferInsert;
export type SardReadingDayRow = typeof sardReadingDay.$inferSelect;
