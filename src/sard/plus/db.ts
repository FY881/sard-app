/** Data access for Sard 1.1 tables: bookmarks, vocabulary, novel meta, tags. */
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db, dbManager } from '@database/db';
import {
  sardBookmark,
  sardNovelMeta,
  sardNovelTag,
  sardTag,
  sardVocab,
  type SardBookmarkRow,
  type SardNovelMetaRow,
  type SardTagRow,
  type SardVocabRow,
} from '@database/schema/sardPlus';
import migrationSql from '../../../drizzle/20261013120000_sard_plus/migration.sql';
import { cleanTag, colorForTag, type NovelMeta, type ReadingStatus } from './logic/library';
import { MAX_BOX, nextReview, normalizeWord } from './logic/vocab';
import { hiddenStore } from './store';

let ensured = false;
/** Tests create a fresh database per case. */
export const resetSardPlusTablesFlag = () => {
  ensured = false;
};
export const ensureSardPlusTables = () => {
  if (ensured) return;
  for (const s of String(migrationSql).split('--> statement-breakpoint').map(x => x.trim()).filter(Boolean)) {
    db.executeSync(s);
  }
  ensured = true;
};

/* ----------------------------------------------------------- bookmarks */
export const addBookmark = async (b: {
  novelId: number;
  chapterId: number;
  novelName?: string;
  chapterName?: string;
  progress: number;
  excerpt?: string;
  note?: string;
}): Promise<SardBookmarkRow> => {
  ensureSardPlusTables();
  return dbManager.write(async tx =>
    tx
      .insert(sardBookmark)
      .values({
        ...b,
        progress: Math.min(1, Math.max(0, b.progress || 0)),
        excerpt: b.excerpt?.slice(0, 400) || null,
        note: b.note?.trim() || null,
        createdAt: Date.now(),
      })
      .returning()
      .get(),
  );
};

export const updateBookmarkNote = async (id: number, note: string) => {
  ensureSardPlusTables();
  await dbManager.write(async tx => {
    await tx.update(sardBookmark).set({ note: note.trim() || null }).where(eq(sardBookmark.id, id)).run();
  });
};

export const deleteBookmark = async (id: number) => {
  ensureSardPlusTables();
  await dbManager.write(async tx => {
    await tx.delete(sardBookmark).where(eq(sardBookmark.id, id)).run();
  });
};

export const listBookmarks = async (novelId?: number): Promise<SardBookmarkRow[]> => {
  ensureSardPlusTables();
  return dbManager
    .select()
    .from(sardBookmark)
    .where(novelId ? eq(sardBookmark.novelId, novelId) : undefined)
    .orderBy(desc(sardBookmark.createdAt))
    .all();
};

export const chapterBookmarks = async (chapterId: number): Promise<SardBookmarkRow[]> => {
  ensureSardPlusTables();
  return dbManager.select().from(sardBookmark).where(eq(sardBookmark.chapterId, chapterId)).orderBy(asc(sardBookmark.progress)).all();
};

/* ---------------------------------------------------------- vocabulary */
export const addVocab = async (v: {
  word: string;
  sentence?: string;
  meaning?: string;
  novelId?: number;
  novelName?: string;
  chapterId?: number;
}): Promise<{ row: SardVocabRow; existed: boolean }> => {
  ensureSardPlusTables();
  const normalized = normalizeWord(v.word);
  if (!normalized) throw new Error('empty-word');
  const existing = await dbManager.select().from(sardVocab).where(eq(sardVocab.normalized, normalized)).get();
  if (existing) return { row: existing, existed: true };
  const now = Date.now();
  const row = await dbManager.write(async tx =>
    tx
      .insert(sardVocab)
      .values({
        word: v.word.trim().slice(0, 80),
        normalized,
        sentence: v.sentence?.slice(0, 400) || null,
        meaning: v.meaning?.trim() || null,
        novelId: v.novelId ?? null,
        novelName: v.novelName ?? null,
        chapterId: v.chapterId ?? null,
        box: 1,
        dueAt: now,
        createdAt: now,
      })
      .returning()
      .get(),
  );
  return { row, existed: false };
};

export const updateVocab = async (id: number, patch: { meaning?: string; word?: string }) => {
  ensureSardPlusTables();
  const set: Record<string, unknown> = {};
  if (patch.meaning !== undefined) set.meaning = patch.meaning.trim() || null;
  if (patch.word) set.word = patch.word.trim();
  await dbManager.write(async tx => {
    await tx.update(sardVocab).set(set).where(eq(sardVocab.id, id)).run();
  });
};

