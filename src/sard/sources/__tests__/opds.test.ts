import opds, {
  base64,
  isBookLikeEntry,
  isSocialEntry,
  rewriteEpubChapter,
} from '../plugins/opds';
import {
  fillSearchTemplate,
  parseOpdsAtom,
  parseOpdsJson,
  parseOpenSearchTemplate,
  pickEpub,
} from '../shared/opds';
import { fixture, installFetch, stripHtml } from './testUtils';

const mockStore = new Map<string, any>();
jest.mock('@plugins/helpers/storage', () => ({
  Storage: class {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
    set(k: string, v: any) {
      mockStore.set(this.id + k, JSON.parse(JSON.stringify(v)));
    }
    get(k: string) {
      return mockStore.get(this.id + k);
    }
    delete(k: string) {
      mockStore.delete(this.id + k);
    }
  },
}));
jest.mock('@hooks/persisted/useUserAgent', () => ({
  getUserAgent: () => 'SardTest',
}));
jest.mock('@plugins/helpers/fetch', () => ({
  fetchApi: (url: string, init?: any) => (global as any).fetch(url, init),
  downloadFile: jest.fn(),
}));
jest.mock('@modules/native-file', () => ({
  __esModule: true,
  default: {
    mkdir: jest.fn(async () => undefined),
    exists: jest.fn(async () => false),
    readFile: jest.fn(async () => '<html><body><p>EPUB chapter</p></body></html>'),
    unlink: jest.fn(async () => undefined),
  },
}));
jest.mock('@modules/native-zip-archive', () => ({
  __esModule: true,
  default: { unzip: jest.fn(async () => undefined) },
}));
jest.mock('@modules/nitro-epub', () => ({
  epub: {
    parseNovelAndChapters: jest.fn(async () => ({
      name: 'Dracula',
      chapters: [
        { name: 'One', path: '/books/x/OEBPS/c1.xhtml' },
        { name: 'Two', path: '/books/x/OEBPS/c2.xhtml' },
      ],
      cssPaths: [],
      imagePaths: [],
    })),
  },
}));
jest.mock('@utils/Storages', () => ({ PLUGIN_STORAGE: '/data/Plugins' }));

const setSetting = (key: string, value: string) =>
  mockStore.set('sard.opds' + key, value);

const atomFeed = (entries: string, links = '') => `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog" xmlns:dcterms="http://purl.org/dc/terms/">
<id>root</id><title>My Library</title>${links}${entries}</feed>`;

const ROOT = atomFeed(
  `<entry><id>nav-new</id><title>Recently Added</title><content type="text">The latest books</content>
   <link rel="http://opds-spec.org/sort/new" type="application/atom+xml;profile=opds-catalog;kind=acquisition" href="/opds/new"/></entry>
   <entry><id>nav-authors</id><title>Authors</title>
   <link rel="subsection" type="application/atom+xml;profile=opds-catalog;kind=navigation" href="/opds/authors"/></entry>`,
  '<link rel="search" type="application/atom+xml" href="/opds/search?q={searchTerms}"/>',
);
const NEW = atomFeed(
  `<entry><id>urn:book:1</id><title>رواية تجريبية</title><author><name>كاتب، أول</name></author>
   <summary>ملخص قصير</summary><category term="Fiction" label="روايات"/>
   <link rel="http://opds-spec.org/image/thumbnail" type="image/jpeg" href="/covers/1-thumb.jpg"/>
   <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="/download/1.epub"/></entry>
   <entry><id>urn:book:2</id><title>PDF only</title>
   <link rel="http://opds-spec.org/acquisition" type="application/pdf" href="/download/2.pdf"/></entry>`,
  '<link rel="next" type="application/atom+xml;profile=opds-catalog" href="/opds/new?page=2"/>',
);

