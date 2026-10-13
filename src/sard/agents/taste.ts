/**
 * Recommender taste profile + scoring (pure, on-device).
 * Profile = weighted genres and source affinity from the library and reading
 * history. Candidates come ONLY from the user's installed sources' popular
 * lists; each pick carries an Arabic "why" line.
 */
import { normalizeText, tokenize, jaccard } from '../ai/arabic';

export interface TasteInputNovel {
  name: string;
  pluginId: string;
  genres?: string | null;
  totalChapters?: number | null;
  chaptersUnread?: number | null;
  inLibrary?: boolean | null;
}

export interface TasteProfile {
  genres: Map<string, number>;
  /** Display label for each normalized genre key. */
  genreLabels: Map<string, string>;
  sources: Map<string, number>;
  titleTokens: Set<string>;
  topGenres: string[];
  novelsConsidered: number;
}

export const splitGenres = (genres?: string | null): string[] =>
  (genres ?? '')
    .split(/[,،/|;\n]+/)
    .map(g => g.trim())
    .filter(g => g && g.length <= 40);

export const genreKey = (g: string) => normalizeText(g);

export const buildTasteProfile = (novels: TasteInputNovel[]): TasteProfile => {
  const genres = new Map<string, number>();
  const genreLabels = new Map<string, string>();
  const sources = new Map<string, number>();
  const titleTokens = new Set<string>();
  let considered = 0;
  for (const n of novels) {
    const total = n.totalChapters ?? 0;
    const read = Math.max(0, total - (n.chaptersUnread ?? total));
    // engagement weight: library membership + log-scaled chapters read
    const w = (n.inLibrary ? 1 : 0.4) + Math.log2(1 + read) / 3;
    considered++;
    for (const g of splitGenres(n.genres)) {
      const k = genreKey(g);
      if (!k) continue;
      genres.set(k, (genres.get(k) ?? 0) + w);
      if (!genreLabels.has(k)) genreLabels.set(k, g);
    }
    sources.set(n.pluginId, (sources.get(n.pluginId) ?? 0) + w);
    tokenize(n.name).forEach(t => titleTokens.add(t));
  }
  const norm = (m: Map<string, number>) => {
    const max = Math.max(0, ...Array.from(m.values()));
    if (max > 0) m.forEach((v, k) => m.set(k, v / max));
  };
  norm(genres);
  norm(sources);
  const topGenres = Array.from(genres.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => genreLabels.get(k) ?? k);
  return {
    genres,
    genreLabels,
    sources,
    titleTokens,
    topGenres,
    novelsConsidered: considered,
  };
};

export interface Candidate {
  name: string;
  path: string;
  pluginId: string;
  pluginName: string;
  cover?: string;
  genres?: string | null;
  summary?: string | null;
  /** 0-based position in the source's popular list. */
  rank: number;
}

export interface ScoredCandidate extends Candidate {
  score: number;
  why: string;
  matchedGenres: string[];
}

export const scoreCandidate = (
  profile: TasteProfile,
  c: Candidate,
): ScoredCandidate => {
  const keys = splitGenres(c.genres).map(genreKey);
  const matched = keys.filter(k => (profile.genres.get(k) ?? 0) > 0);
  const genreScore =
    matched.reduce((a, k) => a + (profile.genres.get(k) ?? 0), 0) /
    Math.max(1, Math.sqrt(keys.length || 1));
  const sourceScore = profile.sources.get(c.pluginId) ?? 0;
  const popularity = 1 / (1 + c.rank / 5);
  const titleSim =
    jaccard(tokenize(c.name), Array.from(profile.titleTokens)) * 0.5;
  const score =
    genreScore * 1.6 + sourceScore * 0.5 + popularity * 0.6 + titleSim;
  const labels = matched
    .sort((a, b) => (profile.genres.get(b) ?? 0) - (profile.genres.get(a) ?? 0))
    .slice(0, 3)
    .map(k => profile.genreLabels.get(k) ?? k);
  const parts: string[] = [];
  if (labels.length) parts.push(`لأنك تحب ${labels.join('، ')}`);
  if (c.rank < 10) parts.push(`من الأكثر شهرة في ${c.pluginName}`);
  else parts.push(`رائجة في ${c.pluginName}`);
  if (!labels.length && sourceScore >= 0.5) {
    parts.push('من مصدر تقرأ منه كثيراً');
  }
  return { ...c, score, why: parts.join(' · '), matchedGenres: labels };
};

/** Ranks candidates, dropping those already in the library (by path or title). */
export const rankCandidates = (
  profile: TasteProfile,
  candidates: Candidate[],
  library: { name: string; path: string; pluginId: string }[],
  limit = 12,
): ScoredCandidate[] => {
  const libPaths = new Set(library.map(n => `${n.pluginId}::${n.path}`));
  const libTitles = new Set(library.map(n => normalizeText(n.name)));
  const seen = new Set<string>();
  return candidates
    .filter(c => !libPaths.has(`${c.pluginId}::${c.path}`))
    .filter(c => !libTitles.has(normalizeText(c.name)))
    .filter(c => {
      const k = normalizeText(c.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(c => scoreCandidate(profile, c))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};
