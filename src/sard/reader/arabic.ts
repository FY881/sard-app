/**
 * Pure Arabic text helpers used by the Sard reader.
 *
 * Everything here is side-effect free so it can be unit tested and also
 * serialised into the reader WebView (see `readerInject.ts`), where the same
 * rules run on the live DOM.
 */

export type TashkeelMode = 'show' | 'hide' | 'keepShadda';

/**
 * Harakat and Quranic annotation marks that are safe to remove for display.
 *
 * Deliberately NOT included (removing them would change the letters):
 * - U+0653 ARABIC MADDAH ABOVE, U+0654 HAMZA ABOVE, U+0655 HAMZA BELOW
 *   (used in decomposed آ / أ / إ / ؤ / ئ)
 * - U+0640 TATWEEL (handled by the separate `stripTatweel` option)
 */
export const TASHKEEL_CHARS =
  '\u0610-\u061A\u064B-\u0652\u0656-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u08D3-\u08E1\u08E3-\u08FF';

export const SHADDA = '\u0651';

const TASHKEEL_RE = new RegExp(`[${TASHKEEL_CHARS}]`, 'g');
const TASHKEEL_TEST_RE = new RegExp(`[${TASHKEEL_CHARS}]`);
const TASHKEEL_NO_SHADDA_RE = new RegExp(
  `[${TASHKEEL_CHARS.replace('\u064B-\u0652', '\u064B-\u0650\u0652')}]`,
  'g',
);
const TATWEEL_RE = /\u0640/g;

/** Arabic-script letters (base letters, not marks). */
const ARABIC_LETTER_RE =
  /[\u0621-\u063A\u0641-\u064A\u0671-\u06D3\u06D5\u06EE\u06EF\u06FA-\u06FC\u06FF\u0750-\u077F\u08A0-\u08C9\uFB50-\uFDFF\uFE70-\uFEFC]/;
const HEBREW_LETTER_RE = /[\u05D0-\u05EA\u05F0-\u05F2\uFB1D-\uFB4F]/;
/** Strong left-to-right characters (Latin, Greek, Cyrillic, CJK …). */
const LTR_LETTER_RE =
  /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;

/** Removes diacritics from plain text. */
export const stripTashkeel = (
  text: string,
  mode: TashkeelMode = 'hide',
  stripTatweel = false,
): string => {
  if (!text) return text;
  let out = text;
  if (mode === 'hide') out = out.replace(TASHKEEL_RE, '');
  else if (mode === 'keepShadda') out = out.replace(TASHKEEL_NO_SHADDA_RE, '');
  if (stripTatweel) out = out.replace(TATWEEL_RE, '');
  return out;
};

export const hasTashkeel = (text: string): boolean =>
  TASHKEEL_TEST_RE.test(text);

const RAW_TEXT_TAGS = /^<(script|style|textarea|pre|code)\b/i;

/**
 * Removes diacritics from the text nodes of an HTML fragment while leaving
 * tags, attributes, and script/style contents untouched.
 */
export const stripTashkeelFromHtml = (
  html: string,
  mode: TashkeelMode = 'hide',
  stripTatweel = false,
): string => {
  if (!html || (mode === 'show' && !stripTatweel)) return html;
  const parts = html.split(/(<[^>]*>)/);
  let rawUntil: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (part.charCodeAt(0) === 60 /* < */ && part.endsWith('>')) {
      if (rawUntil) {
        if (part.toLowerCase().startsWith(rawUntil)) rawUntil = null;
      } else {
        const m = RAW_TEXT_TAGS.exec(part);
        if (m && !part.endsWith('/>')) rawUntil = `</${m[1].toLowerCase()}`;
      }
      continue;
    }
    if (rawUntil) continue;
    parts[i] = stripTashkeel(part, mode, stripTatweel);
  }
  return parts.join('');
};

/** Rough plain text of an HTML fragment (for language/direction sniffing). */
export const htmlToPlainSample = (html: string, maxLength = 4000): string =>
  (html || '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .slice(0, maxLength);

export interface ScriptCounts {
  arabic: number;
  hebrew: number;
  ltr: number;
}

export const countScripts = (text: string): ScriptCounts => {
  const counts: ScriptCounts = { arabic: 0, hebrew: 0, ltr: 0 };
  for (const ch of text) {
    if (ARABIC_LETTER_RE.test(ch)) counts.arabic++;
    else if (HEBREW_LETTER_RE.test(ch)) counts.hebrew++;
    else if (LTR_LETTER_RE.test(ch)) counts.ltr++;
  }
  return counts;
};

/** Share of strong characters that are Arabic script (0..1). */
export const arabicRatio = (text: string): number => {
  const c = countScripts(text);
  const total = c.arabic + c.hebrew + c.ltr;
  return total === 0 ? 0 : c.arabic / total;
};

export const isMostlyArabic = (text: string, threshold = 0.4): boolean =>
  arabicRatio(text) >= threshold;

/**
 * Picks the base direction of a chapter from its content. `fallback` is used
 * when the text has no strong characters at all (e.g. only numbers/images).
 */
export const detectDirection = (
  html: string,
  fallback: 'rtl' | 'ltr' = 'ltr',
  threshold = 0.3,
): 'rtl' | 'ltr' => {
  const c = countScripts(htmlToPlainSample(html));
  const total = c.arabic + c.hebrew + c.ltr;
  if (total === 0) return fallback;
  return (c.arabic + c.hebrew) / total >= threshold ? 'rtl' : 'ltr';
};

export type DigitStyle = 'default' | 'arabicIndic' | 'western';

const WESTERN = '0123456789';
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXT_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Converts digits in plain text to the requested style. */
export const convertDigits = (text: string, style: DigitStyle): string => {
  if (style === 'default' || !text) return text;
  if (style === 'arabicIndic') {
    return text.replace(/[0-9۰-۹]/g, d => {
      const w = WESTERN.indexOf(d);
      return ARABIC_INDIC[w >= 0 ? w : EXT_ARABIC_INDIC.indexOf(d)];
    });
  }
  return text.replace(/[٠-٩۰-۹]/g, d => {
    const a = ARABIC_INDIC.indexOf(d);
    return WESTERN[a >= 0 ? a : EXT_ARABIC_INDIC.indexOf(d)];
  });
};

/** Converts digits only inside text nodes of an HTML fragment. */
export const convertDigitsInHtml = (html: string, style: DigitStyle) => {
  if (style === 'default' || !html) return html;
  return html
    .split(/(<[^>]*>)/)
    .map(part =>
      part.startsWith('<') && part.endsWith('>')
        ? part
        : convertDigits(part, style),
    )
    .join('');
};

/** Approximate reading time (minutes) for Arabic or Latin prose. */
export const estimateReadingMinutes = (html: string, wpm?: number): number => {
  const text = htmlToPlainSample(html, Number.MAX_SAFE_INTEGER);
  const words = text.split(/\s+/).filter(Boolean).length;
  // Arabic readers average ~140-180 wpm on screen; Latin ~230.
  const speed = wpm ?? (isMostlyArabic(text) ? 160 : 230);
  return words === 0 ? 0 : Math.max(1, Math.round(words / speed));
};
