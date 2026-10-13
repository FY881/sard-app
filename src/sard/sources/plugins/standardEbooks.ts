import { load } from 'cheerio';
import { FilterTypes, Filters } from '@plugins/types/filterTypes';
import {
  ChapterItem,
  NovelItem,
  NovelStatus,
  PopularNovelsOptions,
  SourceNovel,
} from '@plugins/types';
import { getUserAgent } from '@hooks/persisted/useUserAgent';

import { SARD_SOURCE_STRINGS as S } from '../strings';
import { buildQuery, getText, LruCache, SourceError } from '../shared/http';
import { absolutizeHtml, collapseWhitespace } from '../shared/html';
import { BundledPlugin, LANG_ENGLISH, SARD_BUILTIN_URL_SCHEME } from '../shared/types';

/**
 * Standard Ebooks — carefully produced public-domain ebooks, CC0.
 * Everything used here is free without a Patron account:
 *   /ebooks?query=&sort=&tags[]=&page=&per-page=   (listing / search)
 *   /ebooks/<author>/<title>                       (metadata)
 *   /ebooks/<author>/<title>/text                  (table of contents)
 *   /ebooks/<author>/<title>/text/<file>           (one chapter per page)
 * The site has a honeypot link (/honeypot) that bans scrapers — never
 * follow arbitrary links; only the endpoints above are requested.
 */

const SITE = 'https://standardebooks.org';
const PER_PAGE = 48;

const TAGS = [
  ['adventure', 'مغامرات'],
  ['autobiography', 'سيرة ذاتية'],
  ['biography', 'سيرة'],
  ['childrens', 'أدب الأطفال'],
  ['comedy', 'كوميديا'],
  ['drama', 'دراما ومسرح'],
  ['fantasy', 'فانتازيا'],
  ['fiction', 'روايات'],
  ['horror', 'رعب'],
  ['memoir', 'مذكرات'],
  ['mystery', 'غموض'],
  ['nonfiction', 'غير روائي'],
  ['philosophy', 'فلسفة'],
  ['poetry', 'شعر'],
  ['satire', 'هجاء'],
  ['science-fiction', 'خيال علمي'],
  ['shorts', 'قصص قصيرة'],
  ['spirituality', 'روحانيات'],
  ['travel', 'رحلات'],
] as const;

export const TAG_LABELS: Record<string, string> = Object.fromEntries(TAGS);

const filters = {
  sort: {
    label: S.sortBy,
    type: FilterTypes.Picker,
    value: 'popularity',
    options: [
      { label: S.seSortPopularity, value: 'popularity' },
      { label: S.seSortNewest, value: 'newest' },
      { label: S.seSortAuthor, value: 'author-alpha' },
      { label: S.seSortReadingEase, value: 'reading-ease' },
      { label: S.seSortLength, value: 'length' },
    ],
  },
  tags: {
    label: S.genre,
    type: FilterTypes.CheckboxGroup,
    value: [] as string[],
    options: TAGS.map(([value, label]) => ({ label, value })),
  },
} satisfies Filters;

export const listingUrl = (opts: {
  page: number;
  sort?: string;
  query?: string;
  tags?: string[];
}) => {
  const base = buildQuery({
    query: opts.query || undefined,
    sort: opts.sort || undefined,
    page: opts.page > 1 ? opts.page : undefined,
    'per-page': PER_PAGE,
    view: 'grid',
  });
  const tags = (opts.tags || [])
    .filter(t => t && t !== 'all')
    .map(t => `tags%5B%5D=${encodeURIComponent(t)}`)
    .join('&');
  return `${SITE}/ebooks?${[base, tags].filter(Boolean).join('&')}`;
};

