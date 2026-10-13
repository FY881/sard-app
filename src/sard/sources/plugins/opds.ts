import { FilterTypes, Filters } from '@plugins/types/filterTypes';
import {
  ChapterItem,
  NovelItem,
  NovelStatus,
  PluginSettings,
  PopularNovelsOptions,
  SourceNovel,
} from '@plugins/types';
import { Storage } from '@plugins/helpers/storage';
import { downloadFile } from '@plugins/helpers/fetch';
import { getUserAgent } from '@hooks/persisted/useUserAgent';
import NativeFile from '@modules/native-file';
import NativeZipArchive from '@modules/native-zip-archive';
import { epub } from '@modules/nitro-epub';
import { PLUGIN_STORAGE } from '@utils/Storages';

import { SARD_SOURCE_STRINGS as S } from '../strings';
import { getText, LruCache, SourceError } from '../shared/http';
import { escapeHtml, humanizeAuthorName, uniq } from '../shared/text';
import {
  fillSearchTemplate,
  formatLabel,
  isOpdsFeedType,
  nextPageLink,
  OpdsEntry,
  OpdsFeed,
  parseOpds,
  parseOpenSearchTemplate,
  pickEpub,
  searchLink,
} from '../shared/opds';
import {
  BundledPlugin,
  LANG_MULTI,
  SARD_BUILTIN_URL_SCHEME,
} from '../shared/types';

/**
 * Generic OPDS catalog client (OPDS 1.x Atom and OPDS 2.0 JSON), meant for
 * the user's own servers or catalogs they choose: Calibre-web, Kavita,
 * Komga, COPS, Gutenberg's feed, etc.
 *
 * - Catalog URL, username and password come from the source settings.
 * - Browse follows the selected feed (root by default); navigation entries
 *   seen along the way become options of the «القسم» filter.
 * - A book with an EPUB acquisition is downloaded once, unzipped and read
 *   chapter-by-chapter with the app's native EPUB parser (nitro-epub);
 *   otherwise its acquisition links are shown as one chapter.
 */

export const OPDS_PLUGIN_ID = 'sard.opds';
const storage = new Storage(OPDS_PLUGIN_ID);

const pluginSettings: PluginSettings = {
  catalogUrl: { label: S.opdsCatalogUrl, value: '', type: 'Text' },
  username: { label: S.opdsUsername, value: '', type: 'Text' },
  password: { label: S.opdsPassword, value: '', type: 'Text' },
};

/* -------------------------------- settings -------------------------------- */

const setting = (key: string): string => {
  const v = storage.get(key);
  return typeof v === 'string' ? v.trim() : '';
};

export const catalogUrl = () => {
  const url = setting('catalogUrl');
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
};

/** UTF-8 safe base64 (no reliance on btoa/TextEncoder/unescape). */
export const base64 = (input: string) => {
  let bytes = '';
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      bytes += String.fromCharCode(cp);
    } else if (cp < 0x800) {
      bytes += String.fromCharCode(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    } else if (cp < 0x10000) {
      bytes += String.fromCharCode(
        0xe0 | (cp >> 12),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
    } else {
      bytes += String.fromCharCode(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
    }
  }
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes.charCodeAt(i);
    const b = bytes.charCodeAt(i + 1);
    const c = bytes.charCodeAt(i + 2);
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    out +=
      chars[(n >> 18) & 63] +
      chars[(n >> 12) & 63] +
      (i + 1 < bytes.length ? chars[(n >> 6) & 63] : '=') +
      (i + 2 < bytes.length ? chars[n & 63] : '=');
  }
  return out;
};

export const authHeaders = (): Record<string, string> => {
  const user = setting('username');
  const pass = setting('password');
  const headers: Record<string, string> = {
    Accept:
      'application/atom+xml;profile=opds-catalog, application/opds+json, application/atom+xml, application/xml;q=0.9, */*;q=0.8',
  };
  if (user || pass) {
    headers.Authorization = `Basic ${base64(`${user}:${pass}`)}`;
  }
  return headers;
};

export const hashString = (s: string) => {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 33) ^ c;
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
};

/* --------------------------------- fetching ------------------------------- */

const feedCache = new LruCache<OpdsFeed>(30);

