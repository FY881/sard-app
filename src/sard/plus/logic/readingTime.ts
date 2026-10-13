/** Chapter reading-time estimates and the learned personal reading speed. */

const TAGS = /<[^>]*>/g;
const ENTITY = /&(?:nbsp|amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/gi;
const TASHKEEL = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

export const htmlToText = (html: string): string =>
  (html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/h\d>/gi, '\n')
    .replace(TAGS, ' ')
    .replace(ENTITY, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .trim();

/** Words in mixed Arabic/Latin text (tashkeel/tatweel ignored). */
export const countWords = (text: string): number => {
  const m = (text || '').replace(TASHKEEL, '').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
};

/** Default speeds (words/minute) before anything is learned. */
export const DEFAULT_WPM = { ar: 180, latin: 230 };
export const MIN_WPM = 60;
export const MAX_WPM = 900;

export const arabicShare = (text: string): number => {
  const ar = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return ar + latin === 0 ? 1 : ar / (ar + latin);
};

export const defaultWpmFor = (text: string): number => {
  const share = arabicShare(text);
  return Math.round(DEFAULT_WPM.ar * share + DEFAULT_WPM.latin * (1 - share));
};

export interface ChapterEstimate {
  words: number;
  minutes: number;
  wpm: number;
}

export const estimateChapter = (html: string, learnedWpm?: number): ChapterEstimate => {
  const text = htmlToText(html);
  const words = countWords(text);
  const wpm = clampWpm(learnedWpm || defaultWpmFor(text));
  return { words, wpm, minutes: words === 0 ? 0 : Math.max(1, Math.round(words / wpm)) };
};

export const remainingMinutes = (est: ChapterEstimate, progress01: number): number => {
  const p = Math.min(1, Math.max(0, progress01 || 0));
  if (!est.words) return 0;
  return Math.max(0, Math.ceil((est.words * (1 - p)) / est.wpm));
};

export const clampWpm = (wpm: number) => Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(wpm)));

export interface WpmState {
  wpm: number;
  samples: number;
}

/**
 * Learns from one finished chapter: words read over active time. Outliers
 * (skimming, the phone left open) are ignored; the average is exponential so
 * recent habits count more.
 */
export const learnWpm = (prev: WpmState | undefined, words: number, activeMs: number): WpmState | undefined => {
  if (words < 150 || activeMs < 30_000) return prev;
  const sample = words / (activeMs / 60_000);
  if (sample < MIN_WPM || sample > MAX_WPM) return prev;
  if (!prev || prev.samples === 0) return { wpm: clampWpm(sample), samples: 1 };
  const alpha = prev.samples < 5 ? 0.35 : 0.15;
  return { wpm: clampWpm(prev.wpm * (1 - alpha) + sample * alpha), samples: prev.samples + 1 };
};
