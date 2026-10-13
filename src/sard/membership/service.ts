/**
 * Device singletons for memberships + flags (MMKV-backed) and the React hooks
 * `useMembership()` and `useEntitlement('feature.key')`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { getSardDeviceId } from './device';
import {
  MEMBERSHIP_KEY,
  MembershipStore,
  type EffectiveMembership,
  type KeyValueStore,
} from './entitlementStore';
import { LOCAL_FLAGS_KEY, REMOTE_CONFIG_KEY, SardFlags } from './flags';
import { checkFeature, type GateResult } from './gate';
import type { FeatureKey } from './features';
import { SARD_OWNER_PUBLIC_KEY } from './publicKey';
import { limitFor, type LimitKey, type Tier } from './tiers';
import { openPaywall } from './paywallStore';

const kv: KeyValueStore = {
  getString: k => MMKVStorage.getString(k),
  set: (k, v) => MMKVStorage.set(k, v),
};

/** Feature flags (kill switches + signed remote config). */
export const sardFlags = new SardFlags(kv, SARD_OWNER_PUBLIC_KEY);

export const membership = new MembershipStore(kv, {
  publicKeyHex: SARD_OWNER_PUBLIC_KEY,
  deviceId: getSardDeviceId,
  revokedCodeIds: () => sardFlags.revokedCodeIds(),
  isDev: typeof __DEV__ !== 'undefined' && __DEV__,
});

export const getCurrentTier = (): Tier => membership.effective().tier;

/** Non-hook gate for services / background code. */
export const canUse = (key: FeatureKey, used?: number): GateResult =>
  checkFeature(key, getCurrentTier(), k => sardFlags.isEnabled(k), used);

export const currentLimit = (key: LimitKey): number => limitFor(key, getCurrentTier());

/** Runs `fn` when allowed, otherwise shows the paywall sheet. Returns allowed. */
export const requireFeature = (key: FeatureKey, used?: number): boolean => {
  const res = canUse(key, used);
  if (!res.allowed) openPaywall(key, res);
  return res.allowed;
};

const WATCHED = new Set([MEMBERSHIP_KEY, REMOTE_CONFIG_KEY, LOCAL_FLAGS_KEY]);

/** Re-renders when membership state or flags change. */
const useMembershipVersion = () => {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const sub = MMKVStorage.addOnValueChangedListener?.(key => {
      if (WATCHED.has(key)) setVersion(v => v + 1);
    });
    // Expiry is time-based: re-evaluate every minute while mounted.
    const t = setInterval(() => setVersion(v => v + 1), 60_000);
    return () => {
      sub?.remove();
      clearInterval(t);
    };
  }, []);
  return version;
};

export const useMembership = (): EffectiveMembership & {
  canStartTrial: boolean;
  deviceId: string;
} => {
  const version = useMembershipVersion();
  return useMemo(
    () => ({
      ...membership.effective(),
      canStartTrial: membership.canStartTrial(),
      deviceId: getSardDeviceId(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );
};

export interface EntitlementHandle extends GateResult {
  /** Opens the paywall sheet when not allowed; returns `allowed`. */
  gate: (used?: number) => boolean;
  /** Same check against a usage count (limited features). */
  check: (used: number) => GateResult;
}

export const useEntitlement = (key: FeatureKey, used?: number): EntitlementHandle => {
  const version = useMembershipVersion();
  const base = useMemo(
    () => canUse(key, used),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, used, version],
  );
  const gate = useCallback(
    (u?: number) => requireFeature(key, u ?? used),
    [key, used],
  );
  const check = useCallback((u: number) => canUse(key, u), [key]);
  return { ...base, gate, check };
};