export const parseListing = (html: string, requestedPage = 1): NovelItem[] => {
  const $ = load(html);
  const current = Number($('nav.pagination a[aria-current="page"]').first().text());
  // Out-of-range pages are answered with the last page; stop there.
  if (requestedPage > 1 && current && current !== requestedPage) return [];
  return $('li[typeof="schema:Book"]')
    .map((_, li) => {
      const $li = $(li);
      const path = ($li.attr('about') || '').replace(/^\//, '');
      if (!path.startsWith('ebooks/')) return undefined;
      const name = collapseWhitespace(
        $li.find('p > a > span[property="schema:name"]').first().text() ||
          $li.find('[property="schema:name"]').first().text(),
      );
      const img = $li.find('img').first().attr('src');
      return {
        id: undefined,
        name: name || S.untitled,
        path,
        cover: img ? new URL(img, SITE).toString() : undefined,
      } as NovelItem;
    })
    .get()
    .filter(Boolean);
};

export interface SeBookMeta {
  name: string;
  author?: string;
  translator?: string;
  cover?: string;
  summary: string;
  genres: string[];
}

export const parseBookPage = (html: string, path: string): SeBookMeta => {
  const $ = load(html);
  const name = collapseWhitespace($('h1[property="schema:name"]').first().text());
  const authors = $('hgroup a[property="schema:author"] span[property="schema:name"]')
    .map((_, el) => collapseWhitespace($(el).text()))
    .get();
  const translators = $('[property="schema:translator"] [property="schema:name"]')
    .map((_, el) => collapseWhitespace($(el).attr('content') || $(el).text()))
    .get()
    .filter(Boolean);
  const cover =
    $('meta[property="schema:image"]').attr('content') ||
    $('meta[property="og:image"]').attr('content') ||
    `${SITE}/${path}/downloads/cover.jpg`;
  const desc = $('[property="schema:description"]').first();
  desc.find('aside, .donation').remove();
  const descText = desc
    .find('p')
    .map((_, p) => collapseWhitespace($(p).text()))
    .get()
    .filter(Boolean)
    .join('\n\n');
  const readingEase = collapseWhitespace($('#reading-ease p').first().text());
  const published = $('meta[property="schema:datePublished"]').attr('content');
  const tags = $('ul.tags li a')
    .map((_, a) => collapseWhitespace($(a).text()))
    .get();
  const subjectSlugs = $('ul.tags li a')
    .map((_, a) => ($(a).attr('href') || '').split('/').pop() || '')
    .get();
  const genres = tags.map((t, i) => TAG_LABELS[subjectSlugs[i]] || t);
  const parts = [descText];
  const meta: string[] = [];
  if (readingEase) meta.push(readingEase);
  if (published) meta.push(`${S.publishedLabel}: ${published}`);
  if (translators.length) meta.push(`${S.translatorLabel}: ${translators.join('، ')}`);
  if (meta.length) parts.push(meta.join(' · '));
  parts.push(`${S.licenseLabel}: ${S.standardEbooksLicense}`);
  parts.push(`${S.sourceLabel}: ${SITE}/${path}`);
  return {
    name: name || S.untitled,
    author: authors.join('، ') || undefined,
    translator: translators.join('، ') || undefined,
    cover,
    summary: parts.filter(Boolean).join('\n\n'),
    genres,
  };
};

const SKIP_FILES = /\/(titlepage|imprint|colophon|uncopyright|halftitlepage|loi)$/;
const CONTAINER_FILES = /\/(book|part|volume|division)-\d+$/;

export const parseToc = (html: string, novelPath: string): ChapterItem[] => {
  const $ = load(html);
  const chapters: ChapterItem[] = [];
  $('nav#toc a[href]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href') || '';
    const file = href.replace(/^\.?\/?/, '').replace(/^text\//, '').split('#')[0];
    if (!file || file.includes('/') || file.includes(':')) return;
    const path = `${novelPath}/text/${file}`;
    if (SKIP_FILES.test(path)) return;
    const hasChildren = $a.parent('li').children('ol').length > 0;
    if (hasChildren && CONTAINER_FILES.test(path)) return;
    if (chapters.some(c => c.path === path)) return;
    chapters.push({
      name: collapseWhitespace($a.text()) || S.chapterN(chapters.length + 1),
      path,
      chapterNumber: chapters.length + 1,
    });
  });
  return chapters;
};

export const parseChapterPage = (html: string, chapterPath: string) => {
  const $ = load(html, { xmlMode: false });
  const main = $('main').first();
  const root = main.length ? main : $('body');
  root.find('a[href*="honeypot"], script, style, nav, footer, header').remove();
  const url = `${SITE}/${chapterPath}`;
  return absolutizeHtml(root.html() || '', url);
};

const meta = new LruCache<SeBookMeta>(20);

const standardEbooksPlugin: BundledPlugin = {
  id: 'sard.standardebooks',
  name: S.standardEbooksName,
  site: SITE,
  lang: LANG_ENGLISH,
  version: '1.0.0',
  url: `${SARD_BUILTIN_URL_SCHEME}standardebooks`,
  iconUrl: `${SITE}/images/logo.png`,
  isBuiltIn: true,
  licenseNote: S.standardEbooksLicense,
  licenseUrl: `${SITE}/about#what-licensing-do-you-use`,
  imageRequestInit: { headers: { 'User-Agent': getUserAgent() } },
  filters,

  async popularNovels(
    pageNo: number,
    options?: PopularNovelsOptions<Filters>,
  ): Promise<NovelItem[]> {
    const values = options?.filters as any;
    const url = listingUrl({
      page: pageNo,
      sort: options?.showLatestNovels ? 'newest' : values?.sort?.value || 'popularity',
      tags: values?.tags?.value || [],
    });
    return parseListing(await getText(url), pageNo);
  },

  async searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]> {
    const url = listingUrl({ page: pageNo, query: searchTerm, sort: 'relevance' });
    return parseListing(await getText(url), pageNo);
  },

  async parseNovel(novelPath: string): Promise<SourceNovel> {
    const path = novelPath.replace(/^\/+|\/+$/g, '');
    if (!/^ebooks\/[^/]+\/[^/]+/.test(path)) throw new SourceError(S.errNotFound, 404);
    const [bookHtml, tocHtml] = await Promise.all([
      meta.get(path) ? Promise.resolve('') : getText(`${SITE}/${path}`),
      getText(`${SITE}/${path}/text`),
    ]);
    let info = meta.get(path);
    if (!info) {
      info = parseBookPage(bookHtml, path);
      meta.set(path, info);
    }
    return {
      id: undefined,
      name: info.name,
      path,
      cover: info.cover,
      author: info.author,
      genres: info.genres.join(', '),
      status: NovelStatus.Completed,
      summary: info.summary,
      chapters: parseToc(tocHtml, path),
    };
  },

  async parseChapter(chapterPath: string): Promise<string> {
    const path = chapterPath.replace(/^\/+/, '');
    return parseChapterPage(await getText(`${SITE}/${path}`), path);
  },

  resolveUrl(path: string) {
    return `${SITE}/${path.replace(/^\/+/, '')}`;
  },
};

export default standardEbooksPlugin;
