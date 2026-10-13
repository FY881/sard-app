/**
 * Sard AI features (device orchestration):
 *  ما سبق (recap) · ملخص الفصل/المجلد · دليل الشخصيات والأماكن · اسأل الرواية
 * All context is spoiler-safe (see ./spoiler.ts) and cached in SQLite.
 */
import { getAllNovelChaptersForBackup } from '@database/queries/ChapterQueries';
import type { ChapterInfo } from '@database/types';
import {
  AIError,
  aiClient,
  getAISettings,
  getApiKey,
  type AIMessage,
} from '@services/ai';
import { allocateBudget, batchBySize, excerpt } from './chunking';
import { loadChapterPlainText } from './chapterText';
import {
  addAgentLog,
  getAiCache,
  loadGlossary,
  saveGlossary,
  setAiCache,
} from './db';
import {
  compactGlossaryForPrompt,
  mergeGlossary,
  parseGlossaryResponse,
  visibleGlossary,
  type VisibleGlossaryEntry,
} from './glossaryLogic';
import {
  askSystemPrompt,
  chapterBlock,
  GLOSSARY_JSON_SCHEMA,
  glossarySystemPrompt,
  recapSystemPrompt,
  summarySystemPrompt,
  volumeSummarySystemPrompt,
} from './prompts';
import {
  buildRetrievalIndex,
  searchIndex,
  toContextBlocks,
  type RetrievalIndex,
} from './retrieval';
import {
  isSpoilerRisk,
  orderChapters,
  readCutoffIndex,
  selectRecapChapters,
  selectSpoilerSafeChapters,
} from './spoiler';

export interface NovelRef {
  id: number;
  name: string;
  pluginId: string;
}

export type ProgressFn = (done: number, total: number, label?: string) => void;

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new AIError('ABORTED');
};

/** Throws the right AIError before any disk work when AI can't run. */
export const assertAIReady = () => {
  const s = getAISettings();
  if (!s.enabled) throw new AIError('DISABLED');
  if (!getApiKey(s.provider)) throw new AIError('NO_KEY');
};

export const loadOrderedChapters = async (novelId: number) =>
  orderChapters(await getAllNovelChaptersForBackup(novelId));

const loadTexts = async (
  novel: NovelRef,
  chapters: ChapterInfo[],
  opts: {
    allowNetwork?: boolean;
    signal?: AbortSignal;
    onProgress?: ProgressFn;
  } = {},
) => {
  const out: { chapter: ChapterInfo; text: string }[] = [];
  for (let i = 0; i < chapters.length; i++) {
    throwIfAborted(opts.signal);
    const text = await loadChapterPlainText(novel, chapters[i], {
      allowNetwork: opts.allowNetwork,
    });
    if (text) out.push({ chapter: chapters[i], text });
    opts.onProgress?.(i + 1, chapters.length);
  }
  return out;
};

export interface CachedResult {
  text: string;
  cached: boolean;
  createdAt: number;
  model?: string | null;
}

// ================================================================ RECAP

export type RecapResult =
  | ({
      status: 'ok';
      basedOn: ChapterInfo[];
      missing: ChapterInfo[];
    } & CachedResult)
  | { status: 'no_previous' }
  | { status: 'no_downloaded'; missing: ChapterInfo[] };

