/** Cached sard-repo.json manifests keyed by repository url. */
import { useMMKVObject } from 'react-native-mmkv';
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import type { SardRepoManifest } from './sardMeta';

export const REPO_MANIFESTS_KEY = 'SARD_REPO_MANIFESTS';

export const saveRepoManifest = (repoUrl: string, manifest: SardRepoManifest) => {
  const all = getMMKVObject<Record<string, SardRepoManifest>>(REPO_MANIFESTS_KEY) ?? {};
  setMMKVObject(REPO_MANIFESTS_KEY, { ...all, [repoUrl]: manifest });
};

export const useRepoManifest = (repoUrl: string): SardRepoManifest | undefined => {
  const [all] = useMMKVObject<Record<string, SardRepoManifest>>(REPO_MANIFESTS_KEY);
  return all?.[repoUrl];
};
