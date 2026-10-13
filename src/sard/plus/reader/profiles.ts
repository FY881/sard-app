/** Reader profiles: capture the current reader look, apply one, apply the profile bound to a novel. */
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import { CHAPTER_READER_SETTINGS, initialChapterReaderSettings } from '@hooks/persisted/useSettings';
import { getSardReaderSettings, setSardReaderSettings, type SardReaderSettings } from '../../reader/settings';
import { profilesStore } from '../store';
import { READER_PROFILE_FIELDS, SARD_PROFILE_FIELDS, addProfile, bindProfile, pick, profileForNovel, removeProfile, type ReaderProfile } from '../logic/profiles';

const currentReader = () => ({ ...initialChapterReaderSettings, ...(getMMKVObject<Record<string, unknown>>(CHAPTER_READER_SETTINGS) ?? {}) }) as Record<string, unknown>;

export const saveCurrentAsProfile = (name: string): ReaderProfile => {
  const { state, profile } = addProfile(profilesStore.get(), {
    name,
    reader: pick(currentReader(), READER_PROFILE_FIELDS),
    sard: pick(getSardReaderSettings() as unknown as Record<string, unknown>, SARD_PROFILE_FIELDS),
  });
  profilesStore.set(state);
  return profile;
};

export const applyProfile = (p: ReaderProfile) => {
  setMMKVObject(CHAPTER_READER_SETTINGS, { ...currentReader(), ...p.reader });
  setSardReaderSettings(p.sard as Partial<SardReaderSettings>);
};

export const deleteProfile = (id: string) => profilesStore.set(removeProfile(profilesStore.get(), id));

export const bindNovelProfile = (novelId: number, id: string | null) => profilesStore.set(bindProfile(profilesStore.get(), novelId, id));

/** Called when a novel opens in the reader; returns the applied profile. */
export const applyBoundProfile = (novelId: number): ReaderProfile | undefined => {
  try {
    const p = profileForNovel(profilesStore.get(), novelId);
    if (p) applyProfile(p);
    return p;
  } catch {
    return undefined;
  }
};