export const generateRecap = async (params: {
  novel: NovelRef;
  currentChapterId?: number;
  force?: boolean;
  /** Only return a cached recap, never call the AI. */
  cacheOnly?: boolean;
  signal?: AbortSignal;
}): Promise<RecapResult | { status: 'not_cached' }> => {
  const { novel, currentChapterId, force, signal } = params;
  const settings = getAISettings();
  const all = await loadOrderedChapters(novel.id);
  const sel = selectRecapChapters(
    all,
    currentChapterId,
    settings.recapChapters,
  );
  if (!sel.hasPrevious) return { status: 'no_previous' };
  if (!sel.chapters.length) {
    return { status: 'no_downloaded', missing: sel.missing };
  }
  const cacheKey = `${currentChapterId ?? 'latest'}:${sel.chapters
    .map(c => c.id)
    .join(',')}`;
  if (!force) {
    const hit = await getAiCache(novel.id, 'recap', cacheKey);
    if (hit) {
      return {
        status: 'ok',
        text: hit.content,
        cached: true,
        createdAt: hit.createdAt,
        model: hit.model,
        basedOn: sel.chapters,
        missing: sel.missing,
      };
    }
  }
  if (params.cacheOnly) return { status: 'not_cached' };
  assertAIReady();
  const texts = await loadTexts(novel, sel.chapters, { signal });
  if (!texts.length) return { status: 'no_downloaded', missing: sel.chapters };
  const alloc = allocateBudget(
    texts.map(t => t.text.length),
    settings.contextBudgetChars,
    'recent',
  );
  const body = texts
    .map((t, i) =>
      chapterBlock(
        t.chapter.name,
        excerpt(t.text, alloc[i], i === texts.length - 1 ? 'headTail' : 'tail'),
      ),
    )
    .join('\n\n');
  const user = [
    `الرواية: «${novel.name}»`,
    sel.current ? `الفصل الذي سيقرؤه الآن: «${sel.current.name}»` : '',
    'نص الفصول السابقة:',
    body,
  ]
    .filter(Boolean)
    .join('\n');
  const res = await aiClient.generate('recap', {
    system: recapSystemPrompt(),
    messages: [{ role: 'user', text: user }],
    temperature: settings.temperature,
    maxOutputTokens: 1200,
    signal,
  });
  const upToOrder = all.findIndex(
    c => c.id === texts[texts.length - 1].chapter.id,
  );
  await setAiCache({
    novelId: novel.id,
    kind: 'recap',
    cacheKey,
    content: res.text,
    upToOrder,
    model: res.model,
  });
  addAgentLog({
    agent: 'recap',
    action: 'recap',
    detail: `${novel.name} — ${sel.current?.name ?? ''}`,
    novelId: novel.id,
  }).catch(() => {});
  return {
    status: 'ok',
    text: res.text,
    cached: false,
    createdAt: Date.now(),
    model: res.model,
    basedOn: texts.map(t => t.chapter),
    missing: sel.missing,
  };
};

// ============================================================== SUMMARY

export type SummaryResult =
  | ({ status: 'ok'; chapter: ChapterInfo } & CachedResult)
  | { status: 'spoiler_confirm'; chapter: ChapterInfo }
  | { status: 'no_text'; chapter: ChapterInfo }
  | { status: 'not_found' };

const summarizeLongText = async (
  name: string,
  text: string,
  system: string,
  budget: number,
  signal?: AbortSignal,
) => {
  const settings = getAISettings();
  if (text.length <= budget) {
    return aiClient.generate('summary', {
      system,
      messages: [{ role: 'user', text: chapterBlock(name, text) }],
      temperature: settings.temperature,
      maxOutputTokens: 1600,
      signal,
    });
  }
  // map → reduce for very long chapters (max 4 parts to protect the quota)
  const parts = Math.min(4, Math.ceil(text.length / budget));
  const size = Math.ceil(text.length / parts);
  const partial: string[] = [];
  for (let i = 0; i < parts; i++) {
    throwIfAborted(signal);
    const piece = excerpt(text.slice(i * size, (i + 1) * size), budget, 'head');
    const r = await aiClient.generate('summary', {
      system,
      messages: [
        {
          role: 'user',
          text: chapterBlock(`${name} (جزء ${i + 1}/${parts})`, piece),
        },
      ],
      temperature: settings.temperature,
      maxOutputTokens: 900,
      signal,
    });
    partial.push(r.text);
  }
  return aiClient.generate('summary', {
    system,
    messages: [
      {
        role: 'user',
        text:
          `اجمع ملخصات الأجزاء التالية من «${name}» في ملخص واحد مرتب:\n\n` +
          partial.map((p, i) => `— الجزء ${i + 1}:\n${p}`).join('\n\n'),
      },
    ],
    temperature: settings.temperature,
    maxOutputTokens: 1600,
    signal,
  });
};

