/**
 * Sard AI + agents tables (additive; owned by the AI track).
 * Migration: drizzle/20261011140000_sard_ai_agents/migration.sql
 * All statements are `IF NOT EXISTS`, and `ensureSardAiTables()`
 * (src/sard/ai/db.ts) runs the same DDL lazily, so features keep working even
 * before the migration is registered.
 */
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** Cached AI outputs: recaps, chapter/volume summaries, glossary progress. */
export const sardAiCache = sqliteTable(
  'SardAiCache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    novelId: integer('novelId').notNull(),
    kind: text('kind').notNull(),
    cacheKey: text('cacheKey').notNull(),
    content: text('content').notNull(),
    /** Reading-order index of the last chapter that fed this output. */
    upToOrder: integer('upToOrder'),
    model: text('model'),
    createdAt: integer('createdAt').notNull(),
  },
  table => [
    uniqueIndex('sard_ai_cache_unique').on(
      table.novelId,
      table.kind,
      table.cacheKey,
    ),
  ],
);

/** Spoiler-safe glossary entries (history keeps per-cutoff descriptions). */
export const sardGlossaryEntry = sqliteTable(
  'SardGlossaryEntry',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    novelId: integer('novelId').notNull(),
    name: text('name').notNull(),
    normalizedName: text('normalizedName').notNull(),
    category: text('category').notNull().default('term'),
    aliases: text('aliases').notNull().default('[]'),
    history: text('history').notNull().default('[]'),
    firstSeenOrder: integer('firstSeenOrder').notNull().default(0),
    firstSeenChapterName: text('firstSeenChapterName'),
    lastSeenOrder: integer('lastSeenOrder').notNull().default(0),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updatedAt').notNull(),
  },
  table => [
    uniqueIndex('sard_glossary_novel_name_unique').on(
      table.novelId,
      table.normalizedName,
    ),
  ],
);

/** Per-novel agent options (Chapter Watcher auto-download). */
export const sardNovelAgent = sqliteTable('SardNovelAgent', {
  novelId: integer('novelId').primaryKey(),
  autoDownload: integer('autoDownload', { mode: 'boolean' })
    .notNull()
    .default(false),
  autoDownloadCount: integer('autoDownloadCount').notNull().default(5),
  wifiOnly: integer('wifiOnly', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('lastRunAt'),
  lastQueuedCount: integer('lastQueuedCount'),
});

/** Activity log shown in «سجل الوكلاء». */
export const sardAgentLog = sqliteTable(
  'SardAgentLog',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agent: text('agent').notNull(),
    action: text('action').notNull(),
    detail: text('detail'),
    novelId: integer('novelId'),
    createdAt: integer('createdAt').notNull(),
  },
  table => [index('sard_agent_log_created_idx').on(table.createdAt)],
);

/** Persisted chat threads ('agent' or 'ask:<novelId>'). */
export const sardChatMessage = sqliteTable(
  'SardChatMessage',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    thread: text('thread').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    payload: text('payload'),
    createdAt: integer('createdAt').notNull(),
  },
  table => [index('sard_chat_thread_idx').on(table.thread, table.createdAt)],
);

export type SardAiCacheRow = typeof sardAiCache.$inferSelect;
export type SardGlossaryEntryRow = typeof sardGlossaryEntry.$inferSelect;
export type SardNovelAgentRow = typeof sardNovelAgent.$inferSelect;
export type SardAgentLogRow = typeof sardAgentLog.$inferSelect;
export type SardChatMessageRow = typeof sardChatMessage.$inferSelect;
