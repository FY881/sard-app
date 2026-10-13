/**
 * Per-tier daily cap for cloud AI requests (user's own key):
 * Free 5 · Plus 50 · Pro 200 · Legend unlimited. Applied on top of the
 * user's own local caps; the connection test never counts.
 */
import type { QuotaCheck } from '@services/ai/quota';
import { limitFor, type Tier } from './tiers';

export const tierAiCheck = (
  base: QuotaCheck,
  feature: string,
  usedTotal: number,
  amount: number,
  tier: Tier,
  enabled: boolean,
): QuotaCheck => {
  if (!base.ok || feature === 'test') return base;
  if (!enabled) return { ok: false, reason: 'total', limit: 0, used: usedTotal };
  const cap = limitFor('aiDaily', tier);
  if (cap !== Infinity && usedTotal + amount > cap) {
    return { ok: false, reason: 'tier', limit: cap, used: usedTotal };
  }
  return {
    ok: true,
    remainingFeature: base.remainingFeature,
    remainingTotal: Math.min(base.remainingTotal, cap === Infinity ? Infinity : cap - usedTotal - amount),
  };
};
