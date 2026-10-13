import { FilterTypes, Filters } from '@plugins/types/filterTypes';
import {
  NovelItem,
  NovelStatus,
  PopularNovelsOptions,
  SourceNovel,
} from '@plugins/types';
import { getUserAgent } from '@hooks/persisted/useUserAgent';

import { SARD_SOURCE_STRINGS as S } from '../strings';
import {
  getText,
  LruCache,
  singleFlight,
  SourceError,
  buildQuery,
} from '../shared/http';
import { splitBookHtml, SplitChapter, stripTags } from '../shared/html';
import { parseOpdsAtom, OpdsEntry } from '../shared/opds';
import {
  humanizeAuthorName,
  plainTextToHtml,
  stripGutenbergTextBoilerplate,
  uniq,
} from '../shared/text';
import { BundledPlugin, LANG_MULTI, SARD_BUILTIN_URL_SCHEME } from '../shared/types';

/**
 * Project Gutenberg (public domain in the USA).
 *
 * Listing/search/metadata use the official gutenberg.org OPDS feeds
 * (`/ebooks/search.opds/`, `/ebooks/<id>.opds`), which support language,
 * subject and author filters through query prefixes (l. s. a.).
 * gutendex.com was evaluated first but answered 503/timeouts and sits behind
 * a Cloudflare challenge, so it is not used.
 *
 * Chapters: the book's single-file HTML
 * (`/cache/epub/<id>/pg<id>-images.html`) split by headings; plain-text
 * fallback (`pg<id>.txt`) when there is no HTML edition.
 */

const SITE = 'https://www.gutenberg.org';
const PAGE_SIZE = 25;

