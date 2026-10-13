/** Vocabulary helpers: word normalisation and Leitner spaced repetition. */
const TASHKEEL = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

export const normalizeWord = (w: string): string =>
  (w || '')
    .replace(TASHKEEL, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s'-]/gu, '')
    .trim()
    .toLowerCase();

/** A selection becomes a vocabulary entry only if it is one to three words. */
export const isVocabCandidate = (text: string): boolean => {
  const words = normalizeWord(text).split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 3 && words.join('').length <= 40;
};

/** Sentence around the selection, trimmed to ~200 chars. */
export const contextSentence = (full: string, word: string, max = 200): string => {
  const text = (full || '').replace(/\s+/g, ' ').trim();
  const i = text.indexOf(word.trim());
  if (i < 0) return text.slice(0, max);
  let s = i;
  while (s > 0 && !/[.!?؟。\n]/.test(text[s - 1]) && i - s < max / 2) s--;
  let e = i + word.length;
  while (e < text.length && !/[.!?؟。\n]/.test(text[e]) && e - i < max / 2) e++;
  return text.slice(s, Math.min(text.length, e + 1)).trim();
};

export const LEITNER_DAYS = [0, 1, 2, 4, 8, 16];
export const MAX_BOX = 5;
const DAY = 86_400_000;

export const nextReview = (box: number, correct: boolean, now = Date.now()) => {
  const nextBox = correct ? Math.min(MAX_BOX, Math.max(1, box) + 1) : 1;
  return { box: nextBox, dueAt: now + LEITNER_DAYS[nextBox] * DAY };
};

export const isDue = (e: { dueAt: number }, now = Date.now()) => e.dueAt <= now;