export const deleteVocab = async (id: number) => {
  ensureSardPlusTables();
  await dbManager.write(async tx => {
    await tx.delete(sardVocab).where(eq(sardVocab.id, id)).run();
  });
};

export const listVocab = async (): Promise<SardVocabRow[]> => {
  ensureSardPlusTables();
  return dbManager.select().from(sardVocab).orderBy(desc(sardVocab.createdAt)).all();
};

export const dueVocab = async (now = Date.now(), limit = 30): Promise<SardVocabRow[]> => {
  ensureSardPlusTables();
  return dbManager.select().from(sardVocab).where(lte(sardVocab.dueAt, now)).orderBy(asc(sardVocab.dueAt)).limit(limit).all();
};

export const reviewVocab = async (row: SardVocabRow, correct: boolean, now = Date.now()) => {
  ensureSardPlusTables();
  const next = nextReview(row.box, correct, now);
  await dbManager.write(async tx => {
    await tx.update(sardVocab).set({ ...next, reviewedAt: now }).where(eq(sardVocab.id, row.id)).run();
  });
  return next;
};

export const vocabCounts = async (sinceMs?: number) => {
  ensureSardPlusTables();
  const total = await dbManager.select({ n: sql<number>`COUNT(*)` }).from(sardVocab).get();
  const mastered = await dbManager.select({ n: sql<number>`COUNT(*)` }).from(sardVocab).where(gte(sardVocab.box, MAX_BOX)).get();
  const recent = sinceMs
    ? await dbManager.select({ n: sql<number>`COUNT(*)` }).from(sardVocab).where(gte(sardVocab.createdAt, sinceMs)).get()
    : undefined;
  return { total: Number(total?.n ?? 0), mastered: Number(mastered?.n ?? 0), recent: Number(recent?.n ?? 0) };
};

export const bookmarkCounts = async (sinceMs?: number) => {
  ensureSardPlusTables();
  const total = await dbManager.select({ n: sql<number>`COUNT(*)` }).from(sardBookmark).get();
  const recent = sinceMs
    ? await dbManager.select({ n: sql<number>`COUNT(*)` }).from(sardBookmark).where(gte(sardBookmark.createdAt, sinceMs)).get()
    : undefined;
  return { total: Number(total?.n ?? 0), recent: Number(recent?.n ?? 0) };
};

/* -------------------------------------------------- novel meta + tags */
export const listTags = async (): Promise<(SardTagRow & { count: number })[]> => {
  ensureSardPlusTables();
  const rows = await dbManager
    .select({ id: sardTag.id, name: sardTag.name, color: sardTag.color, createdAt: sardTag.createdAt, count: sql<number>`COUNT(${sardNovelTag.novelId})` })
    .from(sardTag)
    .leftJoin(sardNovelTag, eq(sardNovelTag.tagId, sardTag.id))
    .groupBy(sardTag.id)
    .orderBy(asc(sardTag.name))
    .all();
  return rows.map((r: any) => ({ ...r, count: Number(r.count ?? 0) }));
};

const tagIdFor = async (name: string): Promise<number | undefined> => {
  const clean = cleanTag(name);
  if (!clean) return undefined;
  const found = await dbManager.select().from(sardTag).where(eq(sardTag.name, clean)).get();
  if (found) return found.id;
  const row = await dbManager.write(async tx =>
    tx.insert(sardTag).values({ name: clean, color: colorForTag(clean), createdAt: Date.now() }).returning().get(),
  );
  return row.id;
};

export const createTag = async (name: string) => {
  ensureSardPlusTables();
  return tagIdFor(name);
};

export const renameTag = async (id: number, name: string) => {
  ensureSardPlusTables();
  const clean = cleanTag(name);
  if (!clean) return;
  await dbManager.write(async tx => {
    await tx.update(sardTag).set({ name: clean }).where(eq(sardTag.id, id)).run();
  });
};

export const deleteTag = async (id: number) => {
  ensureSardPlusTables();
  await dbManager.write(async tx => {
    await tx.delete(sardNovelTag).where(eq(sardNovelTag.tagId, id)).run();
    await tx.delete(sardTag).where(eq(sardTag.id, id)).run();
  });
};

export const tagNovels = async (tagName: string, novelIds: number[], add = true) => {
  ensureSardPlusTables();
  if (!novelIds.length) return;
  const tagId = await tagIdFor(tagName);
  if (!tagId) return;
  await dbManager.write(async tx => {
    if (add) {
      for (const novelId of novelIds) {
        await tx.insert(sardNovelTag).values({ novelId, tagId }).onConflictDoNothing().run();
      }
    } else {
      await tx.delete(sardNovelTag).where(and(eq(sardNovelTag.tagId, tagId), inArray(sardNovelTag.novelId, novelIds))).run();
    }
  });
};