export const summarizeChapter = async (params: {
  novel: NovelRef;
  chapterId: number;
  currentChapterId?: number;
  /** User confirmed the spoiler warning for an unread chapter. */
  acceptSpoiler?: boolean;
  /** Fetch from the source when the chapter is not downloaded. */
  allowNetwork?: boolean;
  force?: boolean;
  signal?: AbortSignal;
}): Promise<SummaryResult> => {
  const { novel, chapterId, signal } = params;
  const settings = getAISettings();
  const all = await loadOrderedChapters(novel.id);
  const chapter = all.find(c => c.id === chapterId);
  if (!chapter) return { status: 'not_found' };
  if (
    !params.acceptSpoiler &&
    isSpoilerRisk(all, chapterId, params.currentChapterId)
  ) {
    return { status: 'spoiler_confirm', chapter };
  }
  const cacheKey = `${chapterId}:${settings.summaryLength}`;
  if (!params.force) {
    const hit = await getAiCache(novel.id, 'summary', cacheKey);
    if (hit) {
      return {
        status: 'ok',
        chapter,
        text: hit.content,
        cached: true,
        createdAt: hit.createdAt,
        model: hit.model,
      };
    }
  }
  assertAIReady();
  const text = await loadChapterPlainText(novel, chapter, {
    allowNetwork: params.allowNetwork,
  });
  if (!text) return { status: 'no_text', chapter };
  const r = await summarizeLongText(
    chapter.name,
    text,
    summarySystemPrompt(settings.summaryLength),
    settings.contextBudgetChars,
    signal,
  );
  await setAiCache({
    novelId: novel.id,
    kind: 'summary',
    cacheKey,
    content: r.text,
    upToOrder: all.indexOf(chapter),
    model: r.model,
  });
  return {
    status: 'ok',
    chapter,
    text: r.text,
    cached: false,
    createdAt: Date.now(),
    model: r.model,
  };
};

export type RangeSummaryResult =
  | ({
      status: 'ok';
      from: ChapterInfo;
      to: ChapterInfo;
      count: number;
      /** Chapters dropped because they are after the reader's cutoff. */
      cappedAtCutoff: boolean;
      skippedNoText: number;
    } & CachedResult)
  | { status: 'nothing_read' }
  | { status: 'no_text' };

