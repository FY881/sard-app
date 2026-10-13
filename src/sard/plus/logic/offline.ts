/** Download scheduling conditions, cleanup selection and integrity rules. */
import { isWithinWindow } from './nightSchedule';

export interface SchedulerSettings {
  enabled: boolean;
  wifiOnly: boolean;
  chargingOnly: boolean;
  /** optional window "HH:MM" */
  windowStart?: string;
  windowEnd?: string;
}

export const DEFAULT_SCHEDULER: SchedulerSettings = {
  enabled: false,
  wifiOnly: true,
  chargingOnly: false,
};

export interface DeviceConditions {
  connection: 'wifi' | 'cellular' | 'none' | 'other' | 'unknown';
  charging: boolean | null;
  now: Date;
}

export type WaitReason = 'wifi' | 'charging' | 'window' | 'offline';

export const schedulerBlock = (s: SchedulerSettings, c: DeviceConditions): WaitReason | null => {
  if (!s.enabled) return null;
  if (c.connection === 'none') return 'offline';
  if (s.wifiOnly && c.connection !== 'wifi' && c.connection !== 'unknown') return 'wifi';
  if (s.chargingOnly && c.charging === false) return 'charging';
  if (s.windowStart && s.windowEnd && !isWithinWindow(c.now, s.windowStart, s.windowEnd)) return 'window';
  return null;
};

export interface CleanupSettings {
  enabled: boolean;
  /** delete downloads of chapters read more than N days ago */
  days: number;
  keepBookmarked: boolean;
}

export const DEFAULT_CLEANUP: CleanupSettings = { enabled: false, days: 14, keepBookmarked: true };

export interface DownloadedChapterLite {
  id: number;
  novelId: number;
  unread: boolean;
  bookmark: boolean;
  readTime?: string | null;
}

const parseDbDate = (s?: string | null) => {
  if (!s) return NaN;
  return Date.parse(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
};

export const selectForCleanup = (chapters: DownloadedChapterLite[], s: CleanupSettings, now = Date.now()) =>
  chapters.filter(c => {
    if (c.unread) return false;
    if (s.keepBookmarked && c.bookmark) return false;
    const read = parseDbDate(c.readTime);
    if (!Number.isFinite(read)) return false;
    return now - read >= s.days * 86_400_000;
  });

/** A downloaded chapter whose file is missing or suspiciously empty. */
export const isBrokenDownload = (exists: boolean, size: number | null, html?: string | null) => {
  if (!exists) return true;
  if (size !== null && size < 64) return true;
  if (html !== undefined && html !== null) {
    const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
    return text.length < 20;
  }
  return false;
};

export const formatBytes = (n: number, ar = true): string => {
  const units = ar ? ['بايت', 'ك.ب', 'م.ب', 'ج.ب'] : ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
};

/** How many chapters may still be downloaded under a cap. */
export const remainingOfflineSlots = (downloaded: number, queued: number, cap: number) =>
  cap === Infinity ? Infinity : Math.max(0, cap - downloaded - queued);
