/**
 * Device persistence for AI settings, keys and quota (react-native-mmkv).
 *
 * Keys are kept in their own MMKV instance encrypted with a per-install random
 * key, separate from the regular settings blob (which is included in backups).
 * Nothing here is ever hard-coded: the user enters their own free key.
 */
import { createMMKV } from 'react-native-mmkv';
import { useMMKVObject, useMMKVString } from 'react-native-mmkv';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { normalizeAISettings, type AISettings } from './config';
import { QuotaCounter } from './quota';
import type { AIProviderId } from './types';

export const AI_SETTINGS_KEY = 'SARD_AI_SETTINGS';
const SECRET_INSTANCE_SEED_KEY = 'SARD_AI_SECRET_SEED';

const randomSeed = () => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    bytes.forEach(b => (out += alphabet[b % alphabet.length]));
    return out;
  }
  for (let i = 0; i < 16; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
};

const getSecretSeed = () => {
  let seed = MMKVStorage.getString(SECRET_INSTANCE_SEED_KEY);
  if (!seed) {
    seed = randomSeed();
    MMKVStorage.set(SECRET_INSTANCE_SEED_KEY, seed);
  }
  return seed;
};

let secretStore: ReturnType<typeof createMMKV> | undefined;
export const getSecretStore = () => {
  if (!secretStore) {
    secretStore = createMMKV({
      id: 'sard_ai_secrets',
      encryptionKey: getSecretSeed(),
    });
  }
  return secretStore;
};

const keyName = (provider: AIProviderId) =>
  provider === 'gemini' ? 'gemini_api_key' : 'openai_compat_api_key';

export const getApiKey = (provider: AIProviderId): string =>
  getSecretStore().getString(keyName(provider))?.trim() ?? '';

export const setApiKey = (provider: AIProviderId, key: string) => {
  const trimmed = key.trim();
  if (trimmed) getSecretStore().set(keyName(provider), trimmed);
  else getSecretStore().remove(keyName(provider));
};

export const hasApiKey = (provider: AIProviderId) => !!getApiKey(provider);

export const getAISettings = (): AISettings => {
  const raw = MMKVStorage.getString(AI_SETTINGS_KEY);
  try {
    return normalizeAISettings(raw ? JSON.parse(raw) : undefined);
  } catch {
    return normalizeAISettings(undefined);
  }
};

export const setAISettings = (patch: Partial<AISettings>) => {
  const next = normalizeAISettings({ ...getAISettings(), ...patch });
  MMKVStorage.set(AI_SETTINGS_KEY, JSON.stringify(next));
  return next;
};

export const useAISettings = () => {
  const [raw] = useMMKVObject<Partial<AISettings>>(AI_SETTINGS_KEY);
  return {
    settings: normalizeAISettings(raw),
    update: setAISettings,
  };
};

/** Re-renders when the key for `provider` changes. */
export const useHasApiKey = (provider: AIProviderId) => {
  const [value] = useMMKVString(keyName(provider), getSecretStore());
  return !!value?.trim();
};

let quota: QuotaCounter | undefined;
export const getQuota = () => {
  if (!quota) {
    quota = new QuotaCounter({
      getString: k => MMKVStorage.getString(k),
      set: (k, v) => MMKVStorage.set(k, v),
    });
  }
  return quota;
};