export const fetchFeed = async (url: string): Promise<OpdsFeed> => {
  const cached = feedCache.get(url);
  if (cached) return cached;
  let body: string;
  try {
    body = await getText(url, { headers: authHeaders() });
  } catch (e) {
    if (e instanceof SourceError && (e.status === 401 || e.status === 403)) {
      throw new SourceError(S.opdsAuthRequired, e.status);
    }
    throw e;
  }
  let feed: OpdsFeed;
  try {
    feed = parseOpds(body, url);
  } catch {
    throw new SourceError(S.errParse);
  }
  feedCache.set(url, feed);
  return feed;
};

const requireCatalog = () => {
  const url = catalogUrl();
  if (!url) throw new SourceError(S.opdsNotConfigured);
  return url;
};

/* ------------------------------ entry kinds ------------------------------- */

const SOCIAL_HOSTS =
  /(^|\.)(facebook\.com|bsky\.app|twitter\.com|x\.com|instagram\.com|mastodon\.[a-z]+|youtube\.com)$/i;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

export const isSocialEntry = (entry: OpdsEntry) =>
  !!entry.navigation && SOCIAL_HOSTS.test(hostOf(entry.navigation.href));

const realImage = (url?: string): url is string =>
  !!url && !url.startsWith('data:');

/**
 * Some catalogs (e.g. Gutenberg) list each book as a navigation entry that
 * points to a one-book acquisition feed. Treat such entries as books.
 */
export const isBookLikeEntry = (entry: OpdsEntry) => {
  if (entry.acquisitions.length) return true;
  if (!entry.navigation || isSocialEntry(entry)) return false;
  return (
    entry.authors.length > 0 ||
    realImage(entry.cover) ||
    realImage(entry.thumbnail) ||
    /\/ebooks\/\d+\.opds$/.test(entry.navigation.href)
  );
};

/* ----------------------------- navigation filter -------------------------- */

interface NavOption {
  label: string;
  value: string;
}

const NAV_KEY = 'navOptions';

const readNavOptions = (): NavOption[] => {
  const v = storage.get(NAV_KEY);
  return Array.isArray(v) ? v : [];
};

export const rememberNavigation = (feed: OpdsFeed) => {
  const known = readNavOptions();
  const next = [...known];
  const add = (label: string, href: string) => {
    if (!label || !href || next.some(o => o.value === href)) return;
    next.push({ label: label.slice(0, 60), value: href });
  };
  feed.entries
    .filter(e => e.navigation && !isBookLikeEntry(e) && !isSocialEntry(e))
    .forEach(e => add(e.title, e.navigation!.href));
  feed.links
    .filter(
      l =>
        l.rel &&
        /sort\/new|sort\/popular|featured|recommended|shelf/.test(l.rel) &&
        isOpdsFeedType(l.type),
    )
    .forEach(l => add(l.title || l.rel!.split('/').pop()!, l.href));
  if (next.length !== known.length) storage.set(NAV_KEY, next.slice(0, 60));
};

/** Clears remembered sections (call when the catalog URL changes). */
export const resetNavigation = () => storage.delete(NAV_KEY);

const buildFilters = (): Filters => ({
  feed: {
    label: S.opdsFeed,
    type: FilterTypes.Picker,
    value: '',
    options: [{ label: S.opdsRoot, value: '' }, ...readNavOptions()],
  },
  customFeed: {
    label: S.opdsCustomFeed,
    type: FilterTypes.TextInput,
    value: '',
  },
});

/* -------------------------------- entries --------------------------------- */

const ENTRY_PREFIX = 'entry:';

/** Ids are not always unique in the wild, so key entries by id + title. */
export const entryKey = (entry: OpdsEntry) =>
  `${entry.id || ''}|${entry.title || ''}`;

export const bookPath = (entry: OpdsEntry, feedUrl: string) =>
  `book/${hashString(entryKey(entry))}?feed=${encodeURIComponent(
    feedUrl,
  )}&id=${encodeURIComponent(entryKey(entry))}`;

export const parseBookPath = (path: string) => {
  const q = path.split('?')[1] || '';
  const params: Record<string, string> = {};
  q.split('&').forEach(kv => {
    const [k, v] = kv.split('=');
    if (k) params[k] = decodeURIComponent(v || '');
  });
  return { feed: params.feed, id: params.id };
};

const cacheEntry = (entry: OpdsEntry, key = entryKey(entry)) =>
  storage.set(ENTRY_PREFIX + key, entry);

