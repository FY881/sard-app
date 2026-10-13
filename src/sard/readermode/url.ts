/** URL helpers for reader mode (pure). */

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"'«»]+/i;
const BARE_DOMAIN =
  /^(?:www\.)?[a-z0-9\u0600-\u06FF-]+(?:\.[a-z0-9\u0600-\u06FF-]+)+(?:[/?#][^\s]*)?$/i;

const TRAILING_PUNCTUATION = /[).,،؛;:!?؟\]}>'"»]+$/;

/** Pulls the first http(s) URL out of shared text such as "Read this: https://…". */
export const extractFirstUrl = (text: string): string | undefined => {
  const match = URL_IN_TEXT.exec(text ?? '');
  if (!match) return undefined;
  return match[0].replace(TRAILING_PUNCTUATION, '');
};

/**
 * Normalizes what the user typed/pasted into an absolute http(s) URL.
 * Accepts bare domains ("example.com/page") by assuming https.
 * Returns undefined for anything that is not a web page address.
 */
export const normalizeUserUrl = (input: string): string | undefined => {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return undefined;
  let candidate = extractFirstUrl(trimmed);
  if (!candidate && BARE_DOMAIN.test(trimmed)) {
    candidate = `https://${trimmed}`;
  }
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (!url.hostname || !url.hostname.includes('.')) return undefined;
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
};

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Resolves `href` against `base`; only http(s) results, fragment dropped. */
export const resolveHttpUrl = (
  href: string,
  base: string,
): string | undefined => {
  if (!href || /^\s*(javascript|mailto|tel|data):/i.test(href))
    return undefined;
  try {
    const url = new URL(href.trim(), base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
};

export const sameSite = (a: string, b: string): boolean => {
  const ha = hostOf(a);
  const hb = hostOf(b);
  return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
};
