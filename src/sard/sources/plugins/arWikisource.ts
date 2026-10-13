import { load } from 'cheerio';
import { FilterTypes, Filters } from '@plugins/types/filterTypes';
import {
  ChapterItem,
  NovelItem,
  NovelStatus,
  PopularNovelsOptions,
  SourceNovel,
} from '@plugins/types';

import { SARD_SOURCE_STRINGS as S } from '../strings';
import { buildQuery, getJson, LruCache, SourceError } from '../shared/http';
import {
  absolutizeHtml,
  collapseWhitespace,
  splitBookHtml,
  SplitChapter,
} from '../shared/html';
import { escapeHtml } from '../shared/text';
import {
  BundledPlugin,
  LANG_ARABIC,
  SARD_BUILTIN_URL_SCHEME,
} from '../shared/types';

/**
 * Arabic Wikisource (ويكي مصدر) through the MediaWiki Action API.
 * Texts: CC BY-SA 4.0 (most works themselves public domain). Every chapter
 * carries an attribution footer with the page link and license, as CC BY-SA
 * requires.
 *
 * Browse = curated literary categories. On ar.wikisource a work usually
 * appears in a category either as a page (ns 0) or as a sub-category named
 * after it (تصنيف:البخلاء → page «البخلاء»), so both are resolved to pages.
 * Chapters = the main page's own text split by headings (when it carries
 * text) followed by its subpages in the order the main page links them
 * (one nested level expanded), then any remaining subpages.
 */

const SITE = 'https://ar.wikisource.org';
const API = `${SITE}/w/api.php`;
const PAGE_SIZE = 40;
// Wikimedia rate-limits clients whose User-Agent has no contact URL.
const WM_UA =
  'SardReader/1.0 (Android reader, LNReader fork; https://github.com/lnreader/lnreader)';
const WM_HEADERS = {
  'User-Agent': WM_UA,
  'Api-User-Agent': WM_UA,
};

export const CATEGORIES: { label: string; value: string }[] = [
  { label: S.wsCatNovels, value: 'روايات' },
  { label: S.wsCatStories, value: 'قصص' },
  { label: S.wsCatShortStories, value: 'قصص قصيرة' },
  { label: 'قصص شعبية', value: 'قصص شعبية' },
  { label: S.wsCatPlays, value: 'مسرحيات' },
  { label: S.wsCatTranslated, value: 'كتب مترجمة' },
  { label: S.wsCatLiterature, value: 'أدب' },
  { label: S.wsCatPoetryCollections, value: 'دواوين شعر' },
  { label: 'مقامات', value: 'مقامات' },
  { label: 'رحلات', value: 'رحلات' },
  { label: 'أدب فارسي', value: 'أدب فارسي' },
];

const filters = {
  category: {
    label: S.category,
    type: FilterTypes.Picker,
    value: 'روايات',
    options: CATEGORIES,
  },
  sort: {
    label: S.sortBy,
    type: FilterTypes.Picker,
    value: 'sortkey',
    options: [
      { label: S.wsSortTitle, value: 'sortkey' },
      { label: S.wsSortRecent, value: 'timestamp' },
    ],
  },
  customCategory: {
    label: S.wsCustomCategory,
    type: FilterTypes.TextInput,
    value: '',
  },
} satisfies Filters;

// Wikimedia asks clients to send API requests serially; keep a short gap.
let apiQueue: Promise<unknown> = Promise.resolve();
const API_GAP_MS = 120;

const api = <T = any>(
  params: Record<string, string | number | undefined>,
): Promise<T> => {
  const run = () =>
    getJson<T>(
      `${API}?${buildQuery({ format: 'json', formatversion: 2, ...params })}`,
      { headers: WM_HEADERS, retries: 3 },
    );
  const result = apiQueue.then(run, run);
  apiQueue = result
    .catch(() => undefined)
    .then(() => new Promise(res => setTimeout(res, API_GAP_MS)));
  return result;
};

export const titleToPath = (title: string) => title.replace(/ /g, '_');
export const pathToTitle = (path: string) => {
  const raw = path.replace(/^\/?wiki\//, '');
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // keep raw
  }
  return decoded.replace(/_/g, ' ');
};

/* ------------------------------ browse helpers ---------------------------- */

const continuation = new Map<string, Record<string, string> | null>();

interface CmMember {
  ns: number;
  title: string;
}