/** Summarises a chapter range / volume. Spoiler-safe: capped at the cutoff. */
export const summarizeRange = async (params: {
  novel: NovelRef;
  chapterIds: number[];
  currentChapterId?: number;
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: ProgressFn;
}): Promise<RangeSummaryResult> => {
  const { novel, signal } = params;
  const settings = getAISettings();
  const all = await loadOrderedChapters(novel.id);
  const cutoff = readCutoffIndex(all, {
    currentChapterId: params.currentChapterId,
    includeCurrent: true,
  });
  const wanted = new Set(params.chapterIds);
  const inRange = all.filter(c => wanted.has(c.id));
  const allowed = inRange.filter(c => all.indexOf(c) <= cutoff);
  if (!allowed.length) return { status: 'nothing_read' };
  const cappedAtCutoff = allowed.length < inRange.length;
  const from = allowed[0];
  const to = allowed[allowed.length - 1];
  const cacheKey = `${from.id}-${to.id}:${allowed.length}:${settings.summaryLength}`;
  if (!params.force) {
    const hit = await getAiCache(novel.id, 'volume', cacheKey);
    if (hit) {
      return {
        status: 'ok',
        from,
        to,
        count: allowed.length,
        cappedAtCutoff,
        skippedNoText: 0,
        text: hit.content,
        cached: true,
        createdAt: hit.createdAt,
        model: hit.model,
      };
    }
  }
  assertAIReady();
  // Prefer cached per-chapter summaries (cheap); otherwise use raw text.
  const pieces: { name: string; text: string }[] = [];
  let skippedNoText = 0;
  for (let i = 0; i < allowed.length; i++) {
    throwIfAborted(signal);
    const c = allowed[i];
    const cached =
      (await getAiCache(novel.id, 'summary', `${c.id}:short`)) ??
      (await getAiCache(novel.id, 'summary', `${c.id}:medium`)) ??
      (await getAiCache(novel.id, 'summary', `${c.id}:long`));
    if (cached) {
      pieces.push({ name: c.name, text: cached.content });
    } else {
      const text = await loadChapterPlainText(novel, c);
      if (text) pieces.push({ name: c.name, text });
      else skippedNoText++;
    }
    params.onProgress?.(i + 1, allowed.length);
  }
  if (!pieces.length) return { status: 'no_text' };
  const system = volumeSummarySystemPrompt(settings.summaryLength);
  const budget = settings.contextBudgetChars;
  const total = pieces.reduce((a, p) => a + p.text.length, 0);
  let finalText: string;
  let model: string | undefined;
  const asBlocks = (list: { name: string; text: string }[]) => {
    const alloc = allocateBudget(
      list.map(p => p.text.length),
      budget,
      'even',
    );
    return list
      .map((p, i) => chapterBlock(p.name, excerpt(p.text, alloc[i], 'headTail')))
      .join('\n\n');
  };
  if (total <= budget * 1.5) {
    const r = await aiClient.generate('summary', {
      system,
      messages: [{ role: 'user', text: asBlocks(pieces) }],
      temperature: settings.temperature,
      maxOutputTokens: 2400,
      signal,
    });
    finalText = r.text;
    model = r.model;
  } else {
    // hierarchical: batches → partial summaries → final (max 6 batches)
    let batches = batchBySize(pieces, p => p.text.length, budget);
    if (batches.length > 6) {
      const per = Math.ceil(pieces.length / 6);
      batches = Array.from({ length: 6 }, (_, i) =>
        pieces.slice(i * per, (i + 1) * per),
      ).filter(b => b.length);
    }
    const partial: string[] = [];
    for (const batch of batches) {
      throwIfAborted(signal);
      const r = await aiClient.generate('summary', {
        system: summarySystemPrompt('short'),
        messages: [{ role: 'user', text: asBlocks(batch) }],
        temperature: settings.temperature,
        maxOutputTokens: 1000,
        signal,
      });
      partial.push(
        `«${batch[0].name}» → «${batch[batch.length - 1].name}»:\n${r.text}`,
      );
    }
    const r = await aiClient.generate('summary', {
      system,
      messages: [{ role: 'user', text: partial.join('\n\n') }],
      temperature: settings.temperature,
      maxOutputTokens: 2400,
      signal,
    });
    finalText = r.text;
    model = r.model;
  }
  await setAiCache({
    novelId: novel.id,
    kind: 'volume',
    cacheKey,
    content: finalText,
    upToOrder: all.indexOf(to),
    model,
  });
  return {
    status: 'ok',
    from,
    to,
    count: allowed.length,
    cappedAtCutoff,
    skippedNoText,
    text: finalText,
    cached: false,
    createdAt: Date.now(),
    model,
  };
};

// ============================================================= GLOSSARY

export interface GlossaryView {
  entries: VisibleGlossaryEntry[];
  /** Reading-order index the glossary is visible up to. */
  cutoffOrder: number;
  /** Last chapter processed into the glossary (may exceed cutoff). */
  processedUpTo: number;
  processedChapterName?: string;
  /** Read+downloaded chapters not yet processed. */
  pending: number;
  /** Read chapters that can't be processed because they're not downloaded. */
  notDownloaded: number;
  hasAnyRead: boolean;
}

