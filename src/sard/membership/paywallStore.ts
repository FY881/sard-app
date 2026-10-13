/** Global paywall sheet state (one sheet, mounted once in Main). */
import { create } from 'zustand';
import type { FeatureKey } from './features';
import type { GateResult } from './gate';

interface PaywallState {
  featureKey?: FeatureKey;
  result?: GateResult;
  open: (key: FeatureKey, result?: GateResult) => void;
  close: () => void;
}

export const usePaywallStore = create<PaywallState>(set => ({
  featureKey: undefined,
  result: undefined,
  open: (featureKey, result) => set({ featureKey, result }),
  close: () => set({ featureKey: undefined, result: undefined }),
}));

export const openPaywall = (key: FeatureKey, result?: GateResult) =>
  usePaywallStore.getState().open(key, result);
