/**
 * Resolves a novel name typed by the user ("سولو ليفلنج", "shadow slave")
 * to a novel in the library (pure).
 */
import { editDistance, jaccard, normalizeText, tokenize } from '../ai/arabic';

export interface MatchableNovel {
  id: number;
  name: string;
}

export type NovelMatch<T> =
  | { status: 'unique'; novel: T; score: number }
  | { status: 'ambiguous'; candidates: T[] }
  | { status: 'none' };

export const scoreTitle = (query: string, title: string): number => {
  const q = normalizeText(query);
  const t = normalizeText(title);
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.includes(q) && q.length >= 3) {
    return 0.92 - Math.min(0.2, (t.length - q.length) / 200);
  }
  if (q.includes(t) && t.length >= 3) return 0.85;
  const tok = jaccard(
    tokenize(q, { stem: false }),
    tokenize(t, { stem: false }),
  );
  const maxLen = Math.max(q.length, t.length);
  const limit = Math.ceil(maxLen * 0.4);
  const dist = editDistance(q, t, limit);
  const editScore = dist > limit ? 0 : 1 - dist / maxLen;
  return Math.max(tok * 0.9, editScore * 0.88);
};

export const matchNovel = <T extends MatchableNovel>(
  query: string,
  novels: T[],
  { threshold = 0.55, margin = 0.08 } = {},
): NovelMatch<T> => {
  const scored = novels
    .map(n => ({ n, s: scoreTitle(query, n.name) }))
    .filter(x => x.s >= threshold)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return { status: 'none' };
  if (
    scored.length === 1 ||
    scored[0].s === 1 ||
    scored[0].s - scored[1].s >= margin
  ) {
    return { status: 'unique', novel: scored[0].n, score: scored[0].s };
  }
  return {
    status: 'ambiguous',
    candidates: scored.slice(0, 5).map(x => x.n),
  };
};