const getGlossaryProgress = async (novelId: number) => {
  const hit = await getAiCache(novelId, 'glossary_progress', 'progress');
  return {
    order: hit?.upToOrder ?? -1,
    chapterName: hit?.content || undefined,
  };
};

export const getGlossaryView = async (
  novel: NovelRef,
  currentChapterId?: number,
): Promise<GlossaryView> => {
  const all = await loadOrderedChapters(novel.id);
  const progress = await getGlossaryProgress(novel.id);
  const sel = selectSpoilerSafeChapters(all, {
    currentChapterId,
    requireDownloaded: true,
    afterIndex: progress.order,
  });
  const cutoffOrder = sel.cutoffIndex;
  const entries = visibleGlossary(await loadGlossary(novel.id), cutoffOrder);
  return {
    entries,
    cutoffOrder,
    processedUpTo: progress.order,
    processedChapterName: progress.chapterName,
    pending: sel.chapters.length,
    notDownloaded: sel.missingText.length,
    hasAnyRead: cutoffOrder >= 0,
  };
};

export const buildGlossary = async (params: {
  novel: NovelRef;
  currentChapterId?: number;
  signal?: AbortSignal;
  onProgress?: ProgressFn;
}): Promise<GlossaryView & { stoppedEarly: boolean; added: number }> => {
  const { novel, signal } = params;
  const settings = getAISettings();
  assertAIReady();
  const all = await loadOrderedChapters(novel.id);
  const progress = await getGlossaryProgress(novel.id);
  const sel = selectSpoilerSafeChapters(all, {
    currentChapterId: params.currentChapterId,
    requireDownloaded: true,
    afterIndex: progress.order,
  });
  let entries = await loadGlossary(novel.id);
  const before = entries.length;
  const texts = await loadTexts(novel, sel.chapters, { signal });
  const batches = batchBySize(
    texts,
    t => Math.min(t.text.length, settings.glossaryBatchChars),
    settings.glossaryBatchChars,
  );
  const runBatches = batches.slice(0, settings.glossaryMaxBatchesPerRun);
  let processedOrder = progress.order;
  let processedName = progress.chapterName;
  for (let b = 0; b < runBatches.length; b++) {
    throwIfAborted(signal);
    const batch = runBatches[b];
    const last = batch[batch.length - 1].chapter;
    const order = all.findIndex(c => c.id === last.id);
    const known = compactGlossaryForPrompt(
      visibleGlossary(entries, processedOrder),
    );
    const alloc = allocateBudget(
      batch.map(t => t.text.length),
      settings.glossaryBatchChars,
      'even',
    );
    const user = [
      `الرواية: «${novel.name}»`,
      known ? `المعروف حتى الآن:\n${known}` : 'لا يوجد دليل سابق.',
      'النص الجديد:',
      batch
        .map((t, i) =>
          chapterBlock(t.chapter.name, excerpt(t.text, alloc[i], 'headTail')),
        )
        .join('\n\n'),
    ].join('\n\n');
    params.onProgress?.(b, runBatches.length, last.name);
    const r = await aiClient.generate('glossary', {
      system: glossarySystemPrompt(),
      messages: [{ role: 'user', text: user }],
      temperature: 0.2,
      maxOutputTokens: 4000,
      json: true,
      jsonSchema: GLOSSARY_JSON_SCHEMA,
      signal,
    });
    const incoming = parseGlossaryResponse(r.text);
    entries = mergeGlossary(entries, incoming, {
      order,
      chapterName: last.name,
    });
    await saveGlossary(novel.id, entries);
    processedOrder = order;
    processedName = last.name;
    await setAiCache({
      novelId: novel.id,
      kind: 'glossary_progress',
      cacheKey: 'progress',
      content: last.name,
      upToOrder: order,
      model: r.model,
    });
    params.onProgress?.(b + 1, runBatches.length, last.name);
  }
  const view = await getGlossaryView(novel, params.currentChapterId);
  if (runBatches.length) {
    addAgentLog({
      agent: 'recap',
      action: 'glossary',
      detail: `${novel.name} — ${processedName ?? ''}`,
      novelId: novel.id,
    }).catch(() => {});
  }
  return {
    ...view,
    stoppedEarly: batches.length > runBatches.length,
    added: Math.max(0, entries.length - before),
  };
};

