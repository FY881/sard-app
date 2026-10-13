/**
 * Small MMKV-backed stores for Sard 1.1 settings and lists (synchronous, with
 * a React hook that re-renders on change). All keys start with SARD_.
 */
import { useEffect, useState } from 'react';
import { MMKVStorage, getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import type { WpmState } from './logic/readingTime';
import { emptyProfiles, type ProfilesState } from './logic/profiles';
import type { SmartFilter } from './logic/library';
import { emptyFreeze, type CustomChallenge, type FreezeState } from './logic/motivation';
import { DEFAULT_CLEANUP, DEFAULT_SCHEDULER, type CleanupSettings, type SchedulerSettings } from './logic/offline';
import { DEFAULT_LOCK, type LockSettings } from './logic/lock';
import type { LookSettings } from './logic/themes';

export interface MmkvState<T> {
  key: string;
  get: () => T;
  set: (v: T) => void;
  update: (fn: (v: T) => T) => T;
  use: () => [T, (v: T) => void];
}

export const mmkvState = <T>(key: string, fallback: () => T, merge = true): MmkvState<T> => {
  const get = (): T => {
    const v = getMMKVObject<T>(key);
    if (v === undefined || v === null) return fallback();
    if (merge && typeof v === 'object' && !Array.isArray(v)) return { ...fallback(), ...v };
    return v;
  };
  const set = (v: T) => setMMKVObject(key, v);
  const update = (fn: (v: T) => T) => {
    const next = fn(get());
    set(next);
    return next;
  };
  const use = (): [T, (v: T) => void] => {
    const [value, setValue] = useState<T>(get);
    useEffect(() => {
      setValue(get());
      // Optional chaining: some test doubles of MMKV have no listener API.
      const sub = MMKVStorage.addOnValueChangedListener?.(k => {
        if (k === key) setValue(get());
      });
      return () => sub?.remove();
    }, []);
    return [value, set];
  };
  return { key, get, set, update, use };
};

export type PageSound = 'off' | 'paper' | 'click' | 'chime';

export interface PlusReaderSettings {
  blueLight: boolean;
  /** 0..0.6 overlay opacity */
  blueLightStrength: number;
  nightSchedule: boolean;
  nightStart: string;
  nightEnd: string;
  /** reader theme id (Sard theme or "default-dark") used at night */
  nightTheme: string;
  haptics: boolean;
  sound: PageSound;
  soundVolume: number;
  showChapterTime: boolean;
  sessionMinutes: number;
  look: LookSettings;
}

export const DEFAULT_PLUS_READER: PlusReaderSettings = {
  blueLight: false,
  blueLightStrength: 0.25,
  nightSchedule: false,
  nightStart: '21:30',
  nightEnd: '06:30',
  nightTheme: 'default-dark',
  haptics: false,
  sound: 'off',
  soundVolume: 0.5,
  showChapterTime: true,
  sessionMinutes: 25,
  look: { ornaments: true, dropCap: false, progressBar: true, texture: 'none' },
};

export const plusReaderSettings = mmkvState<PlusReaderSettings>('SARD_PLUS_READER', () => DEFAULT_PLUS_READER);
export const wpmStore = mmkvState<WpmState | undefined>('SARD_WPM', () => undefined, false);
export const profilesStore = mmkvState<ProfilesState>('SARD_READER_PROFILES', emptyProfiles);
export const hiddenStore = mmkvState<number[]>('SARD_HIDDEN_NOVELS', () => [], false);
export const upNextStore = mmkvState<number[]>('SARD_UP_NEXT', () => [], false);
export const smartFiltersStore = mmkvState<SmartFilter[]>('SARD_SMART_FILTERS', () => [], false);
export const achievementsStore = mmkvState<{ unlocked: Record<string, number> }>('SARD_ACHIEVEMENTS', () => ({ unlocked: {} }));
export const challengesStore = mmkvState<{ done: Record<string, number>; custom: CustomChallenge[] }>('SARD_CHALLENGES', () => ({ done: {}, custom: [] }));
export const freezeStore = mmkvState<FreezeState>('SARD_STREAK_FREEZE', emptyFreeze);
export const schedulerStore = mmkvState<SchedulerSettings>('SARD_DOWNLOAD_SCHEDULER', () => DEFAULT_SCHEDULER);
export const cleanupStore = mmkvState<CleanupSettings & { lastRunAt?: number }>('SARD_SMART_CLEANUP', () => DEFAULT_CLEANUP);
export const lockStore = mmkvState<LockSettings>('SARD_APP_LOCK', () => DEFAULT_LOCK);
export const autoBackupStore = mmkvState<{ enabled: boolean; interval: 'daily' | 'weekly'; lastAt?: number; keep: number }>('SARD_AUTO_BACKUP', () => ({ enabled: false, interval: 'weekly', keep: 5 }));
export const agentScheduleStore = mmkvState<{ enabled: boolean; interval: 'daily' | 'weekly'; lastAt?: number; watcher: boolean; picks: boolean; tidy: boolean }>('SARD_AGENT_SCHEDULE', () => ({ enabled: false, interval: 'daily', watcher: true, picks: true, tidy: false }));
export const customAgentsStore = mmkvState<{ id: string; name: string; commands: string[] }[]>('SARD_CUSTOM_AGENTS', () => [], false);
export const countersStore = mmkvState<{ exports: number; readerModePages: number }>('SARD_COUNTERS', () => ({ exports: 0, readerModePages: 0 }));
export const quoteStore = mmkvState<{ day?: string; highlightId?: number; hiddenDay?: string }>('SARD_QUOTE_OF_DAY', () => ({}));

export const bumpCounter = (k: 'exports' | 'readerModePages', by = 1) =>
  countersStore.update(c => ({ ...c, [k]: (c[k] ?? 0) + by }));

/** Every Sard 1.1 MMKV key (backup / reset). */
export const PLUS_KEYS = [
  plusReaderSettings, wpmStore, profilesStore, hiddenStore, upNextStore, smartFiltersStore, achievementsStore,
  challengesStore, freezeStore, schedulerStore, cleanupStore, lockStore, autoBackupStore, agentScheduleStore,
  customAgentsStore, countersStore, quoteStore,
].map(s => s.key);
