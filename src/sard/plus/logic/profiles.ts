/** Named reader profiles (snapshot of LNReader + Sard reader settings) bound to novels. */
export interface ReaderProfile {
  id: string;
  name: string;
  createdAt: number;
  /** Subset of LNReader ChapterReaderSettings (theme, textColor, textSize, …). */
  reader: Record<string, unknown>;
  /** Subset of Sard reader settings (tashkeel, focus, …). */
  sard: Record<string, unknown>;
}

export interface ProfilesState {
  profiles: ReaderProfile[];
  /** novelId → profile id */
  bindings: Record<string, string>;
}

export const READER_PROFILE_FIELDS = [
  'theme',
  'textColor',
  'textSize',
  'textAlign',
  'padding',
  'fontFamily',
  'lineHeight',
] as const;

export const SARD_PROFILE_FIELDS = [
  'tashkeel',
  'stripTatweel',
  'kashida',
  'direction',
  'digits',
  'fontWeight',
  'wordSpacing',
  'paragraphSpacing',
  'textIndent',
  'focusMode',
  'autoScrollSpeed',
] as const;

export const pick = <T extends Record<string, unknown>>(obj: T, keys: readonly string[]) => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
};

export const emptyProfiles = (): ProfilesState => ({ profiles: [], bindings: {} });

export const addProfile = (
  state: ProfilesState,
  p: Omit<ReaderProfile, 'id' | 'createdAt'>,
  now = Date.now(),
): { state: ProfilesState; profile: ReaderProfile } => {
  const name = p.name.trim() || `#${state.profiles.length + 1}`;
  const profile: ReaderProfile = {
    ...p,
    name,
    id: `p${now.toString(36)}${state.profiles.length}`,
    createdAt: now,
    reader: pick(p.reader, READER_PROFILE_FIELDS),
    sard: pick(p.sard, SARD_PROFILE_FIELDS),
  };
  return { state: { ...state, profiles: [...state.profiles, profile] }, profile };
};

export const removeProfile = (state: ProfilesState, id: string): ProfilesState => ({
  profiles: state.profiles.filter(p => p.id !== id),
  bindings: Object.fromEntries(Object.entries(state.bindings).filter(([, v]) => v !== id)),
});

export const bindProfile = (state: ProfilesState, novelId: number, id: string | null): ProfilesState => {
  const bindings = { ...state.bindings };
  if (id && state.profiles.some(p => p.id === id)) bindings[String(novelId)] = id;
  else delete bindings[String(novelId)];
  return { ...state, bindings };
};

export const profileForNovel = (state: ProfilesState, novelId: number): ReaderProfile | undefined => {
  const id = state.bindings[String(novelId)];
  return id ? state.profiles.find(p => p.id === id) : undefined;
};