const getEntry = async (path: string): Promise<OpdsEntry> => {
  const { feed, id } = parseBookPath(path);
  const cached = storage.get(ENTRY_PREFIX + id) as OpdsEntry | undefined;
  if (cached) return cached;
  if (feed) {
    const f = await fetchFeed(feed);
    const found = f.entries.find(e => entryKey(e) === id);
    if (found) {
      cacheEntry(found);
      return found;
    }
  }
  throw new SourceError(S.errNotFound, 404);
};

export const entriesToNovels = (
  feed: OpdsFeed,
  feedUrl: string,
): NovelItem[] =>
  feed.entries
    .filter(e => isBookLikeEntry(e) || (!e.navigation && e.entryDocument))
    .map(e => {
      cacheEntry(e);
      return {
        id: undefined,
        name: e.title || S.untitled,
        path: bookPath(e, feedUrl),
        cover: [e.thumbnail, e.cover].find(realImage),
      };
    });

const PREFERRED_NAV = {
  latest: /sort\/new|recent|latest|new|أحدث|جديد/i,
  popular:
    /sort\/popular|popular|hot|on deck|featured|all books|الأكثر|كل الكتب/i,
};

const pickNavigation = (feed: OpdsFeed, latest: boolean) => {
  const re = latest ? PREFERRED_NAV.latest : PREFERRED_NAV.popular;
  const rel = feed.links.find(
    l => l.rel && re.test(l.rel) && isOpdsFeedType(l.type),
  );
  if (rel) return rel.href;
  const navs = feed.entries.filter(
    e => e.navigation && !isSocialEntry(e) && !isBookLikeEntry(e),
  );
  const byTitle = navs.find(e => re.test(e.title));
  if (byTitle) return byTitle.navigation!.href;
  return navs[0]?.navigation?.href;
};

const pageLinks = new Map<string, string | null>();

/** Returns the URL of page N of a feed, walking "next" links as needed. */
const feedPageUrl = async (firstUrl: string, page: number) => {
  let url = firstUrl;
  for (let p = 1; p < page; p++) {
    const key = `${firstUrl}|${p + 1}`;
    if (pageLinks.has(key)) {
      const known = pageLinks.get(key);
      if (!known) return undefined;
      url = known;
      continue;
    }
    const feed = await fetchFeed(url);
    const next = nextPageLink(feed)?.href || null;
    pageLinks.set(key, next);
    if (!next) return undefined;
    url = next;
  }
  return url;
};

const listFeed = async (firstUrl: string, page: number, latest: boolean) => {
  let url = firstUrl;
  // descend through navigation-only feeds (max depth 3) to reach books
  for (let depth = 0; depth < 3; depth++) {
    const feed = await fetchFeed(url);
    rememberNavigation(feed);
    if (feed.entries.some(isBookLikeEntry)) break;
    const nav = pickNavigation(feed, latest);
    if (!nav || nav === url) break;
    url = nav;
  }
  const pageUrl = await feedPageUrl(url, page);
  if (!pageUrl) return [];
  const feed = await fetchFeed(pageUrl);
  rememberNavigation(feed);
  return entriesToNovels(feed, pageUrl);
};

const searchTemplates = new Map<string, string | null>();

const resolveSearchTemplate = async (root: string) => {
  if (searchTemplates.has(root)) return searchTemplates.get(root);
  const feed = await fetchFeed(root);
  const link = searchLink(feed);
  let template: string | null = null;
  if (link) {
    if (link.href.includes('{searchTerms') || link.href.includes('{query')) {
      template = link.href;
    } else if (/opensearchdescription/i.test(link.type || '')) {
      try {
        const xml = await getText(link.href, { headers: authHeaders() });
        template = parseOpenSearchTemplate(xml, link.href) || null;
      } catch {
        template = null;
      }
    } else {
      template =
        link.href + (link.href.includes('?') ? '&' : '?') + 'q={searchTerms}';
    }
  }
  searchTemplates.set(root, template);
  return template;
};

/* ---------------------------------- EPUB ---------------------------------- */

const bookDir = (hash: string) =>
  `${PLUGIN_STORAGE}/${OPDS_PLUGIN_ID}/books/${hash}`;

interface ExtractedBook {
  dir: string;
  chapters: { name: string; path: string }[];
  name?: string;
  author?: string;
  summary?: string;
  cover?: string;
}

const extracted = new LruCache<ExtractedBook>(4);