// ================================================================== ASK

const indexCache = new Map<string, RetrievalIndex>();

export interface AskResult {
  answer: string;
  sources: { chapterId: number; chapterName: string }[];
  boundaryName?: string;
}

export const prepareAskIndex = async (params: {
  novel: NovelRef;
  currentChapterId?: number;
  signal?: AbortSignal;
  onProgress?: ProgressFn;
}) => {
  const settings = getAISettings();
  const all = await loadOrderedChapters(params.novel.id);
  const sel = selectSpoilerSafeChapters(all, {
    currentChapterId: params.currentChapterId,
    requireDownloaded: true,
    max: settings.askMaxChapters,
  });
  const signature = `${params.novel.id}:${sel.chapters
    .map(c => c.id)
    .join(',')}`;
  let index = indexCache.get(signature);
  if (!index) {
    const texts = await loadTexts(params.novel, sel.chapters, {
      signal: params.signal,
      onProgress: params.onProgress,
    });
    index = buildRetrievalIndex(
      texts.map(t => ({
        chapterId: t.chapter.id,
        chapterName: t.chapter.name,
        order: all.indexOf(t.chapter),
        text: t.text,
      })),
    );
    indexCache.clear(); // keep memory low: one novel at a time
    indexCache.set(signature, index);
  }
  return { index, boundary: sel.boundary, cutoffOrder: sel.cutoffIndex };
};

export const askNovel = async (params: {
  novel: NovelRef;
  question: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  currentChapterId?: number;
  signal?: AbortSignal;
  onProgress?: ProgressFn;
}): Promise<AskResult> => {
  const settings = getAISettings();
  assertAIReady();
  const { index, boundary, cutoffOrder } = await prepareAskIndex(params);
  if (!index.chunks.length) {
    throw new AIError('EMPTY', { detail: 'no_context' });
  }
  const glossary = visibleGlossary(
    await loadGlossary(params.novel.id),
    cutoffOrder,
  );
  const mentioned = glossary.filter(e =>
    [e.name, ...e.aliases].some(n => params.question.includes(n)),
  );
  const results = searchIndex(index, params.question, {
    topK: settings.askTopChunks,
    extraTerms: mentioned.flatMap(e => [e.name, ...e.aliases]),
  });
  const blocks = toContextBlocks(results, settings.contextBudgetChars);
  const context = [
    mentioned.length
      ? 'من دليل الرواية:\n' + compactGlossaryForPrompt(mentioned, 2000)
      : '',
    'مقاطع من الفصول المقروءة:',
    blocks.map(b => chapterBlock(b.chapterName, b.text)).join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
  const history: AIMessage[] = (params.history ?? []).slice(-6).map(m =>
    m.role === 'user'
      ? { role: 'user' as const, text: m.content }
      : { role: 'model' as const, text: m.content },
  );
  const r = await aiClient.generate('ask', {
    system: askSystemPrompt(params.novel.name, boundary?.name),
    messages: [
      ...history,
      { role: 'user', text: `${context}\n\nسؤال القارئ: ${params.question}` },
    ],
    temperature: settings.temperature,
    maxOutputTokens: 1400,
    signal: params.signal,
  });
  const seen = new Set<number>();
  const sources: { chapterId: number; chapterName: string }[] = [];
  for (const b of blocks) {
    if (seen.has(b.chapterId)) continue;
    seen.add(b.chapterId);
    sources.push({ chapterId: b.chapterId, chapterName: b.chapterName });
  }
  return { answer: r.text, sources, boundaryName: boundary?.name };
};
