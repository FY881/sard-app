/**
 * Daily local usage counter per AI feature.
 *
 * Protects the user's FREE provider quota: every request is counted on the
 * device before it is sent, and a feature stops (with a clear Arabic message)
 * once its configurable daily cap — or the global cap — is reached. Pure logic
 * over a tiny key/value store so it is unit-testable without MMKV.
 */
import type { AIFeature } from './types';

export interface KeyValueStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

/** 0 means "no local cap" for that entry. */
export interface QuotaLimits {
  dailyTotal: number;
  perFeature: Record<AIFeature, number>;
}

export const DEFAULT_QUOTA_LIMITS: QuotaLimits = {
  dailyTotal: 200,
  perFeature: {
    recap: 30,
    summary: 30,
    glossary: 40,
    ask: 60,
    agent: 60,
    test: 0,
  },
};

export interface QuotaDay {
  day: string;
  counts: Partial<Record<AIFeature, number>>;
}

export interface QuotaState {
  today: QuotaDay;
  /** Up to 7 previous days, newest first, for the usage chart. */
  history: QuotaDay[];
}

export type QuotaCheck =
  | { ok: true; remainingFeature: number; remainingTotal: number }
  | {
      ok: false;
      reason: 'feature' | 'total' | 'tier';
      limit: number;
      used: number;
    };

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Local calendar day key (the user's clock, not UTC). */
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const QUOTA_STATE_KEY = 'SARD_AI_QUOTA_STATE';
export const QUOTA_LIMITS_KEY = 'SARD_AI_QUOTA_LIMITS';

const sumCounts = (counts: Partial<Record<AIFeature, number>>) =>
  Object.entries(counts).reduce(
    (acc, [feature, n]) => (feature === 'test' ? acc : acc + (n ?? 0)),
    0,
  );

export class QuotaCounter {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getLimits(): QuotaLimits {
    const raw = this.store.getString(QUOTA_LIMITS_KEY);
    if (!raw) return DEFAULT_QUOTA_LIMITS;
    try {
      const parsed = JSON.parse(raw) as Partial<QuotaLimits>;
      return {
        dailyTotal: sanitizeLimit(
          parsed.dailyTotal,
          DEFAULT_QUOTA_LIMITS.dailyTotal,
        ),
        perFeature: {
          ...DEFAULT_QUOTA_LIMITS.perFeature,
          ...Object.fromEntries(
            Object.entries(parsed.perFeature ?? {}).map(([k, v]) => [
              k,
              sanitizeLimit(
                v,
                DEFAULT_QUOTA_LIMITS.perFeature[k as AIFeature] ?? 0,
              ),
            ]),
          ),
        },
      };
    } catch {
      return DEFAULT_QUOTA_LIMITS;
    }
  }

  setLimits(limits: QuotaLimits) {
    this.store.set(QUOTA_LIMITS_KEY, JSON.stringify(limits));
  }

  /** Reads state and rolls the day over when the local date changed. */
  getState(): QuotaState {
    const today = dayKey(this.now());
    let state: QuotaState = { today: { day: today, counts: {} }, history: [] };
    const raw = this.store.getString(QUOTA_STATE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as QuotaState;
        if (parsed?.today?.day) state = parsed;
      } catch {
        // corrupted → start fresh
      }
    }
    if (state.today.day !== today) {
      const history = [state.today, ...(state.history ?? [])]
        .filter(d => d.day < today && sumCounts(d.counts) > 0)
        .slice(0, 7);
      state = { today: { day: today, counts: {} }, history };
      this.save(state);
    }
    return state;
  }

  private save(state: QuotaState) {
    this.store.set(QUOTA_STATE_KEY, JSON.stringify(state));
  }

  used(feature: AIFeature): number {
    return this.getState().today.counts[feature] ?? 0;
  }

  usedTotal(): number {
    return sumCounts(this.getState().today.counts);
  }

  check(feature: AIFeature, amount = 1): QuotaCheck {
    const limits = this.getLimits();
    const state = this.getState();
    const used = state.today.counts[feature] ?? 0;
    const total = sumCounts(state.today.counts);
    const featureLimit = limits.perFeature[feature] ?? 0;
    const counted = feature !== 'test';
    if (featureLimit > 0 && used + amount > featureLimit) {
      return { ok: false, reason: 'feature', limit: featureLimit, used };
    }
    if (counted && limits.dailyTotal > 0 && total + amount > limits.dailyTotal) {
      return { ok: false, reason: 'total', limit: limits.dailyTotal, used: total };
    }
    return {
      ok: true,
      remainingFeature:
        featureLimit > 0 ? featureLimit - used - amount : Infinity,
      remainingTotal:
        limits.dailyTotal > 0 ? limits.dailyTotal - total - amount : Infinity,
    };
  }

  consume(feature: AIFeature, amount = 1) {
    const state = this.getState();
    state.today.counts[feature] = (state.today.counts[feature] ?? 0) + amount;
    this.save(state);
  }

  /** Gives a request back (e.g. it never reached the provider). */
  refund(feature: AIFeature, amount = 1) {
    const state = this.getState();
    const next = Math.max(0, (state.today.counts[feature] ?? 0) - amount);
    state.today.counts[feature] = next;
    this.save(state);
  }

  resetToday() {
    const state = this.getState();
    state.today.counts = {};
    this.save(state);
  }
}

const sanitizeLimit = (value: unknown, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
};
