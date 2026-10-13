/**
 * Stable per-device id shown to the user («معرّف الجهاز») so the owner can
 * bind a code to one phone. Android: derived from ANDROID_ID (survives
 * reinstalls of the same signed app); fallback: random id kept in MMKV.
 */
import DeviceInfo from 'react-native-device-info';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { base32Encode } from './base32';
import { sha256Bytes } from './crypto';

const FALLBACK_KEY = 'SARD_DEVICE_FALLBACK_ID';
let cached: string | undefined;

export const formatDeviceId = (seed: string): string => {
  const raw = base32Encode(sha256Bytes('sard-device-id:' + seed)).slice(0, 12);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
};

const randomSeed = () => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const getSardDeviceId = (): string => {
  if (cached) return cached;
  let seed: string | undefined;
  try {
    const anyInfo = DeviceInfo as unknown as { getUniqueIdSync?: () => string };
    seed = anyInfo.getUniqueIdSync?.();
  } catch {
    seed = undefined;
  }
  if (!seed || seed === 'unknown') {
    seed = MMKVStorage.getString(FALLBACK_KEY);
    if (!seed) {
      seed = randomSeed();
      MMKVStorage.set(FALLBACK_KEY, seed);
    }
  }
  cached = formatDeviceId(seed);
  return cached;
};
