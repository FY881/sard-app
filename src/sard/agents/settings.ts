/**
 * Agent preferences (MMKV): shelf rules, watcher run info, recommender cache.
 */
import { useMMKVObject } from 'react-native-mmkv';
import { MMKVStorage, getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import { DEFAULT_SHELF_RULES, type ShelfRules } from './shelves';

export const SHELF_RULES_KEY = 'SARD_AGENT_SHELF_RULES';
export const WATCHER_STATE_KEY = 'SARD_AGENT_WATCHER_STATE';
export const RECOMMENDER_CACHE_KEY = 'SARD_AGENT_RECOMMENDER_CACHE';

export const getShelfRules = (): ShelfRules => ({
  ...DEFAULT_SHELF_RULES,
  ...(getMMKVObject<Partial<ShelfRules>>(SHELF_RULES_KEY) ?? {}),
});

export const setShelfRules = (patch: Partial<ShelfRules>) =>
  setMMKVObject(SHELF_RULES_KEY, { ...getShelfRules(), ...patch });

export const useShelfRules = () => {
  const [raw] = useMMKVObject<Partial<ShelfRules>>(SHELF_RULES_KEY);
  return { rules: { ...DEFAULT_SHELF_RULES, ...(raw ?? {}) }, setShelfRules };
};

export interface WatcherState {
  lastRunAt?: number;
  lastQueued?: number;
  lastNovels?: number;
  lastSkipReason?: string;
}

export const getWatcherState = (): WatcherState =>
  getMMKVObject<WatcherState>(WATCHER_STATE_KEY) ?? {};

export const setWatcherState = (s: WatcherState) =>
  setMMKVObject(WATCHER_STATE_KEY, s);

export const useWatcherState = () => {
  const [raw] = useMMKVObject<WatcherState>(WATCHER_STATE_KEY);
  return raw ?? {};
};

export const clearRecommenderCache = () =>
  MMKVStorage.remove(RECOMMENDER_CACHE_KEY);
