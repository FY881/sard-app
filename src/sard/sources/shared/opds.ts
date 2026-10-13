import { load } from 'cheerio';
import { absolutize, collapseWhitespace, stripTags } from './html';

/**
 * Minimal but complete OPDS 1.x (Atom) and OPDS 2.0 (JSON) reader used by the
 * Project Gutenberg source and by the generic OPDS catalog source.
 */

export interface OpdsLink {
  href: string;
  rel?: string;
  type?: string;
  title?: string;
  length?: number;
  /** opds:facetGroup for facet links */
  facetGroup?: string;
  activeFacet?: boolean;
  count?: number;
}

export interface OpdsCategory {
  term: string;
  label?: string;
  scheme?: string;
}

export interface OpdsEntry {
  id: string;
  title: string;
  authors: string[];
  contributors: string[];
  summary?: string;
  contentHtml?: string;
  updated?: string;
  published?: string;
  language?: string;
  publisher?: string;
  rights?: string;
  series?: string;
  seriesIndex?: number;
  categories: OpdsCategory[];
  links: OpdsLink[];
  cover?: string;
  thumbnail?: string;
  acquisitions: OpdsLink[];
  /** Link to a sub-feed when the entry is a navigation entry. */
  navigation?: OpdsLink;
  /** Link to a full entry document (rel=alternate type=...entry). */
  entryDocument?: OpdsLink;
}

export interface OpdsFeed {
  id?: string;
  title: string;
  subtitle?: string;
  icon?: string;
  entries: OpdsEntry[];
  links: OpdsLink[];
  totalResults?: number;
  itemsPerPage?: number;
  startIndex?: number;
  kind: 'atom' | 'json';
}

export const OPDS_ACQUISITION = 'http://opds-spec.org/acquisition';
const IMAGE_RELS = [
  'http://opds-spec.org/image',
  'http://opds-spec.org/cover',
  'x-stanza-cover-image',
];
const THUMB_RELS = [
  'http://opds-spec.org/image/thumbnail',
  'http://opds-spec.org/thumbnail',
  'x-stanza-cover-image-thumbnail',
];

export const isOpdsFeedType = (type?: string) =>
  !!type &&
  (/application\/atom\+xml/i.test(type) ||
    /application\/opds\+json/i.test(type)) &&
  !/type=entry/i.test(type);

const isAcquisitionRel = (rel?: string) =>
  !!rel && rel.startsWith(OPDS_ACQUISITION);

const NAV_RELS = [
  'subsection',
  'http://opds-spec.org/subsection',
  'http://opds-spec.org/sort/new',
  'http://opds-spec.org/sort/popular',
  'http://opds-spec.org/featured',
  'http://opds-spec.org/recommended',
  'http://opds-spec.org/shelf',
  'collection',
  'related',
  'start',
  'alternate',
];

export const detectOpdsKind = (body: string): 'atom' | 'json' | 'unknown' => {
  const head = body.slice(0, 600).trimStart();
  if (head.startsWith('{')) return 'json';
  if (/<feed[\s>]/i.test(body.slice(0, 4000))) return 'atom';
  return 'unknown';
};

export const parseOpds = (body: string, baseUrl: string): OpdsFeed => {
  const kind = detectOpdsKind(body);
  if (kind === 'json') return parseOpdsJson(JSON.parse(body), baseUrl);
  if (kind === 'atom') return parseOpdsAtom(body, baseUrl);
  throw new Error('not an OPDS feed');
};

/* ------------------------------ Atom (OPDS 1) ----------------------------- */

