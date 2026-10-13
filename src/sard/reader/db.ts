/**
 * Data access for the Sard reader tables (highlights + daily reading log).
 */
import { and, asc, desc, eq, gte, inArray, like, lte, or, sql } from 'drizzle-orm';
import { db, dbManager } from '@database/db';
import {
  sardHighlight,
  sardReadingDay,
  type SardHighlightRow,
} from '@database/schema/sardReader';
import { MMKVStorage } from '@utils/mmkv/mmkv';
// Same DDL as the drizzle migration (single source of truth, all IF NOT EXISTS).
import migrationSql from '../../../drizzle/20261011150000_sard_reader/migration.sql';
import { DayTotal, toDayKey } from './streaks';
import type { HighlightColor } from './settings';

const BACKFILL_KEY = 'SARD_READING_DAY_BACKFILLED';
let ensured = false;

/** Idempotently creates the tables (safety net before migration registration). */
export const ensureSardReaderTables = () => {
  if (ensured) return;
  const statements = String(migrationSql)
    .split('--> statement-breakpoint')
    .map(s => s.trim())
    .filter(Boolean);
  for (const s of statements) {
    if (/^INSERT/i.test(s)) {
      // One-time backfill of the daily log from LNReader's chapter history.
      if (!MMKVStorage.getBoolean(BACKFILL_KEY)) {
        try {
          db.executeSync(s);
        } catch {
          // Chapter table not there yet – nothing to backfill.
        }
        MMKVStorage.set(BACKFILL_KEY, true);
      }
      continue;
    }
    db.executeSync(s);
  }
  ensured = true;
};

/* -------------------------------------------------------------------------- */
/* Reading log                                                                */
/* -------------------------------------------------------------------------- */

/** Adds reading time to today's row for a novel. */
export const recordReadingTime = async (
  novelId: number,
  ms: number,
  when: Date = new Date(),
) => {
  if (!Number.isFinite(ms) || ms <= 0 || !novelId) return;
  ensureSardReaderTables();
  const day = toDayKey(when);
  const amount = Math.round(ms);
  const now = Date.now();
  await dbManager.write(async tx => {
    await tx
      .insert(sardReadingDay)
      .values({ day, novelId, timeSpent: amount, chaptersRead: 0, updatedAt: now })
      .onConflictDoUpdate({
        target: [sardReadingDay.day, sardReadingDay.novelId],
        set: {
          timeSpent: sql`${sardReadingDay.timeSpent} + ${amount}`,
          updatedAt: now,
        },
      })
      .run();
  });
};

/** Counts a finished chapter towards today's row. */
export const recordChapterFinished = async (
  novelId: number,
  when: Date = new Date(),
) => {
  if (!novelId) return;
  ensureSardReaderTables();
  const day = toDayKey(when);
  const now = Date.now();
  await dbManager.write(async tx => {
    await tx
      .insert(sardReadingDay)
      .values({ day, novelId, timeSpent: 0, chaptersRead: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: [sardReadingDay.day, sardReadingDay.novelId],
        set: {
          chaptersRead: sql`${sardReadingDay.chaptersRead} + 1`,
          updatedAt: now,
        },
      })
      .run();
  });
};

/** Totals per day (all novels), optionally bounded. */
export const getReadingDays = async (
  fromDay?: string,
  toDay?: string,
): Promise<DayTotal[]> => {
  ensureSardReaderTables();
  const conds = [];
  if (fromDay) conds.push(gte(sardReadingDay.day, fromDay));
  if (toDay) conds.push(lte(sardReadingDay.day, toDay));
  const rows = await dbManager
    .select({
      day: sardReadingDay.day,
      timeSpent: sql<number>`SUM(${sardReadingDay.timeSpent})`,
      chaptersRead: sql<number>`SUM(${sardReadingDay.chaptersRead})`,
      novels: sql<number>`COUNT(DISTINCT ${sardReadingDay.novelId})`,
    })
    .from(sardReadingDay)
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(sardReadingDay.day)
    .orderBy(asc(sardReadingDay.day))
    .all();
  return rows.map((r: any) => ({
    day: r.day,
    timeSpent: Number(r.timeSpent) || 0,
    chaptersRead: Number(r.chaptersRead) || 0,
    novels: Number(r.novels) || 0,
  }));
};

/** Years that have any reading recorded, newest first. */
export const getReadingYears = async (): Promise<number[]> => {
  ensureSardReaderTables();
  const rows = await dbManager
    .select({ y: sql<string>`substr(${sardReadingDay.day}, 1, 4)` })
    .from(sardReadingDay)
    .groupBy(sql`substr(${sardReadingDay.day}, 1, 4)`)
    .all();
  return rows
    .map((r: any) => Number(r.y))
    .filter((n: number) => Number.isFinite(n))
    .sort((a: number, b: number) => b - a);
};

export interface TopNovelOfPeriod {
  novelId: number;
  name: string | null;
  cover: string | null;
  timeSpent: number;
  chaptersRead: number;
}