export const setNovelTags = async (novelId: number, names: string[]) => {
  ensureSardPlusTables();
  const ids: number[] = [];
  for (const n of names) {
    const id = await tagIdFor(n);
    if (id) ids.push(id);
  }
  await dbManager.write(async tx => {
    await tx.delete(sardNovelTag).where(eq(sardNovelTag.novelId, novelId)).run();
    for (const tagId of [...new Set(ids)]) await tx.insert(sardNovelTag).values({ novelId, tagId }).onConflictDoNothing().run();
  });
};

export const setNovelMeta = async (
  novelIds: number[],
  patch: { status?: ReadingStatus | null; rating?: number | null; note?: string | null },
) => {
  ensureSardPlusTables();
  const now = Date.now();
  await dbManager.write(async tx => {
    for (const novelId of novelIds) {
      await tx
        .insert(sardNovelMeta)
        .values({ novelId, ...patch, updatedAt: now })
        .onConflictDoUpdate({ target: sardNovelMeta.novelId, set: { ...patch, updatedAt: now } })
        .run();
    }
  });
};

/** All per-novel meta with tag names (hidden flag from the hidden-shelf store). */
export const getAllNovelMeta = async (): Promise<Map<number, NovelMeta>> => {
  ensureSardPlusTables();
  const metas: SardNovelMetaRow[] = await dbManager.select().from(sardNovelMeta).all();
  const tagRows = await dbManager
    .select({ novelId: sardNovelTag.novelId, name: sardTag.name })
    .from(sardNovelTag)
    .innerJoin(sardTag, eq(sardTag.id, sardNovelTag.tagId))
    .all();
  const hidden = new Set(hiddenStore.get());
  const map = new Map<number, NovelMeta>();
  const ensure = (id: number) => {
    let m = map.get(id);
    if (!m) {
      m = { novelId: id, tags: [], hidden: hidden.has(id) };
      map.set(id, m);
    }
    return m;
  };
  for (const r of metas) Object.assign(ensure(r.novelId), { status: r.status as ReadingStatus | null, rating: r.rating, note: r.note });
  for (const r of tagRows as { novelId: number; name: string }[]) ensure(r.novelId).tags!.push(r.name);
  for (const id of hidden) ensure(id);
  return map;
};

export const setHidden = (novelIds: number[], hide: boolean) =>
  hiddenStore.update(list => {
    const set = new Set(list);
    for (const id of novelIds) {
      if (hide) set.add(id);
      else set.delete(id);
    }
    return [...set];
  });

/* ------------------------------------------------------- backup helpers */
export interface PlusDump {
  bookmarks: SardBookmarkRow[];
  vocab: SardVocabRow[];
  meta: SardNovelMetaRow[];
  tags: SardTagRow[];
  novelTags: { novelId: number; tagId: number }[];
}

export const dumpPlusTables = async (): Promise<PlusDump> => {
  ensureSardPlusTables();
  return {
    bookmarks: await dbManager.select().from(sardBookmark).all(),
    vocab: await dbManager.select().from(sardVocab).all(),
    meta: await dbManager.select().from(sardNovelMeta).all(),
    tags: await dbManager.select().from(sardTag).all(),
    novelTags: await dbManager.select().from(sardNovelTag).all(),
  };
};

/** Merges a dump (existing ids are replaced, nothing else is deleted). */
export const restorePlusTables = async (d: Partial<PlusDump>) => {
  ensureSardPlusTables();
  await dbManager.write(async tx => {
    for (const r of d.tags ?? []) {
      await tx.insert(sardTag).values(r).onConflictDoUpdate({ target: sardTag.id, set: { name: r.name, color: r.color } }).run();
    }
    for (const r of d.novelTags ?? []) await tx.insert(sardNovelTag).values(r).onConflictDoNothing().run();
    for (const r of d.meta ?? []) {
      await tx.insert(sardNovelMeta).values(r).onConflictDoUpdate({ target: sardNovelMeta.novelId, set: r }).run();
    }
    for (const r of d.bookmarks ?? []) {
      await tx.insert(sardBookmark).values(r).onConflictDoUpdate({ target: sardBookmark.id, set: r }).run();
    }
    for (const r of d.vocab ?? []) {
      await tx.insert(sardVocab).values(r).onConflictDoUpdate({ target: sardVocab.normalized, set: { meaning: r.meaning, box: r.box, dueAt: r.dueAt } }).run();
    }
  });
};

export type { SardBookmarkRow, SardVocabRow, SardTagRow };
