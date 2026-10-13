/** Pure helpers for choosing Arabic TTS voices. */
export interface VoiceLike {
  identifier: string;
  name: string;
  language?: string;
}

export const isArabicVoice = (v: VoiceLike) =>
  /^ar([-_]|$)/i.test(v.language ?? '') || /^ar[-_]/i.test(v.identifier);

/**
 * Regional preference: novels are written in Modern Standard Arabic, so the
 * MSA voices (Google's "ar-XA", then Saudi) come before dialect voices.
 */
const REGION_ORDER = ['xa', 'sa', 'eg', 'ae', 'jo', 'kw', 'lb', 'ma', 'dz', 'tn'];

const score = (v: VoiceLike, preferredRegion?: string) => {
  const lang = (v.language || v.identifier).toLowerCase().replace('_', '-');
  const region = lang.split('-')[1] ?? '';
  let s = 0;
  if (preferredRegion && region === preferredRegion.toLowerCase()) s += 500;
  const idx = REGION_ORDER.indexOf(region);
  s += idx >= 0 ? (20 - idx) * 10 : 0;
  const id = `${v.identifier} ${v.name}`.toLowerCase();
  // Google TTS ids look like "ar-xa-x-arz-local" / "-network"; local works offline.
  if (id.includes('local')) s += 8;
  if (id.includes('network')) s -= 4;
  if (id.includes('language')) s += 2; // default voice of a language pack
  return s;
};

/** Arabic voices only, best first. */
export const sortArabicVoices = <T extends VoiceLike>(
  voices: T[],
  preferredRegion?: string,
): T[] =>
  voices
    .filter(isArabicVoice)
    .sort(
      (a, b) =>
        score(b, preferredRegion) - score(a, preferredRegion) ||
        a.name.localeCompare(b.name),
    );

export const pickArabicVoice = <T extends VoiceLike>(
  voices: T[],
  preferredRegion?: string,
): T | undefined => sortArabicVoices(voices, preferredRegion)[0];

export const RATE_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2];