describe('OPDS parsing', () => {
  it('parses Gutenberg Atom search results and recognizes book-like entries', () => {
    const feed = parseOpdsAtom(
      fixture('gutenberg-search.opds.xml'),
      'https://www.gutenberg.org/ebooks/search.opds/',
    );
    expect(feed.entries.length).toBeGreaterThan(0);
    const books = feed.entries.filter(isBookLikeEntry);
    const social = feed.entries.filter(isSocialEntry);
    expect(books.length).toBeGreaterThan(0);
    books.forEach(b => expect(b.navigation?.href).toMatch(/\/ebooks\/\d+\.opds$/));
    social.forEach(s => expect(isBookLikeEntry(s)).toBe(false));
  });

  it('parses a one-book acquisition feed with an EPUB link', () => {
    const feed = parseOpdsAtom(
      fixture('gutenberg-1342.opds.xml'),
      'https://www.gutenberg.org/ebooks/1342.opds',
    );
    const entry = feed.entries[0];
    expect(entry.title).toBe('Pride and Prejudice');
    expect(entry.authors).toEqual(['Austen, Jane']);
    expect(pickEpub(entry)?.href).toMatch(/epub/);
    expect(entry.cover).toMatch(/cover\.medium\.jpg$/);
  });

  it('parses OPDS 2.0 JSON publications', () => {
    const feed = parseOpdsJson(
      JSON.parse(fixture('opds2-publications.json')),
      'https://test.opds.io/2.0/publications.json',
    );
    expect(feed.entries.length).toBe(2);
    expect(feed.entries[0].title).toBe('Voyage au centre de la Terre');
    expect(feed.entries[0].authors).toEqual(['Jules Verne']);
    expect(pickEpub(feed.entries[0])).toBeDefined();
    expect(feed.entries[1].title).toBe('Title in multiple languages');
  });

  it('resolves OpenSearch templates', () => {
    const xml = `<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"><Url type="text/html" template="/s?q={searchTerms}"/><Url type="application/atom+xml" template="/opds/s?q={searchTerms}&amp;p={startPage?}"/></OpenSearchDescription>`;
    const t = parseOpenSearchTemplate(xml, 'https://lib.example/osd.xml');
    expect(t).toBe('https://lib.example/opds/s?q={searchTerms}&p={startPage?}');
    expect(fillSearchTemplate(t!, 'نجيب محفوظ')).toBe(
      `https://lib.example/opds/s?q=${encodeURIComponent('نجيب محفوظ')}&p=1`,
    );
  });

  it('encodes UTF-8 credentials for Basic auth', () => {
    expect(base64('user:pass')).toBe('dXNlcjpwYXNz');
    expect(base64('عمر:١٢٣')).toBe('2LnZhdixOtmh2aLZow==');
  });

  it('rewrites EPUB chapter resources to local files', () => {
    const html = rewriteEpubChapter(
      '<html><body><img src="../images/a.jpg"/><a href="#n1">1</a></body></html>',
      '/data/books/x/OEBPS/text/c1.xhtml',
    );
    expect(html).toBe(
      '<img src="file:///data/books/x/OEBPS/images/a.jpg"/><a href="#n1">1</a>',
    );
  });
});

describe('OPDS catalog source', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it('asks the user to configure the catalog first', async () => {
    await expect(opds.popularNovels(1, {})).rejects.toThrow(/رابط كتالوج OPDS/);
  });

  it('descends from the root to a book feed, remembers sections and pages', async () => {
    setSetting('catalogUrl', 'lib.example/opds');
    const ff = installFetch([
      [/\/opds\/new\?page=2$/, atomFeed('')],
      [/\/opds\/new$/, NEW],
      [/\/opds$/, ROOT],
    ]);
    const items = await opds.popularNovels(1, {
      filters: { feed: { value: '' }, customFeed: { value: '' } } as any,
    });
    expect(ff.calls[0]).toBe('https://lib.example/opds');
    expect(items.map(i => i.name)).toEqual(['رواية تجريبية', 'PDF only']);
    expect(items[0].cover).toBe('https://lib.example/covers/1-thumb.jpg');
    const labels = (opds.filters!.feed as any).options.map((o: any) => o.label);
    expect(labels).toEqual(['الصفحة الرئيسية للكتالوج', 'Recently Added', 'Authors']);
    expect(await opds.popularNovels(2, {})).toEqual([]);
  });

  it('sends Basic auth and reports auth errors in Arabic', async () => {
    setSetting('catalogUrl', 'https://private.example/opds');
    setSetting('username', 'user');
    setSetting('password', 'pass');
    installFetch([[/\/opds$/, 'unauthorized', 401]]);
    await expect(opds.popularNovels(1, {})).rejects.toThrow(/تسجيل الدخول/);
    const init = (global as any).fetch.mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Basic dXNlcjpwYXNz');
  });

  it('reads EPUB books chapter by chapter and lists links for other formats', async () => {
    setSetting('catalogUrl', 'https://lib.example/opds');
    installFetch([
      [/\/opds\/search\?q=/, NEW],
      [/\/opds$/, ROOT],
    ]);
    const found = await opds.searchNovels('رواية', 1);
    expect(found.length).toBe(2);

    const novel = await opds.parseNovel(found[0].path);
    expect(novel.name).toBe('رواية تجريبية');
    expect(novel.author).toBe('كاتب، أول');
    expect(novel.genres).toBe('روايات');
    expect(novel.chapters.map(c => c.name)).toEqual(['One', 'Two']);
    const chapter = await opds.parseChapter(novel.chapters[0].path);
    expect(stripHtml(chapter)).toBe('EPUB chapter');

    const pdf = await opds.parseNovel(found[1].path);
    expect(pdf.chapters.length).toBe(1);
    const links = await opds.parseChapter(pdf.chapters[0].path);
    expect(links).toContain('https://lib.example/download/2.pdf');
    expect(links).toContain('PDF');
  });
});