/** Most-read novels in a period (joins the LNReader Novel table). */
export const getTopNovelsForPeriod = async (
  fromDay: string,
  toDay: string,
  limit = 5,
): Promise<TopNovelOfPeriod[]> => {
  ensureSardReaderTables();
  const res = await db.execute(
    `SELECT d.novelId AS novelId, n.name AS name, n.cover AS cover,
            SUM(d.timeSpent) AS timeSpent, SUM(d.chaptersRead) AS chaptersRead
       FROM SardReadingDay d LEFT JOIN Novel n ON n.id = d.novelId
      WHERE d.day >= ? AND d.day <= ?
      GROUP BY d.novelId
      ORDER BY SUM(d.timeSpent) DESC
      LIMIT ?`,
    [fromDay, toDay, limit],
  );
  return ((res as any)?.rows ?? []).map((r: any) => ({
    novelId: Number(r.novelId),
    name: r.name ?? null,
    cover: r.cover ?? null,
    timeSpent: Number(r.timeSpent) || 0,
    chaptersRead: Number(r.chaptersRead) || 0,
  }));
};

/* -------------------------------------------------------------------------- */
/* Highlights                                                                 */
/* -------------------------------------------------------------------------- */

export interface NewHighlight {
  novelId: number;
  chapterId: number;
  novelName?: string | null;
  novelCover?: string | null;
  pluginId?: string | null;
  novelPath?: string | null;
  chapterName?: string | null;
  chapterPath?: string | null;
  text: string;
  note?: string | null;
  color: HighlightColor;
  startOffset: number;
  endOffset: number;
  prefix?: string | null;
  suffix?: string | null;
}

export const addHighlight = async (h: NewHighlight): Promise<SardHighlightRow> => {
  ensureSardReaderTables();
  const now = Date.now();
  return dbManager.write(async tx =>
    tx
      .insert(sardHighlight)
      .values({
        ...h,
        text: h.text.slice(0, 20000),
        note: h.note?.trim() || null,
        orphaned: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get(),
  );
};

export const updateHighlight = async (
  id: number,
  values: { note?: string | null; color?: HighlightColor },
) => {
  ensureSardReaderTables();
  const set: Record<string, unknown> = { updatedAt: Date.now() };
  if (values.color) set.color = values.color;
  if (values.note !== undefined) set.note = values.note?.trim() || null;
  await dbManager.write(async tx => {
    await tx.update(sardHighlight).set(set).where(eq(sardHighlight.id, id)).run();
  });
};

export const deleteHighlights = async (ids: number[]) => {
  if (!ids.length) return;
  ensureSardReaderTables();
  await dbManager.write(async tx => {
    await tx.delete(sardHighlight).where(inArray(sardHighlight.id, ids)).run();
  });
};

export const deleteHighlight = async (id: number) => deleteHighlights([id]);

export const markHighlightsOrphaned = async (ids: number[], orphaned = true) => {
  if (!ids.length) return;
  ensureSardReaderTables();
  await dbManager.write(async tx => {
    await tx
      .update(sardHighlight)
      .set({ orphaned })
      .where(inArray(sardHighlight.id, ids))
      .run();
  });
};

export const getChapterHighlights = async (
  chapterId: number,
): Promise<SardHighlightRow[]> => {
  ensureSardReaderTables();
  return dbManager
    .select()
    .from(sardHighlight)
    .where(eq(sardHighlight.chapterId, chapterId))
    .orderBy(asc(sardHighlight.startOffset))
    .all();
};

export interface HighlightQuery {
  novelId?: number;
  color?: HighlightColor;
  onlyNotes?: boolean;
  search?: string;
  sort?: 'newest' | 'oldest' | 'position';
}

export const listHighlights = async (
  q: HighlightQuery = {},
): Promise<SardHighlightRow[]> => {
  ensureSardReaderTables();
  const conds = [];
  if (q.novelId) conds.push(eq(sardHighlight.novelId, q.novelId));
  if (q.color) conds.push(eq(sardHighlight.color, q.color));
  if (q.onlyNotes) {
    conds.push(sql`${sardHighlight.note} IS NOT NULL AND ${sardHighlight.note} != ''`);
  }
  const term = q.search?.trim();
  if (term) {
    const pattern = `%${term}%`;
    conds.push(
      or(
        like(sardHighlight.text, pattern),
        like(sardHighlight.note, pattern),
        like(sardHighlight.novelName, pattern),
        like(sardHighlight.chapterName, pattern),
      ),
    );
  }
  const order =
    q.sort === 'oldest'
      ? [asc(sardHighlight.createdAt)]
      : q.sort === 'position'
        ? [
            asc(sardHighlight.novelId),
            asc(sardHighlight.chapterId),
            asc(sardHighlight.startOffset),
          ]
        : [desc(sardHighlight.createdAt)];
  return dbManager
    .select()
    .from(sardHighlight)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...order)
    .all();
};

export const countHighlights = async (): Promise<{ highlights: number; notes: number }> => {
  ensureSardReaderTables();
  const row = await dbManager
    .select({
      highlights: sql<number>`COUNT(*)`,
      notes: sql<number>`SUM(CASE WHEN ${sardHighlight.note} IS NOT NULL AND ${sardHighlight.note} != '' THEN 1 ELSE 0 END)`,
    })
    .from(sardHighlight)
    .get();
  return {
    highlights: Number(row?.highlights) || 0,
    notes: Number(row?.notes) || 0,
  };
};

export type { SardHighlightRow };
