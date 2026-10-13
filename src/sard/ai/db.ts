/**
 * Data access for Sard AI + agents tables (device only).
 */
import { and, desc, eq, lt } from 'drizzle-orm';
import { db, dbManager } from '@database/db';
import {
  sardAgentLog,
  sardAiCache,
  sardChatMessage,
  sardGlossaryEntry,
  sardNovelAgent,
  type SardNovelAgentRow,
} from '@database/schema/sardAi';
// Same DDL as the drizzle migration (single source of truth, all IF NOT EXISTS).
import migrationSql from '../../../drizzle/20261011140000_sard_ai_agents/migration.sql';
import type {
  GlossaryCategory,
  GlossaryEntry,
  GlossaryHistoryItem,
} from './glossaryLogic';

let ensured = false;
/** Idempotently creates the tables (safety net before migration registration). */
export const ensureSardAiTables = () => {
  if (ensured) return;
  const statements = String(migrationSql)
    .split('--> statement-breakpoint')
    .map(s => s.trim())
    .filter(Boolean);
  for (const s of statements) db.executeSync(s);
  ensured = true;
};

const now = () => Date.now();

// ---------------------------------------------------------------- cache

export type AiCacheKind =
  | 'recap'
  | 'summary'
  | 'volume'
  | 'glossary_progress'
  | 'recommendations';

export const getAiCache = async (
  novelId: number,
  kind: AiCacheKind,
  cacheKey: string,
) => {
  ensureSardAiTables();
  const rows = await dbManager
    .select()
    .from(sardAiCache)
    .where(
      and(
        eq(sardAiCache.novelId, novelId),
        eq(sardAiCache.kind, kind),
        eq(sardAiCache.cacheKey, cacheKey),
      ),
    )
    .limit(1)
    .all();
  return rows[0];
};

export const setAiCache = async (row: {
  novelId: number;
  kind: AiCacheKind;
  cacheKey: string;
  content: string;
  upToOrder?: number | null;
  model?: string | null;
}) => {
  ensureSardAiTables();
  const values = {
    ...row,
    upToOrder: row.upToOrder ?? null,
    model: row.model ?? null,
    createdAt: now(),
  };
  await dbManager.write(async tx => {
    await tx
      .insert(sardAiCache)
      .values(values)
      .onConflictDoUpdate({
        target: [sardAiCache.novelId, sardAiCache.kind, sardAiCache.cacheKey],
        set: {
          content: values.content,
          upToOrder: values.upToOrder,
          model: values.model,
          createdAt: values.createdAt,
        },
      })
      .run();
  });
};

export const deleteAiCache = async (novelId: number, kind?: AiCacheKind) => {
  ensureSardAiTables();
  await dbManager.write(async tx => {
    await tx
      .delete(sardAiCache)
      .where(
        kind
          ? and(eq(sardAiCache.novelId, novelId), eq(sardAiCache.kind, kind))
          : eq(sardAiCache.novelId, novelId),
      )
      .run();
  });
};

export const listAiCache = async (novelId: number, kind: AiCacheKind) => {
  ensureSardAiTables();
  return dbManager
    .select()
    .from(sardAiCache)
    .where(and(eq(sardAiCache.novelId, novelId), eq(sardAiCache.kind, kind)))
    .orderBy(desc(sardAiCache.createdAt))
    .all();
};

// ------------------------------------------------------------- glossary

const parseJsonArray = <T>(raw: string | null | undefined): T[] => {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
};

export const loadGlossary = async (
  novelId: number,
): Promise<GlossaryEntry[]> => {
  ensureSardAiTables();
  const rows = await dbManager
    .select()
    .from(sardGlossaryEntry)
    .where(eq(sardGlossaryEntry.novelId, novelId))
    .all();
  return rows.map(r => ({
    name: r.name,
    normalizedName: r.normalizedName,
    category: r.category as GlossaryCategory,
    aliases: parseJsonArray<string>(r.aliases),
    history: parseJsonArray<GlossaryHistoryItem>(r.history),
    firstSeenOrder: r.firstSeenOrder,
    firstSeenChapterName: r.firstSeenChapterName ?? undefined,
    lastSeenOrder: r.lastSeenOrder,
    pinned: !!r.pinned,
  }));
};

export const saveGlossary = async (
  novelId: number,
  entries: GlossaryEntry[],
) => {
  ensureSardAiTables();
  const ts = now();
  await dbManager.write(async tx => {
    for (const e of entries) {
      const values = {
        novelId,
        name: e.name,
        normalizedName: e.normalizedName,
        category: e.category,
        aliases: JSON.stringify(e.aliases),
        history: JSON.stringify(e.history),
        firstSeenOrder: e.firstSeenOrder,
        firstSeenChapterName: e.firstSeenChapterName ?? null,
        lastSeenOrder: e.lastSeenOrder,
        pinned: !!e.pinned,
        updatedAt: ts,
      };
      await tx
        .insert(sardGlossaryEntry)
        .values(values)
        .onConflictDoUpdate({
          target: [sardGlossaryEntry.novelId, sardGlossaryEntry.normalizedName],
          set: {
            name: values.name,
            category: values.category,
            aliases: values.aliases,
            history: values.history,
            firstSeenOrder: values.firstSeenOrder,
            firstSeenChapterName: values.firstSeenChapterName,
            lastSeenOrder: values.lastSeenOrder,
            updatedAt: ts,
          },
        })
        .run();
    }
  });
};

