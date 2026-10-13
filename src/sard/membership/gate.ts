/** Pure gate decision: feature flag first, then tier, then numeric limit. */
import { FEATURES, type FeatureKey } from './features';
import { limitFor, tierAtLeast, type Tier } from './tiers';

export type GateReason = 'ok' | 'disabled' | 'tier' | 'limit';

export interface GateResult {
  allowed: boolean;
  reason: GateReason;
  /** Tier that unlocks the feature (or the next higher limit). */
  requiredTier: Tier;
  tier: Tier;
  /** Numeric limit for the current tier when the feature has one. */
  limit?: number;
}

export const nextTierWithMoreLimit = (key: FeatureKey, tier: Tier): Tier => {
  const def = FEATURES[key];
  if (!('limit' in def) || !def.limit) return def.tier;
  const order: Tier[] = ['free', 'plus', 'pro', 'legend'];
  const cur = limitFor(def.limit, tier);
  for (const t of order) {
    if (tierAtLeast(t, tier) && t !== tier && limitFor(def.limit, t) > cur) return t;
  }
  return 'legend';
};

/**
 * @param used current usage for limited features (e.g. saved profiles); when
 *             given, `used >= limit` blocks with reason "limit".
 */
export const checkFeature = (
  key: FeatureKey,
  tier: Tier,
  isEnabled: (key: string) => boolean,
  used?: number,
): GateResult => {
  const def = FEATURES[key];
  const limitKey = 'limit' in def ? def.limit : undefined;
  const limit = limitKey ? limitFor(limitKey, tier) : undefined;
  if (!isEnabled(key)) {
    return { allowed: false, reason: 'disabled', requiredTier: def.tier, tier, limit };
  }
  if (!tierAtLeast(tier, def.tier)) {
    return { allowed: false, reason: 'tier', requiredTier: def.tier, tier, limit };
  }
  if (limit !== undefined && used !== undefined && used >= limit) {
    return {
      allowed: false,
      reason: 'limit',
      requiredTier: nextTierWithMoreLimit(key, tier),
      tier,
      limit,
    };
  }
  return { allowed: true, reason: 'ok', requiredTier: def.tier, tier, limit };
};