const languageOptions = [
  { label: S.all, value: '' },
  { label: 'العربية', value: 'ar' },
  { label: 'English', value: 'en' },
  { label: 'Français', value: 'fr' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Español', value: 'es' },
  { label: 'Italiano', value: 'it' },
  { label: 'Português', value: 'pt' },
  { label: 'Nederlands', value: 'nl' },
  { label: 'Suomi', value: 'fi' },
  { label: 'Svenska', value: 'sv' },
  { label: 'Dansk', value: 'da' },
  { label: 'Norsk', value: 'no' },
  { label: 'Polski', value: 'pl' },
  { label: 'Русский', value: 'ru' },
  { label: 'Ελληνικά', value: 'el' },
  { label: 'Latina', value: 'la' },
  { label: 'Esperanto', value: 'eo' },
  { label: 'Magyar', value: 'hu' },
  { label: 'Tagalog', value: 'tl' },
  { label: '中文', value: 'zh' },
  { label: '日本語', value: 'ja' },
];

const subjectOptions = [
  { label: S.all, value: '' },
  { label: 'روايات (Fiction)', value: 'fiction' },
  { label: 'خيال علمي', value: 'science fiction' },
  { label: 'فانتازيا', value: 'fantasy' },
  { label: 'مغامرات', value: 'adventure stories' },
  { label: 'غموض وتحقيق', value: 'detective and mystery stories' },
  { label: 'رعب', value: 'horror tales' },
  { label: 'أشباح', value: 'ghost stories' },
  { label: 'رومانسية', value: 'love stories' },
  { label: 'روايات تاريخية', value: 'historical fiction' },
  { label: 'قصص قصيرة', value: 'short stories' },
  { label: 'حكايات خرافية', value: 'fairy tales' },
  { label: 'أدب الأطفال', value: 'juvenile fiction' },
  { label: 'قصص البحر', value: 'sea stories' },
  { label: 'قصص الحرب', value: 'war stories' },
  { label: 'الغرب الأمريكي', value: 'western stories' },
  { label: 'فكاهة', value: 'humorous stories' },
  { label: 'أدب الرسائل', value: 'epistolary fiction' },
  { label: 'شعر', value: 'poetry' },
  { label: 'مسرح', value: 'drama' },
  { label: 'فلسفة', value: 'philosophy' },
  { label: 'تاريخ', value: 'history' },
  { label: 'سير ذاتية', value: 'biography' },
  { label: 'رحلات', value: 'voyages and travels' },
];

const filters = {
  sort: {
    label: S.sortBy,
    type: FilterTypes.Picker,
    value: 'downloads',
    options: [
      { label: S.gutenbergSortPopular, value: 'downloads' },
      { label: S.gutenbergSortDescending, value: 'release_date' },
      { label: 'أبجديًا', value: 'title' },
      { label: 'عشوائي', value: 'random' },
    ],
  },
  language: {
    label: S.language,
    type: FilterTypes.Picker,
    value: '',
    options: languageOptions,
  },
  subject: {
    label: S.gutenbergTopic,
    type: FilterTypes.Picker,
    value: '',
    options: subjectOptions,
  },
  customSubject: {
    label: 'موضوع مخصّص (بالإنجليزية)',
    type: FilterTypes.TextInput,
    value: '',
  },
  author: {
    label: S.authorLabel,
    type: FilterTypes.TextInput,
    value: '',
  },
} satisfies Filters;

type GutenbergFilters = typeof filters;

export interface GutenbergBook {
  id: string;
  title: string;
  author?: string;
  cover: string;
  summary?: string;
  subjects: string[];
  language?: string;
  rights?: string;
  downloads?: string;
  published?: string;
  readingLevel?: string;
  credits?: string;
  epubUrl?: string;
}

export const bookIdFromEntry = (entry: OpdsEntry): string | undefined => {
  const fromId = entry.id.match(/(?:urn:gutenberg:|\/ebooks\/)(\d+)/);
  if (fromId) return fromId[1];
  const nav = entry.navigation?.href.match(/\/ebooks\/(\d+)\.opds/);
  return nav?.[1];
};

export const coverUrl = (id: string) =>
  `${SITE}/cache/epub/${id}/pg${id}.cover.medium.jpg`;

export const buildSearchQuery = (
  term: string,
  values?: Partial<Record<keyof GutenbergFilters, { value: unknown }>>,
) => {
  const parts: string[] = [];
  if (term.trim()) parts.push(term.trim());
  const lang = values?.language?.value as string | undefined;
  const subject =
    ((values?.customSubject?.value as string | undefined) || '').trim() ||
    (values?.subject?.value as string | undefined) ||
    '';
  const author = ((values?.author?.value as string | undefined) || '').trim();
  if (subject) parts.push(`s.${subject}`);
  if (author) parts.push(`a.${author}`);
  if (lang) parts.push(`l.${lang}`);
  return parts.join(' ');
};

export const searchUrl = (query: string, sort: string, page: number) =>
  `${SITE}/ebooks/search.opds/?${buildQuery({
    query: query || undefined,
    sort_order: sort,
    start_index: page > 1 ? (page - 1) * PAGE_SIZE + 1 : undefined,
  })}`;

export const parseListing = (xml: string): NovelItem[] => {
  const feed = parseOpdsAtom(xml, SITE);
  const seen = new Set<string>();
  const items: NovelItem[] = [];
  feed.entries.forEach(entry => {
    const id = bookIdFromEntry(entry);
    if (!id || seen.has(id)) return;
    seen.add(id);
    items.push({
      id: undefined,
      name: entry.title || S.untitled,
      path: `ebooks/${id}`,
      cover: coverUrl(id),
    });
  });
  return items;
};

/** Reads the "Key: value" paragraphs Gutenberg puts in an entry's content. */
export const parseBookEntry = (xml: string, id: string): GutenbergBook => {
  const feed = parseOpdsAtom(xml, SITE);
  const entry =
    feed.entries.find(e => bookIdFromEntry(e) === id && e.acquisitions.length) ||
    feed.entries.find(e => bookIdFromEntry(e) === id) ||
    feed.entries[0];
  if (!entry) throw new SourceError(S.errNotFound, 404);
  const fields: Record<string, string[]> = {};
  const html = entry.contentHtml || '';
  const paragraphs = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
  paragraphs.forEach(p => {
    const text = stripTags(p);
    const m = text.match(/^([A-Za-z .]+?):\s*([\s\S]+)$/);
    if (m) {
      const key = m[1].trim().toLowerCase();
      (fields[key] = fields[key] || []).push(m[2].trim());
    }
  });
  const authorRaw = fields.author?.[0] || entry.authors[0];
  const author = authorRaw
    ? humanizeAuthorName(authorRaw.replace(/,\s*(\d{3,4}\??|BCE?)?\s*-\s*(\d{3,4}\??)?$/, ''))
    : undefined;
  const subjects = uniq(
    [
      ...(fields.subject || []),
      ...entry.categories
        .filter(c => /LCSH/.test(c.scheme || ''))
        .map(c => c.term),
    ].map(s => s.split('--')[0].trim()),
  ).filter(Boolean);
  const epub =
    entry.acquisitions.find(a => /epub3\.images|epub\.images/.test(a.href)) ||
    entry.acquisitions.find(a => a.type === 'application/epub+zip');
  return {
    id,
    title: (fields.title?.[0] || entry.title || S.untitled).replace(/\s+/g, ' '),
    author,
    cover: coverUrl(id),
    summary: fields.summary?.[0]?.replace(/\(This is an automatically generated summary\.\)/, '').trim(),
    subjects,
    language: fields.language?.[0] || entry.language,
    rights: fields.rights?.[0] || entry.rights,
    downloads: fields.downloads?.[0],
    published: fields.published?.[0],
    readingLevel: fields['reading level']?.[0],
    credits: fields.credits?.[0],
    epubUrl: epub?.href,
  };
};

const GUTENBERG_REMOVE = [
  '#pg-header',
  '#pg-footer',
  '.pg-boilerplate',
  '#pg-machine-header',
  '#pg-start-separator',
  '#pg-end-separator',
  'span.pagenum',
  'span.pageno',
  '.pagenum',
];

export const splitGutenbergHtml = (html: string, id: string) =>
  splitBookHtml(html, {
    baseUrl: `${SITE}/cache/epub/${id}/`,
    removeSelectors: GUTENBERG_REMOVE,
  });

export const splitGutenbergText = (text: string) =>
  splitBookHtml(plainTextToHtml(stripGutenbergTextBoilerplate(text)));

const bookCache = new LruCache<SplitChapter[]>(3);
const metaCache = new LruCache<GutenbergBook>(20);
const flight = singleFlight<SplitChapter[]>();

const loadChapters = (id: string): Promise<SplitChapter[]> => {
  const cached = bookCache.get(id);
  if (cached) return Promise.resolve(cached);
  return flight(id, async () => {
    let chapters: SplitChapter[] | undefined;
    try {
      const html = await getText(`${SITE}/cache/epub/${id}/pg${id}-images.html`, {
        timeoutMs: 60000,
      });
      chapters = splitGutenbergHtml(html, id);
    } catch (e) {
      if (!(e instanceof SourceError) || e.status !== 404) throw e;
    }
    if (!chapters || !chapters.length) {
      const text = await getText(`${SITE}/cache/epub/${id}/pg${id}.txt`, {
        timeoutMs: 60000,
      });
      chapters = splitGutenbergText(text);
    }
    bookCache.set(id, chapters);
    return chapters;
  });
};

const idFromPath = (path: string) => {
  const m = path.match(/ebooks\/(\d+)/);
  if (!m) throw new SourceError(S.errNotFound, 404);
  return m[1];
};

export const buildSummary = (book: GutenbergBook) => {
  const lines: string[] = [];
  if (book.summary) lines.push(book.summary);
  const meta: string[] = [];
  if (book.language) meta.push(`${S.language}: ${book.language}`);
  if (book.published) meta.push(`${S.publishedLabel}: ${book.published}`);
  if (book.downloads) meta.push(`${S.gutenbergDownloads}: ${book.downloads}`);
  if (book.readingLevel) meta.push(`${S.seReadingEase}: ${book.readingLevel}`);
  if (meta.length) lines.push(meta.join(' · '));
  lines.push(
    `${S.licenseLabel}: ${book.rights ? book.rights + ' — ' : ''}${S.gutenbergLicense}`,
  );
  if (book.rights && /copyright/i.test(book.rights) && !/public domain/i.test(book.rights)) {
    lines.push(S.gutenbergCopyrighted);
  }
  lines.push(`${S.sourceLabel}: ${SITE}/ebooks/${book.id}`);
  return lines.join('\n\n');
};

const gutenbergPlugin: BundledPlugin = {
  id: 'sard.gutenberg',
  name: S.gutenbergName,
  site: SITE,
  lang: LANG_MULTI,
  version: '1.0.0',
  url: `${SARD_BUILTIN_URL_SCHEME}gutenberg`,
  iconUrl: `${SITE}/gutenberg/pg-logo-129x80.png`,
  isBuiltIn: true,
  licenseNote: S.gutenbergLicense,
  licenseUrl: `${SITE}/policy/license.html`,
  imageRequestInit: { headers: { 'User-Agent': getUserAgent() } },
  filters,

  async popularNovels(
    pageNo: number,
    options?: PopularNovelsOptions<Filters>,
  ): Promise<NovelItem[]> {
    const values = options?.filters as any;
    const sort = options?.showLatestNovels
      ? 'release_date'
      : (values?.sort?.value as string) || 'downloads';
    const query = buildSearchQuery('', values);
    return parseListing(await getText(searchUrl(query, sort, pageNo)));
  },

  async searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]> {
    const n = searchTerm.trim().match(/^#?(\d{1,6})$/);
    const query = n ? `n.${n[1]}` : searchTerm;
    return parseListing(await getText(searchUrl(query, 'downloads', pageNo)));
  },

  async parseNovel(novelPath: string): Promise<SourceNovel> {
    const id = idFromPath(novelPath);
    let book = metaCache.get(id);
    if (!book) {
      book = parseBookEntry(await getText(`${SITE}/ebooks/${id}.opds`), id);
      metaCache.set(id, book);
    }
    const chapters = await loadChapters(id);
    return {
      id: undefined,
      name: book.title,
      path: `ebooks/${id}`,
      cover: book.cover,
      author: book.author,
      genres: book.subjects.slice(0, 8).join(', '),
      status: NovelStatus.Completed,
      summary: buildSummary(book),
      chapters: chapters.map((c, i) => ({
        name: c.title,
        path: `ebooks/${id}/c/${i + 1}`,
        chapterNumber: i + 1,
      })),
    };
  },

  async parseChapter(chapterPath: string): Promise<string> {
    const id = idFromPath(chapterPath);
    const n = Number(chapterPath.match(/\/c\/(\d+)/)?.[1]);
    const chapters = await loadChapters(id);
    const chapter = chapters[n - 1];
    if (!chapter) throw new SourceError(S.errChapterMissing, 404);
    return chapter.html;
  },

  resolveUrl(path: string, isNovel?: boolean) {
    const id = path.match(/ebooks\/(\d+)/)?.[1];
    if (!id) return SITE;
    return isNovel ? `${SITE}/ebooks/${id}` : `${SITE}/cache/epub/${id}/pg${id}-images.html`;
  },
};

export default gutenbergPlugin;