export const setGlossaryPinned = async (
  novelId: number,
  normalizedName: string,
  pinned: boolean,
) => {
  ensureSardAiTables();
  await dbManager.write(async tx => {
    await tx
      .update(sardGlossaryEntry)
      .set({ pinned })
      .where(
        and(
          eq(sardGlossaryEntry.novelId, novelId),
          eq(sardGlossaryEntry.normalizedName, normalizedName),
        ),
      )
      .run();
  });
};

export const clearGlossary = async (novelId: number) => {
  ensureSardAiTables();
  await dbManager.write(async tx => {
    await tx
      .delete(sardGlossaryEntry)
      .where(eq(sardGlossaryEntry.novelId, novelId))
      .run();
    await tx
      .delete(sardAiCache)
      .where(
        and(
          eq(sardAiCache.novelId, novelId),
          eq(sardAiCache.kind, 'glossary_progress'),
        ),
      )
      .run();
  });
};

// --------------------------------------------------------- novel agents

export const DEFAULT_NOVEL_AGENT = {
  autoDownload: false,
  autoDownloadCount: 5,
  wifiOnly: true,
};

export const getNovelAgent = async (
  novelId: number,
): Promise<SardNovelAgentRow> => {
  ensureSardAiTables();
  const rows = await dbManager
    .select()
    .from(sardNovelAgent)
    .where(eq(sardNovelAgent.novelId, novelId))
    .limit(1)
    .all();
  return (
    rows[0] ?? {
      novelId,
      ...DEFAULT_NOVEL_AGENT,
      lastRunAt: null,
      lastQueuedCount: null,
    }
  );
};

export const upsertNovelAgent = async (
  novelId: number,
  patch: Partial<Omit<SardNovelAgentRow, 'novelId'>>,
) => {
  ensureSardAiTables();
  const current = await getNovelAgent(novelId);
  const next = { ...current, ...patch, novelId };
  next.autoDownloadCount = Math.min(
    100,
    Math.max(1, Math.round(next.autoDownloadCount)),
  );
  await dbManager.write(async tx => {
    await tx
      .insert(sardNovelAgent)
      .values(next)
      .onConflictDoUpdate({
        target: sardNovelAgent.novelId,
        set: {
          autoDownload: next.autoDownload,
          autoDownloadCount: next.autoDownloadCount,
          wifiOnly: next.wifiOnly,
          lastRunAt: next.lastRunAt,
          lastQueuedCount: next.lastQueuedCount,
        },
      })
      .run();
  });
  return next;
};

export const listNovelAgents = async () => {
  ensureSardAiTables();
  return dbManager.select().from(sardNovelAgent).all();
};

// ------------------------------------------------------------ agent log

export type AgentName =
  | 'watcher'
  | 'librarian'
  | 'recommender'
  | 'chat'
  | 'recap'
  | 'scout';

export const addAgentLog = async (entry: {
  agent: AgentName;
  action: string;
  detail?: string;
  novelId?: number;
}) => {
  ensureSardAiTables();
  const ts = now();
  await dbManager.write(async tx => {
    await tx
      .insert(sardAgentLog)
      .values({
        agent: entry.agent,
        action: entry.action,
        detail: entry.detail ?? null,
        novelId: entry.novelId ?? null,
        createdAt: ts,
      })
      .run();
    // keep ~60 days of history
    await tx
      .delete(sardAgentLog)
      .where(lt(sardAgentLog.createdAt, ts - 60 * 24 * 3600 * 1000))
      .run();
  });
};

export const listAgentLogs = async (limit = 200) => {
  ensureSardAiTables();
  return dbManager
    .select()
    .from(sardAgentLog)
    .orderBy(desc(sardAgentLog.createdAt))
    .limit(limit)
    .all();
};

export const clearAgentLogs = async () => {
  ensureSardAiTables();
  await dbManager.write(async tx => {
    await tx.delete(sardAgentLog).run();
  });
};

// ----------------------------------------------------------------- chat

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface StoredChatMessage {
  id: number;
  thread: string;
  role: ChatRole;
  content: string;
  payload?: unknown;
  createdAt: number;
}

export const appendChat = async (
  thread: string,
  role: ChatRole,
  content: string,
  payload?: unknown,
) => {
  ensureSardAiTables();
  await dbManager.write(async tx => {
    await tx
      .insert(sardChatMessage)
      .values({
        thread,
        role,
        content,
        payload: payload === undefined ? null : JSON.stringify(payload),
        createdAt: now(),
      })
      .run();
  });
};

export const listChat = async (
  thread: string,
  limit = 200,
): Promise<StoredChatMessage[]> => {
  ensureSardAiTables();
  const rows = await dbManager
    .select()
    .from(sardChatMessage)
    .where(eq(sardChatMessage.thread, thread))
    .orderBy(desc(sardChatMessage.createdAt), desc(sardChatMessage.id))
    .limit(limit)
    .all();
  return rows.reverse().map(r => ({
    id: r.id,
    thread: r.thread,
    role: r.role as ChatRole,
    content: r.content,
    payload: r.payload ? safeParse(r.payload) : undefined,
    createdAt: r.createdAt,
  }));
};

export const clearChat = async (thread: string) => {
  ensureSardAiTables();
  await dbManager.write(async tx => {
    await tx
      .delete(sardChatMessage)
      .where(eq(sardChatMessage.thread, thread))
      .run();
  });
};

const safeParse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};
