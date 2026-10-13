/**
 * Network type for the Chapter Watcher's "Wi-Fi only" option.
 *
 * The repo has no NetInfo dependency yet. The main agent can wire it with one
 * line after adding `@react-native-community/netinfo`:
 *
 *   import NetInfo from '@react-native-community/netinfo';
 *   setConnectivityProvider(async () => {
 *     const s = await NetInfo.fetch();
 *     if (!s.isConnected) return 'none';
 *     return s.type === 'wifi' ? 'wifi' : s.type === 'ethernet' ? 'ethernet'
 *       : s.type === 'cellular' ? 'cellular' : 'unknown';
 *   });
 *
 * Until then the provider answers 'unknown', and Wi-Fi-only novels are skipped
 * with a clear reason (never silently downloading on mobile data).
 */
import type { ConnectionKind } from './watcherPlan';

type Provider = () => Promise<ConnectionKind>;

/**
 * Default provider: @react-native-community/netinfo, required lazily so pure
 * modules/tests that import this file never load the native module.
 */
const netInfoProvider: Provider = async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NetInfo = require('@react-native-community/netinfo')
    .default as typeof import('@react-native-community/netinfo').default;
  const s = await NetInfo.fetch();
  if (!s.isConnected) return 'none';
  return s.type === 'wifi'
    ? 'wifi'
    : s.type === 'ethernet'
    ? 'ethernet'
    : s.type === 'cellular'
    ? 'cellular'
    : 'unknown';
};

let provider: Provider = netInfoProvider;

export const setConnectivityProvider = (p: Provider) => {
  provider = p;
};

export const getConnectionKind = async (): Promise<ConnectionKind> => {
  try {
    return await provider();
  } catch {
    return 'unknown';
  }
};