export const parseOpdsAtom = (xml: string, baseUrl: string): OpdsFeed => {
  const $ = load(xml, { xmlMode: true });
  const feed = $('feed').first();

  const readLinks = (el: any): OpdsLink[] =>
    $(el)
      .children('link')
      .map((_, l) => {
        const $l = $(l);
        const href = $l.attr('href');
        if (!href) return undefined;
        const count = $l.attr('thr:count');
        return {
          href: absolutize(href, baseUrl),
          rel: $l.attr('rel') || undefined,
          type: $l.attr('type') || undefined,
          title: $l.attr('title') || undefined,
          length: $l.attr('length') ? Number($l.attr('length')) : undefined,
          facetGroup: $l.attr('opds:facetGroup') || undefined,
          activeFacet: $l.attr('opds:activeFacet') === 'true' || undefined,
          count: count ? Number(count) : undefined,
        } as OpdsLink;
      })
      .get()
      .filter(Boolean);

  const entries: OpdsEntry[] = feed
    .children('entry')
    .map((_, e) => {
      const $e = $(e);
      const links = readLinks(e);
      const content = $e.children('content').first();
      const contentType = content.attr('type');
      const contentHtml =
        contentType === 'xhtml'
          ? content.children().first().html() || content.html() || ''
          : contentType === 'html'
          ? content.text()
          : content.text()
          ? `<p>${content.text()}</p>`
          : '';
      const summaryEl = $e.children('summary').first();
      const summaryText =
        summaryEl.attr('type') === 'html' || summaryEl.attr('type') === 'xhtml'
          ? stripTags(summaryEl.text() || summaryEl.html() || '')
          : collapseWhitespace(summaryEl.text());
      const categories = $e
        .children('category')
        .map((__, c) => ({
          term: $(c).attr('term') || '',
          label: $(c).attr('label') || undefined,
          scheme: $(c).attr('scheme') || undefined,
        }))
        .get()
        .filter(c => c.term || c.label);
      const acquisitions = links.filter(l => isAcquisitionRel(l.rel));
      const cover = links.find(l => l.rel && IMAGE_RELS.includes(l.rel))?.href;
      const thumbnail = links.find(
        l => l.rel && THUMB_RELS.includes(l.rel),
      )?.href;
      const navigation = acquisitions.length
        ? undefined
        : links.find(
            l =>
              isOpdsFeedType(l.type) &&
              (!l.rel || NAV_RELS.includes(l.rel) || l.rel.startsWith('http://opds-spec.org/')),
          );
      const entryDocument = links.find(
        l => l.type && /type=entry/i.test(l.type),
      );
      const seriesIndexAttr =
        $e.children('calibre\\:series_index').text() ||
        $e.children('schema\\:position').text();
      return {
        id: collapseWhitespace($e.children('id').first().text()),
        title: collapseWhitespace($e.children('title').first().text()),
        authors: $e
          .children('author')
          .map((__, a) => collapseWhitespace($(a).children('name').text()))
          .get()
          .filter(Boolean),
        contributors: $e
          .children('contributor')
          .map((__, a) => collapseWhitespace($(a).children('name').text()))
          .get()
          .filter(Boolean),
        summary: summaryText || undefined,
        contentHtml: contentHtml || undefined,
        updated: $e.children('updated').first().text() || undefined,
        published:
          $e.children('published').first().text() ||
          $e.children('dc\\:issued, dcterms\\:issued').first().text() ||
          undefined,
        language:
          $e.children('dcterms\\:language, dc\\:language').first().text() ||
          undefined,
        publisher:
          $e.children('dcterms\\:publisher, dc\\:publisher').first().text() ||
          undefined,
        rights:
          collapseWhitespace($e.children('rights').first().text()) || undefined,
        series:
          $e.children('calibre\\:series').text() ||
          $e.children('schema\\:Series').attr('schema:name') ||
          undefined,
        seriesIndex: seriesIndexAttr ? Number(seriesIndexAttr) : undefined,
        categories,
        links,
        cover: cover || thumbnail,
        thumbnail: thumbnail || cover,
        acquisitions,
        navigation,
        entryDocument,
      } as OpdsEntry;
    })
    .get();

  const num = (sel: string) => {
    const t = feed.children(sel).first().text();
    return t ? Number(t) : undefined;
  };

  return {
    id: feed.children('id').first().text() || undefined,
    title: collapseWhitespace(feed.children('title').first().text()),
    subtitle: collapseWhitespace(feed.children('subtitle').first().text()) || undefined,
    icon: feed.children('icon').first().text()
      ? absolutize(feed.children('icon').first().text(), baseUrl)
      : undefined,
    entries,
    links: readLinks(feed.get(0)),
    totalResults: num('opensearch\\:totalResults'),
    itemsPerPage: num('opensearch\\:itemsPerPage'),
    startIndex: num('opensearch\\:startIndex'),
    kind: 'atom',
  };
};

/* ------------------------------ JSON (OPDS 2) ----------------------------- */

const toArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

const contributorNames = (v: any): string[] =>
  toArray(v)
    .map((c: any) => (typeof c === 'string' ? c : c?.name))
    .map((n: any) =>
      typeof n === 'string' ? n : n && typeof n === 'object' ? Object.values(n)[0] : '',
    )
    .filter(Boolean) as string[];

const localized = (v: any): string =>
  typeof v === 'string' ? v : v && typeof v === 'object' ? String(Object.values(v)[0] ?? '') : '';

const jsonLink = (l: any, baseUrl: string): OpdsLink => ({
  href: absolutize(l.href, baseUrl),
  rel: Array.isArray(l.rel) ? l.rel[0] : l.rel,
  type: l.type,
  title: l.title,
  count: l.properties?.numberOfItems,
});

