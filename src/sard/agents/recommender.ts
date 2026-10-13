/**
 * Recommender agent (device, no AI needed).
 * Candidates come ONLY from the popular lists of sources the user has
 * installed — it never searches the web or suggests new sources.
 */
import { getPlugin, INSTALLED_PLUGINS_KEY, LOCAL_PLUGIN_ID } from '@plugins/pluginManager';
import type { PluginItem } from '@plugins/types';
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import { addAgentLog } from '../ai/db';
import { loadLibraryNovels } from './library';
import { RECOMMENDER_CACHE_KEY } from './settings';
import {
  buildTasteProfile,
  rankCandidates,
  type Candidate,
  type ScoredCandidate,
  type TasteProfile,
} from './taste';

const DETAILS_CACHE_KEY = 'SARD_AGENT_RECOMMENDER_DETAILS';
const RESULT_TTL = 12 * 3600 * 1000;
const DETAILS_TTL = 7 * 24 * 3600 * 1000;
const MAX_SOURCES = 8;
const PER_SOURCE = 12;

interface CachedResult {
  at: number;
  deep: boolean;
  items: ScoredCandidate[];
  sources: number;
  failed: number;
  topGenres: string[];
}

type DetailsCache = Record<
  string,
  { at: number; genres?: string | null; summary?: string | null }
>;

export interface RecommendationRun {
  items: ScoredCandidate[];
  profile: Pick<TasteProfile, 'topGenres' | 'novelsConsidered'>;
  sources: number;
  failed: number;
  fromCache: boolean;
  at: number;
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

export const getInstalledSources = (): PluginItem[] =>
  (getMMKVObject<PluginItem[]>(INSTALLED_PLUGINS_KEY) ?? []).filter(
    p => p.id !== LOCAL_PLUGIN_ID,
  );

export const getCachedRecommendations = (): RecommendationRun | undefined => {
  const c = getMMKVObject<CachedResult>(RECOMMENDER_CACHE_KEY);
  if (!c) return undefined;
  return {
    items: c.items,
    profile: { topGenres: c.topGenres, novelsConsidered: 0 },
    sources: c.sources,
    failed: c.failed,
    fromCache: true,
    at: c.at,
  };
};

export const getRecommendations = async (
  options: {
    force?: boolean;
    deep?: boolean;
    limit?: number;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number, sourceName: string) => void;
  } = {},
): Promise<RecommendationRun> => {
  const cached = getMMKVObject<CachedResult>(RECOMMENDER_CACHE_KEY);
  if (
    !options.force &&
    cached &&
    Date.now() - cached.at < RESULT_TTL &&
    (!options.deep || cached.deep)
  ) {
    return {
      items: cached.items.slice(0, options.limit ?? cached.items.length),
      profile: { topGenres: cached.topGenres, novelsConsidered: 0 },
      sources: cached.sources,
      failed: cached.failed,
      fromCache: true,
      at: cached.at,
    };
  }

  const library = await loadLibraryNovels();
  const profile = buildTasteProfile(
    library.map(n => ({
      name: n.name,
      pluginId: n.pluginId,
      genres: n.genres,
      totalChapters: n.totalChapters,
      chaptersUnread: n.chaptersUnread,
      inLibrary: true,
    })),
  );
  // Prefer the sources the user reads from most, then the rest.
  const installed = getInstalledSources().sort(
    (a, b) =>
      (profile.sources.get(b.id) ?? 0) - (profile.sources.get(a.id) ?? 0),
  );
  const sources = installed.slice(0, MAX_SOURCES);
  const details = getMMKVObject<DetailsCache>(DETAILS_CACHE_KEY) ?? {};
  const candidates: Candidate[] = [];
  let failed = 0;
  const enrichPerSource = options.deep ? 8 : 3;

  for (let s = 0; s < sources.length; s++) {
    if (options.signal?.aborted) break;
    const item = sources[s];
    options.onProgress?.(s, sources.length, item.name);
    const plugin = getPlugin(item.id);
    if (!plugin) {
      failed++;
      continue;
    }
    try {
      const list = await withTimeout(
        plugin.popularNovels(1, { showLatestNovels: false }),
        20000,
      );
      const top = list.slice(0, PER_SOURCE);
      for (let i = 0; i < top.length; i++) {
        const n = top[i];
        const key = `${item.id}::${n.path}`;
        let d = details[key];
        if ((!d || Date.now() - d.at > DETAILS_TTL) && i < enrichPerSource) {
          try {
            const full = await withTimeout(plugin.parseNovel(n.path), 15000);
            d = { at: Date.now(), genres: full.genres, summary: full.summary };
            details[key] = d;
          } catch {
            // keep going without genres
          }
        }
        candidates.push({
          name: n.name,
          path: n.path,
          pluginId: item.id,
          pluginName: item.name,
          cover: n.cover,
          genres: d?.genres,
          summary: d?.summary,
          rank: i,
        });
      }
    } catch {
      failed++;
    }
  }
  options.onProgress?.(sources.length, sources.length, '');
  // prune details cache
  const pruned: DetailsCache = {};
  Object.entries(details)
    .filter(([, v]) => Date.now() - v.at < DETAILS_TTL)
    .slice(-400)
    .forEach(([k, v]) => (pruned[k] = v));
  setMMKVObject(DETAILS_CACHE_KEY, pruned);

  const items = rankCandidates(profile, candidates, library, 30);
  const result: CachedResult = {
    at: Date.now(),
    deep: !!options.deep,
    items,
    sources: sources.length,
    failed,
    topGenres: profile.topGenres,
  };
  setMMKVObject(RECOMMENDER_CACHE_KEY, result);
  addAgentLog({
    agent: 'recommender',
    action: 'recommend',
    detail: `${items.length} ترشيح من ${sources.length} مصدر`,
  }).catch(() => {});
  return {
    items: items.slice(0, options.limit ?? items.length),
    profile: {
      topGenres: profile.topGenres,
      novelsConsidered: profile.novelsConsidered,
    },
    sources: sources.length,
    failed,
    fromCache: false,
    at: result.at,
  };
};
