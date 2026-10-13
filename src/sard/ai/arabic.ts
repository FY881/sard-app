/**
 * Arabic-aware text normalization and tokenization (pure).
 * Used for retrieval, glossary name matching, library dedupe and the agent's
 * novel matcher.
 */

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const PUNCT = /[\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u00A1-\u00BF\u060C\u061B\u061F\u066A-\u066D\u06D4\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20]/g;

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

export const toWesternDigits = (s: string) =>
  s.replace(/[٠-٩۰-۹]/g, d => ARABIC_DIGITS[d] ?? d);

/** Removes diacritics/tatweel and unifies letter variants. */
export const normalizeArabic = (input: string): string =>
  toWesternDigits(input)
    .normalize('NFKC')
    .replace(TASHKEEL, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/گ/g, 'ك')
    .replace(/ڤ/g, 'ف')
    .toLowerCase();

/** Lowercase, Arabic-normalized, punctuation → spaces, collapsed. */
export const normalizeText = (input: string): string =>
  normalizeArabic(input)
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOPWORDS = new Set(
  [
    // Arabic
    'في', 'من', 'الي', 'علي', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك', 'التي',
    'الذي', 'الذين', 'كان', 'كانت', 'ثم', 'او', 'ام', 'ان', 'لا', 'ما', 'ماذا',
    'لماذا', 'كيف', 'متي', 'اين', 'هل', 'هو', 'هي', 'هم', 'انا', 'نحن', 'انت',
    'قد', 'لقد', 'كل', 'بعد', 'قبل', 'عند', 'حتي', 'لم', 'لن', 'يا', 'و', 'ف',
    'ب', 'ل', 'ك', 'اي', 'بين', 'مثل', 'غير', 'منذ', 'ايضا', 'فقط', 'الان',
    // English
    'the', 'a', 'an', 'of', 'to', 'in', 'and', 'or', 'is', 'are', 'was', 'were',
    'what', 'who', 'why', 'how', 'when', 'where', 'did', 'does', 'do', 'he',
    'she', 'it', 'they', 'his', 'her', 'their', 'on', 'at', 'for', 'with',
  ].map(normalizeArabic),
);

/** Strips the common Arabic definite article and attached conjunctions. */
export const lightStem = (token: string): string => {
  let t = token;
  if (t.length > 4 && /^(وال|فال|بال|كال|لل)/.test(t)) t = t.slice(3);
  else if (t.length > 3 && t.startsWith('ال')) t = t.slice(2);
  if (t.length > 4 && /(ات|ون|ين|ها|هم|ه)$/.test(t)) {
    t = t.replace(/(ات|ون|ين|ها|هم|ه)$/, '');
  }
  return t;
};

export const tokenize = (input: string, { stem = true } = {}): string[] =>
  normalizeText(input)
    .split(' ')
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
    .map(t => (stem ? lightStem(t) : t))
    .filter(t => t.length > 1);

/** Levenshtein distance with early exit (for short strings like titles). */
export const editDistance = (a: string, b: string, max = Infinity): number => {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
};

export const jaccard = (a: string[], b: string[]): number => {
  if (!a.length && !b.length) return 1;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  sa.forEach(t => sb.has(t) && inter++);
  return inter / (sa.size + sb.size - inter);
};
