/**
 * Lexical retrieval (BM25) over chunks of already-read chapters, used by
 * «اسأل الرواية». Fully on-device; only the top passages go to the model.
 */
import { normalizeText, tokenize } from './arabic';
import { chunkText } from './chunking';

export interface RetrievalDoc {
  chapterId: number;
  chapterName: string;
  /** Reading-order index; larger = later in the story. */
  order: number;
  text: string;
}

export interface IndexedChunk {
  id: string;
  chapterId: number;
  chapterName: string;
  order: number;
  chunkIndex: number;
  text: string;
  tf: Map<string, number>;
  length: number;
}

export interface RetrievalIndex {
  chunks: IndexedChunk[];
  df: Map<string, number>;
  avgLength: number;
  maxOrder: number;
}

export const buildRetrievalIndex = (
  docs: RetrievalDoc[],
  { chunkChars = 1600, overlapChars = 200 } = {},
): RetrievalIndex => {
  const chunks: IndexedChunk[] = [];
  const df = new Map<string, number>();
  let total = 0;
  let maxOrder = -1;
  for (const doc of docs) {
    maxOrder = Math.max(maxOrder, doc.order);
    for (const c of chunkText(doc.text, { maxChars: chunkChars, overlapChars })) {
      const tokens = tokenize(c.text);
      const tf = new Map<string, number>();
      tokens.forEach(t => tf.set(t, (tf.get(t) ?? 0) + 1));
      tf.forEach((_, t) => df.set(t, (df.get(t) ?? 0) + 1));
      total += tokens.length;
      chunks.push({
        id: `${doc.chapterId}:${c.index}`,
        chapterId: doc.chapterId,
        chapterName: doc.chapterName,
        order: doc.order,
        chunkIndex: c.index,
        text: c.text,
        tf,
        length: tokens.length,
      });
    }
  }
  return {
    chunks,
    df,
    avgLength: chunks.length ? total / chunks.length : 0,
    maxOrder,
  };
};

const RECENCY_HINT =
  /(اخر|الاخير|الاخيره|مؤخرا|الحالي|الان|توا|last|latest|recent|current)/;

export const queryWantsRecent = (query: string) =>
  RECENCY_HINT.test(normalizeText(query));

export interface ScoredChunk {
  chunk: IndexedChunk;
  score: number;
}

export const searchIndex = (
  index: RetrievalIndex,
  query: string,
  { topK = 8, k1 = 1.4, b = 0.75, extraTerms = [] as string[] } = {},
): ScoredChunk[] => {
  const terms = Array.from(
    new Set([...tokenize(query), ...extraTerms.flatMap(t => tokenize(t))]),
  );
  const N = index.chunks.length;
  const scored: ScoredChunk[] = [];
  if (N) {
    for (const chunk of index.chunks) {
      let score = 0;
      for (const t of terms) {
        const f = chunk.tf.get(t);
        if (!f) continue;
        const n = index.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score +=
          (idf * f * (k1 + 1)) /
          (f + k1 * (1 - b + (b * chunk.length) / (index.avgLength || 1)));
      }
      if (score > 0) {
        // mild recency prior: later chapters are slightly more relevant
        const recency = index.maxOrder > 0 ? chunk.order / index.maxOrder : 1;
        scored.push({ chunk, score: score * (1 + 0.15 * recency) });
      }
    }
  }
  scored.sort((x, y) => y.score - x.score);
  let top = scored.slice(0, topK);

  if (queryWantsRecent(query) || top.length === 0) {
    // add the ending of the most recent chapter(s) – "what just happened?"
    const recent = [...index.chunks]
      .sort((x, y) => y.order - x.order || y.chunkIndex - x.chunkIndex)
      .slice(0, Math.max(2, Math.ceil(topK / 3)));
    const have = new Set(top.map(s => s.chunk.id));
    for (const c of recent) {
      if (!have.has(c.id)) top.push({ chunk: c, score: 0 });
    }
    top = top.slice(0, topK + 2);
  }
  return top;
};

/** Orders retrieved passages by story order for a coherent prompt. */
export const toContextBlocks = (results: ScoredChunk[], maxChars: number) => {
  const sorted = [...results].sort(
    (x, y) =>
      x.chunk.order - y.chunk.order || x.chunk.chunkIndex - y.chunk.chunkIndex,
  );
  const blocks: { chapterId: number; chapterName: string; text: string }[] = [];
  let used = 0;
  for (const { chunk } of sorted) {
    if (used + chunk.text.length > maxChars) continue;
    used += chunk.text.length;
    blocks.push({
      chapterId: chunk.chapterId,
      chapterName: chunk.chapterName,
      text: chunk.text,
    });
  }
  return blocks;
};
