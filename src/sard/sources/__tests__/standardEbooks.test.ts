import standardEbooks, {
  listingUrl,
  parseBookPage,
  parseChapterPage,
  parseListing,
  parseToc,
} from '../plugins/standardEbooks';
import { fixture, installFetch, stripHtml } from './testUtils';

jest.mock('@hooks/persisted/useUserAgent', () => ({
  getUserAgent: () => 'SardTest',
}));
jest.mock('@plugins/helpers/fetch', () => ({
  fetchApi: (url: string, init?: any) => (global as any).fetch(url, init),
  downloadFile: jest.fn(),
}));

const TALE = 'ebooks/charles-dickens/a-tale-of-two-cities';
const DEAD = 'ebooks/fyodor-dostoevsky/the-house-of-the-dead/constance-garnett';

describe('Standard Ebooks source', () => {
  it('builds listing urls with sort, tags and paging', () => {
    expect(
      listingUrl({ page: 2, sort: 'newest', tags: ['science-fiction', 'all'] }),
    ).toBe(
      'https://standardebooks.org/ebooks?sort=newest&page=2&per-page=48&view=grid&tags%5B%5D=science-fiction',
    );
  });

  it('parses the ebook grid', () => {
    const items = parseListing(fixture('se-list.html'), 1);
    expect(items.length).toBe(3);
    items.forEach(item => {
      expect(item.path).toMatch(/^ebooks\/[^/]+\/[^/]+/);
      expect(item.cover).toMatch(/^https:\/\/standardebooks\.org\/images\/covers\//);
      expect(item.name.length).toBeGreaterThan(0);
    });
  });

  it('returns nothing for out-of-range pages (site answers with page 1)', () => {
    expect(parseListing(fixture('se-list.html'), 5)).toEqual([]);
  });

  it('parses book metadata, translator and CC0 license note', () => {
    const meta = parseBookPage(fixture('se-book.html'), DEAD);
    expect(meta.name).toBe('The House of the Dead');
    expect(meta.author).toBe('Fyodor Dostoevsky');
    expect(meta.translator).toBe('Constance Garnett');
    expect(meta.summary).toMatch(/CC0/);
    expect(meta.cover).toMatch(/cover\.jpg$/);
  });

  it('builds chapters from the table of contents, skipping front/back matter and part containers', () => {
    const chapters = parseToc(fixture('se-toc.html'), TALE);
    const names = chapters.map(c => c.name);
    expect(names[0]).toBe('Preface');
    expect(names[1]).toBe('I: The Period');
    expect(names).not.toContain('Titlepage');
    expect(names).not.toContain('Imprint');
    expect(names).not.toContain('Colophon');
    expect(names).not.toContain('Uncopyright');
    expect(names.some(n => n.startsWith('Book the'))).toBe(false);
    expect(chapters[1].path).toBe(`${TALE}/text/chapter-1-1`);
    expect(chapters.length).toBe(46);
  });

  it('extracts the chapter body without navigation or honeypot links', () => {
    const html = parseChapterPage(fixture('se-chapter.html'), `${TALE}/text/chapter-1-1`);
    expect(stripHtml(html)).toMatch(/It was the best of times/);
    expect(html).not.toMatch(/honeypot/);
    expect(html).not.toMatch(/Table of contents/);
  });

  it('parses a novel end to end', async () => {
    installFetch([
      [`${TALE}/text/`, fixture('se-chapter.html')],
      [`${TALE}/text`, fixture('se-toc.html')],
      [TALE, fixture('se-book.html')],
    ]);
    const novel = await standardEbooks.parseNovel(TALE);
    expect(novel.chapters.length).toBe(46);
    const chapter = await standardEbooks.parseChapter(novel.chapters[1].path);
    expect(stripHtml(chapter)).toMatch(/best of times/);
  });
});
