/**
 * Sard AI service entry point (device instance).
 * Import pure helpers from their own modules in tests; this file pulls MMKV.
 */
import { createAIClient } from './client';
import { getAISettings, getApiKey, getQuota } from './store';
import type { FetchLike } from './types';
import { tierAiCheck } from '../../sard/membership/aiQuota';
import { getCurrentTier, sardFlags } from '../../sard/membership/service';

const deviceFetch: FetchLike = (url, init) =>
  fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>;

export const aiClient = createAIClient({
  getSettings: getAISettings,
  getKey: getApiKey,
  quota: {
    // Local caps first, then the membership tier's daily cap (sard 1.1).
    check: (f, n) =>
      tierAiCheck(
        getQuota().check(f, n),
        f,
        getQuota().usedTotal(),
        n ?? 1,
        getCurrentTier(),
        sardFlags.isEnabled('ai.cloud'),
      ),
    consume: (f, n) => getQuota().consume(f, n),
    refund: (f, n) => getQuota().refund(f, n),
  },
  fetch: deviceFetch,
});

export * from './types';
export * from './errors';
export {
  DEFAULT_AI_SETTINGS,
  normalizeAISettings,
  maskKey,
  looksLikeGeminiKey,
} from './config';
export type { AISettings } from './config';
export {
  getAISettings,
  setAISettings,
  useAISettings,
  getApiKey,
  setApiKey,
  hasApiKey,
  useHasApiKey,
  getQuota,
} from './store';
export {
  GEMINI_SUGGESTED_MODELS,
  GEMINI_DEFAULT_MODEL,
  GEMINI_BASE_URL,
} from './gemini';
export { OPENROUTER_BASE_URL } from './openaiCompat';
export { DEFAULT_QUOTA_LIMITS, dayKey } from './quota';
export type { QuotaLimits, QuotaState } from './quota';