const ensureEpub = async (
  hash: string,
  href: string,
): Promise<ExtractedBook> => {
  const cached = extracted.get(hash);
  if (cached) return cached;
  const dir = bookDir(hash);
  const file = `${dir}/book.epub`;
  const out = `${dir}/content`;
  try {
    await NativeFile.mkdir(dir);
    if (!(await NativeFile.exists(file))) {
      await downloadFile(href, file, { headers: authHeaders() });
    }
    if (!(await NativeFile.exists(out))) {
      await NativeFile.mkdir(out);
      await NativeZipArchive.unzip(file, out);
    }
    const parsed = await epub.parseNovelAndChapters(out);
    const book: ExtractedBook = {
      dir: out,
      chapters: parsed.chapters,
      name: parsed.name,
      author: parsed.author,
      summary: parsed.summary,
      cover: parsed.cover ? `file://${parsed.cover}` : undefined,
    };
    extracted.set(hash, book);
    return book;
  } catch (e) {
    // corrupt/partial download: remove so the next attempt starts clean
    try {
      if (await NativeFile.exists(dir)) await NativeFile.unlink(dir);
    } catch {
      // ignore
    }
    throw new SourceError(
      S.opdsEpubFailed + (e instanceof Error ? ` (${e.message})` : ''),
    );
  }
};

const decodePath = (p: string) => {
  try {
    return decodeURI(p);
  } catch {
    return p;
  }
};