export const parseOpdsJson = (json: any, baseUrl: string): OpdsFeed => {
  const links: OpdsLink[] = toArray(json.links).map((l: any) =>
    jsonLink(l, baseUrl),
  );
  json.facets &&
    toArray(json.facets).forEach((group: any) =>
      toArray(group.links).forEach((l: any) =>
        links.push({ ...jsonLink(l, baseUrl), facetGroup: group.metadata?.title }),
      ),
    );

  const entries: OpdsEntry[] = [];
  toArray(json.navigation).forEach((n: any) => {
    const link = jsonLink(n, baseUrl);
    entries.push({
      id: link.href,
      title: n.title || link.href,
      authors: [],
      contributors: [],
      categories: [],
      links: [link],
      acquisitions: [],
      navigation: link,
    });
  });
  const pubs = [
    ...toArray(json.publications),
    ...toArray(json.groups).flatMap((g: any) => toArray(g.publications)),
  ];
  pubs.forEach((p: any) => {
    const m = p.metadata || {};
    const plinks: OpdsLink[] = toArray(p.links).map((l: any) => jsonLink(l, baseUrl));
    const images: OpdsLink[] = toArray(p.images).map((l: any) => jsonLink(l, baseUrl));
    const acquisitions = plinks.filter(l => isAcquisitionRel(l.rel));
    entries.push({
      id: m.identifier || plinks[0]?.href || m.title,
      title: localized(m.title),
      authors: contributorNames(m.author),
      contributors: [
        ...contributorNames(m.translator),
        ...contributorNames(m.editor),
      ],
      summary: m.description ? stripTags(String(m.description)) : undefined,
      published: m.published,
      updated: m.modified,
      language: toArray(m.language)[0],
      publisher: contributorNames(m.publisher)[0],
      series: toArray(m.belongsTo?.series)[0]?.name,
      seriesIndex: toArray(m.belongsTo?.series)[0]?.position,
      categories: toArray(m.subject).map((s: any) =>
        typeof s === 'string' ? { term: s } : { term: s.code || s.name, label: s.name },
      ),
      links: plinks,
      cover: images[images.length - 1]?.href,
      thumbnail: images[0]?.href,
      acquisitions,
      entryDocument: plinks.find(l => l.rel === 'self'),
    });
  });
  // groups with only navigation
  toArray(json.groups).forEach((g: any) => {
    toArray(g.navigation).forEach((n: any) => {
      const link = jsonLink(n, baseUrl);
      entries.push({
        id: link.href,
        title: n.title || link.href,
        authors: [],
        contributors: [],
        categories: [],
        links: [link],
        acquisitions: [],
        navigation: link,
      });
    });
  });

  return {
    title: localized(json.metadata?.title) || '',
    entries,
    links,
    totalResults: json.metadata?.numberOfItems,
    itemsPerPage: json.metadata?.itemsPerPage,
    startIndex: json.metadata?.currentPage,
    kind: 'json',
  };
};

/* --------------------------------- helpers -------------------------------- */

export const findLink = (links: OpdsLink[], rel: string) =>
  links.find(l => l.rel === rel);

export const nextPageLink = (feed: OpdsFeed) => findLink(feed.links, 'next');

export const searchLink = (feed: OpdsFeed) => findLink(feed.links, 'search');

/** Resolves an OpenSearch description into a URL template with {searchTerms}. */
export const parseOpenSearchTemplate = (
  xml: string,
  baseUrl: string,
): string | undefined => {
  const $ = load(xml, { xmlMode: true });
  const urls = $('Url')
    .map((_, u) => ({
      type: $(u).attr('type') || '',
      template: $(u).attr('template') || '',
    }))
    .get();
  const best =
    urls.find(u => /opds|atom/i.test(u.type)) ||
    urls.find(u => /json/i.test(u.type)) ||
    urls[0];
  return best?.template ? absolutize(best.template, baseUrl) : undefined;
};

export const fillSearchTemplate = (template: string, term: string) =>
  template
    .replace(/\{searchTerms\??\}/g, encodeURIComponent(term))
    .replace(/\{query\??\}/g, encodeURIComponent(term))
    .replace(/\{startPage\??\}/g, '1')
    .replace(/\{startIndex\??\}/g, '')
    .replace(/\{count\??\}/g, '')
    .replace(/\{[a-zA-Z:]+\?\}/g, '');

export const EPUB_TYPE = 'application/epub+zip';

export const pickEpub = (entry: OpdsEntry) =>
  entry.acquisitions.find(a => a.type?.startsWith(EPUB_TYPE) && /images/.test(a.href)) ||
  entry.acquisitions.find(a => a.type?.startsWith(EPUB_TYPE)) ||
  entry.acquisitions.find(a => /\.epub(\?|$|3)/i.test(a.href) || /kepub/i.test(a.type || ''));

export const formatLabel = (type?: string) => {
  if (!type) return 'ملف';
  if (type.includes('epub')) return 'EPUB';
  if (type.includes('pdf')) return 'PDF';
  if (type.includes('mobipocket') || type.includes('kindle')) return 'Kindle';
  if (type.includes('cbz') || type.includes('comicbook')) return 'CBZ';
  if (type.includes('html')) return 'HTML';
  if (type.includes('text/plain')) return 'TXT';
  if (type.includes('zip')) return 'ZIP';
  return type.split('/').pop() || type;
};