const fetchCategoryPage = async (
  category: string,
  sort: string,
  page: number,
): Promise<CmMember[]> => {
  const key = (p: number) => `${category}|${sort}|${p}`;
  // walk forward if the token for this page is unknown (e.g. after restart)
  let start = page;
  while (start > 1 && !continuation.has(key(start))) start--;
  let members: CmMember[] = [];
  for (let p = start; p <= page; p++) {
    const cont = p === 1 ? {} : continuation.get(key(p));
    if (cont === null) return [];
    const data: any = await api({
      action: 'query',
      list: 'categorymembers',
      cmtitle: `تصنيف:${category}`,
      cmtype: 'page|subcat',
      cmnamespace: '0|14',
      cmlimit: PAGE_SIZE,
      cmsort: sort === 'timestamp' ? 'timestamp' : 'sortkey',
      cmdir: sort === 'timestamp' ? 'desc' : 'asc',
      ...(cont || {}),
    });
    members = data?.query?.categorymembers || [];
    continuation.set(key(p + 1), data?.continue ? data.continue : null);
  }
  return members;
};

/** Maps members to existing top-level work pages, with thumbnails. */
export const resolveWorks = async (
  members: CmMember[],
): Promise<NovelItem[]> => {
  const candidates: string[] = [];
  members.forEach(m => {
    const t =
      m.ns === 14 ? m.title.replace(/^تصنيف:/, '') : m.ns === 0 ? m.title : '';
    if (t && !t.includes('/') && !candidates.includes(t)) candidates.push(t);
  });
  if (!candidates.length) return [];
  const data: any = await api({
    action: 'query',
    titles: candidates.slice(0, 50).join('|'),
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: 400,
    redirects: 1,
  });
  const pages: any[] = data?.query?.pages || [];
  const redirects: Record<string, string> = {};
  (data?.query?.normalized || []).forEach(
    (r: any) => (redirects[r.from] = r.to),
  );
  (data?.query?.redirects || []).forEach(
    (r: any) => (redirects[r.from] = r.to),
  );
  const byTitle = new Map(
    pages.filter(p => !p.missing && p.ns === 0).map(p => [p.title, p]),
  );
  const out: NovelItem[] = [];
  const seen = new Set<string>();
  candidates.forEach(c => {
    let title = redirects[c] || c;
    title = redirects[title] || title;
    const p = byTitle.get(title);
    if (!p || seen.has(title)) return;
    seen.add(title);
    out.push({
      id: undefined,
      name: title,
      path: titleToPath(title),
      cover: p.thumbnail?.source,
    });
  });
  return out;
};

/* ------------------------------ page parsing ------------------------------ */

const REMOVE = [
  '.ws-noexport',
  '.noprint',
  '#headertemplate',
  '.wst-header',
  '.mw-editsection',
  'style',
  'link',
  '.navbox',
  '.mw-empty-elt',
  '#toc',
  '.toc',
  '.catlinks',
  '.ws-pagenum',
  '.pagenum',
];

export const extractAuthor = (html: string): string | undefined => {
  const $ = load(html, null, false);
  const a = $('a[title^="مؤلف:"]').first();
  if (!a.length) return undefined;
  return (
    collapseWhitespace(a.text()) ||
    (a.attr('title') || '').replace('مؤلف:', '') ||
    undefined
  );
};

/** Ordered list of subpage titles linked from the page body (header excluded). */
export const extractSubpageLinks = (html: string, title: string): string[] => {
  const $ = load(html, null, false);
  $('.ws-noexport, #headertemplate, .wst-header').remove();
  const prefix = `${title}/`;
  const out: string[] = [];
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/^\/wiki\/([^#?]+)/);
    if (!m) return;
    let target: string;
    try {
      target = decodeURIComponent(m[1]).replace(/_/g, ' ');
    } catch {
      return;
    }
    if (target.startsWith(prefix) && !out.includes(target)) out.push(target);
  });
  return out;
};

export const cleanArticleHtml = (html: string) => {
  const $ = load(html, null, false);
  $(REMOVE.join(',')).remove();
  // red links: keep the text only
  $('a.new').each((_, a) => {
    $(a).replaceWith($(a).text());
  });
  return absolutizeHtml($.html(), `${SITE}/wiki/`).replace(
    /(src|href|srcset)="\/\//g,
    '$1="https://',
  );
};

/** Visible prose of a page once link lists / headers are removed. */
export const ownTextLength = (html: string) => {
  const $ = load(cleanArticleHtml(html), null, false);
  $('a').remove();
  return collapseWhitespace($.root().text()).length;
};

const OWN_TEXT_MIN = 3000;