/** Keeps the <body> and points relative src/href at the extracted files. */
export const rewriteEpubChapter = (html: string, chapterFile: string) => {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const dir = chapterFile.replace(/[^/]*$/, '');
  return body.replace(
    /(\s(?:src|href|xlink:href)\s*=\s*)(["'])(.*?)\2/gi,
    (m, pre: string, q: string, url: string) => {
      if (!url || /^(https?:|data:|file:|mailto:|#)/i.test(url)) return m;
      try {
        const abs = new URL(url, `file://${dir}`).toString();
        return `${pre}${q}${abs}${q}`;
      } catch {
        return m;
      }
    },
  );
};

export const linksHtml = (entry: OpdsEntry) => {
  const items = entry.acquisitions
    .map(
      a =>
        `<li><a href="${escapeHtml(a.href)}">${escapeHtml(
          a.title || formatLabel(a.type),
        )}</a> <small>(${escapeHtml(formatLabel(a.type))})</small></li>`,
    )
    .join('');
  return `<div dir="rtl"><h2>${escapeHtml(entry.title)}</h2><p>${escapeHtml(
    S.opdsNoEpub,
  )}</p><ul>${items}</ul>${entry.contentHtml || ''}</div>`;
};

/* --------------------------------- plugin --------------------------------- */

const opdsPlugin = {
  id: OPDS_PLUGIN_ID,
  name: S.opdsName,
  site: 'https://opds.io',
  lang: LANG_MULTI,
  version: '1.0.0',
  url: `${SARD_BUILTIN_URL_SCHEME}opds`,
  iconUrl: 'https://opds.io/apple-touch-icon.png',
  isBuiltIn: true as const,
  licenseNote: S.opdsLicenseNote,
  licenseUrl: 'https://specs.opds.io/',
  pluginSettings,
  // Computed from settings so covers of a protected catalog load too.
  get imageRequestInit() {
    return { headers: { 'User-Agent': getUserAgent(), ...authHeaders() } };
  },
  // Computed from the catalog's remembered sections.
  get filters(): Filters {
    return buildFilters();
  },

  async popularNovels(
    pageNo: number,
    options?: PopularNovelsOptions<Filters>,
  ): Promise<NovelItem[]> {
    const root = requireCatalog();
    const values = options?.filters as any;
    const custom = ((values?.customFeed?.value as string) || '').trim();
    const picked = (values?.feed?.value as string) || '';
    const start = custom ? new URL(custom, root).toString() : picked || root;
    if (options?.showLatestNovels && !custom && !picked) {
      const feed = await fetchFeed(root);
      rememberNavigation(feed);
      const latest = pickNavigation(feed, true);
      return listFeed(latest || root, pageNo, true);
    }
    return listFeed(start, pageNo, !!options?.showLatestNovels);
  },

  async searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]> {
    const root = requireCatalog();
    const template = await resolveSearchTemplate(root);
    if (!template) throw new SourceError(S.opdsSearchUnsupported);
    const first = fillSearchTemplate(template, searchTerm);
    const url = await feedPageUrl(first, pageNo);
    if (!url) return [];
    const feed = await fetchFeed(url);
    return entriesToNovels(feed, url);
  },

  async parseNovel(novelPath: string): Promise<SourceNovel> {
    requireCatalog();
    const { id: pathKey } = parseBookPath(novelPath);
    let entry = await getEntry(novelPath);
    if (!entry.acquisitions.length && entry.navigation) {
      // one-book acquisition feed (Gutenberg style): take its richest entry
      const sub = await fetchFeed(entry.navigation.href);
      const withAcq = sub.entries.filter(e => e.acquisitions.length);
      const best = withAcq.find(e => pickEpub(e)) || withAcq[0];
      if (best) {
        entry = {
          ...best,
          id: entry.id,
          title: best.title || entry.title,
          cover: realImage(best.cover) ? best.cover : entry.cover,
          thumbnail: realImage(best.thumbnail)
            ? best.thumbnail
            : entry.thumbnail,
          authors: best.authors.length ? best.authors : entry.authors,
        };
        cacheEntry(entry, pathKey);
      }
    }
    const hash = hashString(pathKey || entryKey(entry));
    const epubLink = pickEpub(entry);
    let chapters: ChapterItem[];
    let book: ExtractedBook | undefined;
    if (epubLink) {
      storage.set(`epub:${hash}`, epubLink.href);
      book = await ensureEpub(hash, epubLink.href);
      chapters = book.chapters.map((c, i) => ({
        name: c.name || S.chapterN(i + 1),
        path: `epub/${hash}/${i}`,
        chapterNumber: i + 1,
      }));
    } else {
      storage.set(`links:${hash}`, entry);
      chapters = [
        { name: S.opdsDownloadLink, path: `links/${hash}`, chapterNumber: 1 },
      ];
    }
    const formats = uniq(entry.acquisitions.map(a => formatLabel(a.type)));
    const summary = [
      entry.summary || book?.summary || '',
      [
        entry.series
          ? `السلسلة: ${entry.series}${
              entry.seriesIndex ? ` #${entry.seriesIndex}` : ''
            }`
          : '',
        entry.publisher ? `الناشر: ${entry.publisher}` : '',
        entry.published
          ? `${S.publishedLabel}: ${entry.published.slice(0, 10)}`
          : '',
        entry.language ? `${S.language}: ${entry.language}` : '',
        formats.length ? `${S.opdsFormats}: ${formats.join('، ')}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      entry.rights ? `${S.licenseLabel}: ${entry.rights}` : '',
      S.opdsLicenseNote,
    ]
      .filter(Boolean)
      .join('\n\n');
    return {
      id: undefined,
      name: entry.title || book?.name || S.untitled,
      path: novelPath,
      cover: [entry.cover, entry.thumbnail].find(realImage) || book?.cover,
      author:
        entry.authors.map(humanizeAuthorName).join('، ') || book?.author,
      artist: entry.contributors.join('، ') || undefined,
      genres: uniq(entry.categories.map(c => c.label || c.term)).join(', '),
      status: NovelStatus.Completed,
      summary,
      chapters,
    };
  },

  async parseChapter(chapterPath: string): Promise<string> {
    const epubMatch = chapterPath.match(/^epub\/([0-9a-f]+)\/(\d+)$/);
    if (epubMatch) {
      const [, hash, idx] = epubMatch;
      const href = storage.get(`epub:${hash}`) as string | undefined;
      if (!href) throw new SourceError(S.errChapterMissing, 404);
      const book = await ensureEpub(hash, href);
      const chapter = book.chapters[Number(idx)];
      if (!chapter) throw new SourceError(S.errChapterMissing, 404);
      const file = decodePath(chapter.path);
      const html = await NativeFile.readFile(file);
      return rewriteEpubChapter(html, file);
    }
    const linksMatch = chapterPath.match(/^links\/([0-9a-f]+)/);
    if (linksMatch) {
      const entry = storage.get(`links:${linksMatch[1]}`) as
        | OpdsEntry
        | undefined;
      if (!entry) throw new SourceError(S.errChapterMissing, 404);
      return linksHtml(entry);
    }
    throw new SourceError(S.errChapterMissing, 404);
  },

  resolveUrl(path: string, isNovel?: boolean) {
    const root = catalogUrl();
    if (isNovel && path.startsWith('book/')) {
      const { feed } = parseBookPath(path);
      return feed || root;
    }
    return root;
  },
};

export default opdsPlugin as unknown as BundledPlugin;
