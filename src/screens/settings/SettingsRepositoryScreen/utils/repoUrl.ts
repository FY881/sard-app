/**
 * Pure helpers for adding plugin repositories (paste, clipboard, QR, deep
 * links). Sard ships with NO repositories and never suggests one; these
 * helpers only recognise a URL the user brought themselves.
 */

/** Same acceptance rule as upstream LNReader (`…plugins.min.json`). */
export const REPO_URL_PATTERN =
  /^https?:\/\/\S+plugins\.min\.json(?:[?#]\S*)?$/i;

export const isRepoUrl = (url: string): boolean => {
  const trimmed = url.trim();
  if (!REPO_URL_PATTERN.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
};

const DEEP_LINK = /^(?:lnreader|sard):\/\/repo\/add\?(.*)$/i;

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Finds a repository URL in arbitrary text: a bare URL, text containing
 * one, or a `lnreader://repo/add?url=` / `sard://repo/add?url=` deep link.
 */
export const extractRepoUrl = (
  text: string | null | undefined,
): string | undefined => {
  if (!text) return undefined;
  const trimmed = text.trim();
  const deep = DEEP_LINK.exec(trimmed);
  if (deep) {
    for (const param of deep[1].split('&')) {
      const [key, ...rest] = param.split('=');
      if (key === 'url') {
        const candidate = decode(rest.join('=')).trim();
        return isRepoUrl(candidate) ? candidate : undefined;
      }
    }
    return undefined;
  }
  const matches = trimmed.match(/https?:\/\/[^\s"'<>«»]+/gi) ?? [];
  for (const match of matches) {
    const candidate = match.replace(/[).,،؛;!?؟\]}]+$/, '');
    if (isRepoUrl(candidate)) return candidate;
  }
  return undefined;
};

export interface RepositorySummary {
  count: number;
  arabicCount: number;
  /** Languages sorted by plugin count, most common first. */
  languages: { lang: string; count: number }[];
  /** First plugin names, for the review step. */
  sampleNames: string[];
}

/** Strips bidi marks (LNReader repos write Arabic as "\u200eالعربية"). */
const cleanLang = (lang: string) => lang.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();

const isArabic = (lang: string) =>
  /^(ar|arabic|العربية|عربي)$/i.test(cleanLang(lang));

type PluginEntry = { id: string; name: string; url: string; lang?: string };

const isPluginEntry = (item: unknown): item is PluginEntry =>
  Boolean(item) &&
  typeof item === 'object' &&
  typeof (item as PluginEntry).id === 'string' &&
  typeof (item as PluginEntry).name === 'string' &&
  typeof (item as PluginEntry).url === 'string';

/**
 * Validates repository JSON (an array of plugin entries with at least
 * id/name/url) and summarises it. Throws `not-a-repository` otherwise.
 */
export const summarizeRepository = (json: unknown): RepositorySummary => {
  if (!Array.isArray(json)) {
    throw new Error('not-a-repository');
  }
  const plugins = json.filter(isPluginEntry);
  if (!plugins.length && json.length) {
    throw new Error('not-a-repository');
  }
  const byLang = new Map<string, number>();
  for (const plugin of plugins) {
    const lang = cleanLang(plugin.lang ?? '') || '?';
    byLang.set(lang, (byLang.get(lang) ?? 0) + 1);
  }
  return {
    count: plugins.length,
    arabicCount: plugins.filter(p => isArabic(p.lang ?? '')).length,
    languages: [...byLang.entries()]
      .map(([lang, count]) => ({ lang, count }))
      .sort((a, b) => b.count - a.count || a.lang.localeCompare(b.lang)),
    sampleNames: plugins.slice(0, 5).map(p => p.name),
  };
};

/** Remembers clipboard URLs the user already dismissed (bounded list). */
export const addDismissed = (list: string[], url: string, max = 20): string[] =>
  [url, ...list.filter(item => item !== url)].slice(0, max);