/** First real paragraphs of a page (no link lists), for the summary. */
export const summaryIntro = (html: string, max = 500) => {
  const $ = load(cleanArticleHtml(html), null, false);
  $('ul, ol, table, .toc, h1, h2, h3, h4').remove();
  const paragraphs = $('p')
    .map((_, p) => collapseWhitespace($(p).text()))
    .get()
    .filter(t => t.length > 40);
  const text = paragraphs.join(' ');
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
};

export const attribution = (title: string) =>
  `<hr/><p style="font-size:0.8em;opacity:0.75" dir="rtl">${escapeHtml(
    S.sourceLabel,
  )}: <a href="${SITE}/wiki/${encodeURIComponent(
    titleToPath(title),
  )}">ويكي مصدر — ${escapeHtml(title)}</a> · ${escapeHtml(
    S.licenseLabel,
  )}: <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.ar">CC BY-SA 4.0</a></p>`;

const subpageLabel = (title: string, parent: string) =>
  title.startsWith(parent + '/')
    ? title.slice(parent.length + 1).replace(/\//g, ' — ')
    : title;

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, 'ar', { numeric: true });

/**
 * Builds the chapter order: links on the main page first (expanding one
 * nested level for sub-pages that themselves have children), then any
 * remaining subpages in natural order.
 */
export const orderSubpages = (
  linked: string[],
  all: string[],
  childLinks: Record<string, string[]> = {},
): string[] => {
  const allSet = new Set(all);
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    if (!seen.has(t)) {
      seen.add(t);
      ordered.push(t);
    }
  };
  linked
    .filter(t => allSet.has(t) || !all.length)
    .forEach(t => {
      push(t);
      (childLinks[t] || []).filter(c => allSet.has(c) || !all.length).forEach(push);
      all
        .filter(x => x.startsWith(t + '/'))
        .sort(naturalCompare)
        .forEach(push);
    });
  all
    .filter(t => !seen.has(t))
    .sort(naturalCompare)
    .forEach(push);
  return ordered;
};

interface ParsedPage {
  title: string;
  html: string;
  categories: string[];
}

const pageCache = new LruCache<ParsedPage>(8);
const splitCache = new LruCache<SplitChapter[]>(3);

const parsePage = async (title: string): Promise<ParsedPage> => {
  const cached = pageCache.get(title);
  if (cached) return cached;
  const data: any = await api({
    action: 'parse',
    page: title,
    prop: 'text|categories',
    redirects: 1,
    disableeditsection: 1,
  });
  if (data?.error || !data?.parse) throw new SourceError(S.errNotFound, 404);
  const parsed: ParsedPage = {
    title: data.parse.title,
    html: data.parse.text,
    categories: (data.parse.categories || [])
      .filter((c: any) => !c.hidden)
      .map((c: any) => String(c.category).replace(/_/g, ' ')),
  };
  pageCache.set(title, parsed);
  if (parsed.title !== title) pageCache.set(parsed.title, parsed);
  return parsed;
};

/** All subpages of a work, plus its page image (fetched in the same call). */
const allSubpages = async (
  title: string,
): Promise<{ titles: string[]; cover?: string }> => {
  const out: string[] = [];
  let cover: string | undefined;
  let cont: Record<string, string> | undefined;
  for (let i = 0; i < 6; i++) {
    const data: any = await api({
      action: 'query',
      list: 'allpages',
      apprefix: `${title}/`,
      apnamespace: 0,
      aplimit: 500,
      apfilterredir: 'nonredirects',
      ...(i === 0
        ? {
            titles: title,
            prop: 'pageimages',
            piprop: 'thumbnail',
            pithumbsize: 500,
          }
        : {}),
      ...(cont || {}),
    });
    if (i === 0) cover = data?.query?.pages?.[0]?.thumbnail?.source;
    (data?.query?.allpages || []).forEach((p: any) => out.push(p.title));
    if (!data?.continue?.apcontinue) break;
    cont = {
      apcontinue: data.continue.apcontinue,
      continue: data.continue.continue,
    };
  }
  return { titles: out, cover };
};

const splitMainPage = (page: ParsedPage) => {
  let parts = splitCache.get(page.title);
  if (!parts) {
    parts = splitBookHtml(cleanArticleHtml(page.html));
    splitCache.set(page.title, parts);
  }
  return parts;
};

const wrapChapter = (html: string, title: string) =>
  `<div dir="rtl" lang="ar">${html}</div>${attribution(title)}`;

/* --------------------------------- plugin --------------------------------- */

