/**
 * On-device list of pages the user opened in reader mode. Never synced,
 * shared or uploaded; the user can clear it from the screen.
 */
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';

import { addRecent, type RecentPage } from './recent';
import { bumpCounter } from '../plus/store';

const KEY = 'SARD_READER_MODE_RECENT';

export const getRecentPages = (): RecentPage[] =>
  getMMKVObject<RecentPage[]>(KEY) ?? [];

export const rememberPage = (page: Omit<RecentPage, 'openedAt'>) => {
  setMMKVObject(
    KEY,
    addRecent(getRecentPages(), { ...page, openedAt: Date.now() }),
  );
  // «قارئ الويب» achievement counter (Sard 1.1).
  bumpCounter('readerModePages');
};

export const clearRecentPages = () => setMMKVObject<RecentPage[]>(KEY, []);
