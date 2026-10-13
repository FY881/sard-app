/**
 * AI settings model (pure). Persistence lives in `./store.ts`.
 * API keys are NOT part of this object: they live in a separate encrypted
 * MMKV instance and never leave the device except in the provider request.
 */
import { GEMINI_DEFAULT_MODEL } from './gemini';
import {
  OPENAI_COMPAT_DEFAULT_MODEL,
  OPENROUTER_BASE_URL,
} from './openaiCompat';
import type { AIProviderId } from './types';

export interface AISettings {
  /** Master switch for every AI feature and the agent chat. */
  enabled: boolean;
  provider: AIProviderId;
  geminiModel: string;
  openaiBaseUrl: string;
  openaiModel: string;
  /** Max characters of novel text sent in one request. */
  contextBudgetChars: number;
  /** How many previous downloaded chapters feed «ما سبق». */
  recapChapters: number;
  /** Max read chapters indexed for «اسأل الرواية». */
  askMaxChapters: number;
  /** How many retrieved passages go into one answer. */
  askTopChunks: number;
  /** Characters of new text processed per glossary request. */
  glossaryBatchChars: number;
  /** Max glossary requests per build run (protects the quota). */
  glossaryMaxBatchesPerRun: number;
  temperature: number;
  /** Show a recap card automatically before a chapter (reader integration). */
  autoRecapBeforeChapter: boolean;
  /** Summary length preference. */
  summaryLength: 'short' | 'medium' | 'long';
  /** Retry once automatically on a provider 429 when the wait is short. */
  autoRetryOnRateLimit: boolean;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: true,
  provider: 'gemini',
  geminiModel: GEMINI_DEFAULT_MODEL,
  openaiBaseUrl: OPENROUTER_BASE_URL,
  openaiModel: OPENAI_COMPAT_DEFAULT_MODEL,
  contextBudgetChars: 48000,
  recapChapters: 3,
  askMaxChapters: 300,
  askTopChunks: 8,
  glossaryBatchChars: 40000,
  glossaryMaxBatchesPerRun: 6,
  temperature: 0.4,
  autoRecapBeforeChapter: false,
  summaryLength: 'medium',
  autoRetryOnRateLimit: true,
};

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

export const normalizeAISettings = (
  raw: Partial<AISettings> | undefined | null,
): AISettings => {
  const s = { ...DEFAULT_AI_SETTINGS, ...(raw ?? {}) };
  return {
    enabled: s.enabled !== false,
    provider: s.provider === 'openai-compatible' ? 'openai-compatible' : 'gemini',
    geminiModel: String(s.geminiModel || GEMINI_DEFAULT_MODEL).trim(),
    openaiBaseUrl: String(s.openaiBaseUrl || OPENROUTER_BASE_URL).trim(),
    openaiModel: String(s.openaiModel || OPENAI_COMPAT_DEFAULT_MODEL).trim(),
    contextBudgetChars: clampInt(s.contextBudgetChars, 8000, 400000, 48000),
    recapChapters: clampInt(s.recapChapters, 1, 10, 3),
    askMaxChapters: clampInt(s.askMaxChapters, 10, 3000, 300),
    askTopChunks: clampInt(s.askTopChunks, 2, 20, 8),
    glossaryBatchChars: clampInt(s.glossaryBatchChars, 8000, 200000, 40000),
    glossaryMaxBatchesPerRun: clampInt(s.glossaryMaxBatchesPerRun, 1, 30, 6),
    temperature: Math.min(1.5, Math.max(0, Number(s.temperature) || 0)),
    autoRecapBeforeChapter: !!s.autoRecapBeforeChapter,
    summaryLength: (['short', 'medium', 'long'] as const).includes(
      s.summaryLength,
    )
      ? s.summaryLength
      : 'medium',
    autoRetryOnRateLimit: s.autoRetryOnRateLimit !== false,
  };
};

/** Very light sanity check so the settings screen can warn early. */
export const looksLikeGeminiKey = (key: string) =>
  /^AIza[0-9A-Za-z_-]{30,}$/.test(key.trim()) ||
  /^[0-9A-Za-z_.-]{30,}$/.test(key.trim());

export const maskKey = (key: string) => {
  const k = key.trim();
  if (k.length <= 8) return '••••';
  return `${k.slice(0, 4)}••••••${k.slice(-4)}`;
};