const arWikisourcePlugin: BundledPlugin = {
  id: 'sard.ar-wikisource',
  name: S.wikisourceName,
  site: SITE,
  lang: LANG_ARABIC,
  version: '1.0.0',
  url: `${SARD_BUILTIN_URL_SCHEME}ar-wikisource`,
  iconUrl:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Wikisource-logo.svg/250px-Wikisource-logo.svg.png',
  isBuiltIn: true,
  licenseNote: S.wikisourceLicense,
  licenseUrl: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
  imageRequestInit: { headers: { ...WM_HEADERS } },
  filters,

  async popularNovels(
    pageNo: number,
    options?: PopularNovelsOptions<Filters>,
  ): Promise<NovelItem[]> {
    const values = options?.filters as any;
    const custom = ((values?.customCategory?.value as string) || '')
      .trim()
      .replace(/^تصنيف:/, '');
    const category = custom || (values?.category?.value as string) || 'روايات';
    const sort = options?.showLatestNovels
      ? 'timestamp'
      : (values?.sort?.value as string) || 'sortkey';
    const members = await fetchCategoryPage(category, sort, pageNo);
    return resolveWorks(members);
  },

  async searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]> {
    const data: any = await api({
      action: 'query',
      list: 'search',
      srsearch: searchTerm,
      srnamespace: 0,
      srlimit: PAGE_SIZE,
      sroffset: (pageNo - 1) * PAGE_SIZE,
      srprop: '',
    });
    const results: any[] = data?.query?.search || [];
    // collapse subpage hits onto their work
    const members = results.map(r => ({
      ns: 0,
      title: String(r.title).split('/')[0],
    }));
    return resolveWorks(members);
  },

  async parseNovel(novelPath: string): Promise<SourceNovel> {
    const title = pathToTitle(novelPath);
    const page = await parsePage(title);
    const realTitle = page.title;
    const author = extractAuthor(page.html);
    const linked = extractSubpageLinks(page.html, realTitle);
    const { titles: all, cover } = await allSubpages(realTitle);

    // expand one nested level: parents that have their own subpages
    const parents = linked
      .filter(t => all.some(x => x.startsWith(t + '/')))
      .slice(0, 15);
    const childLinks: Record<string, string[]> = {};
    for (const parent of parents) {
      try {
        const parsed = await parsePage(parent);
        childLinks[parent] = extractSubpageLinks(parsed.html, parent);
      } catch {
        // ordering falls back to natural sort
      }
    }

    const ordered = orderSubpages(linked, all, childLinks);
    const chapters: ChapterItem[] = [];
    // the main page itself carries the text (or part of it)
    if (!ordered.length || ownTextLength(page.html) >= OWN_TEXT_MIN) {
      const parts = splitMainPage(page);
      parts.forEach((p, i) =>
        chapters.push({
          name: parts.length === 1 ? realTitle : p.title,
          path: `${titleToPath(realTitle)}#sard-part-${i + 1}`,
        }),
      );
    }
    ordered.forEach(t =>
      chapters.push({ name: subpageLabel(t, realTitle), path: titleToPath(t) }),
    );
    chapters.forEach((c, i) => (c.chapterNumber = i + 1));

    const genres = page.categories.filter(
      c => !/^(صفحات|نصوص|مؤلفات|أعمال|Pages|CS1)/.test(c),
    );
    const summary = [
      summaryIntro(page.html),
      `${S.licenseLabel}: ${S.wikisourceLicense}`,
      page.categories.length
        ? S.wsLicenseCategoryNote(page.categories.join('، '))
        : '',
      `${S.sourceLabel}: ${SITE}/wiki/${titleToPath(realTitle)}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      id: undefined,
      name: realTitle,
      path: titleToPath(realTitle),
      cover,
      author,
      genres: genres.join(', '),
      status: NovelStatus.Completed,
      summary,
      chapters,
    };
  },

  async parseChapter(chapterPath: string): Promise<string> {
    const partMatch = chapterPath.match(/^(.*)#sard-part-(\d+)$/);
    if (partMatch) {
      const page = await parsePage(pathToTitle(partMatch[1]));
      const part = splitMainPage(page)[Number(partMatch[2]) - 1];
      if (!part) throw new SourceError(S.errChapterMissing, 404);
      return wrapChapter(part.html, page.title);
    }
    const page = await parsePage(pathToTitle(chapterPath));
    return wrapChapter(cleanArticleHtml(page.html), page.title);
  },

  resolveUrl(path: string) {
    const clean = path.replace(/#sard-part-\d+$/, '');
    return `${SITE}/wiki/${encodeURI(clean)}`;
  },
};

export default arWikisourcePlugin;
