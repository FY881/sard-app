import wikisource, {
  extractAuthor,
  extractSubpageLinks,
  orderSubpages,
  pathToTitle,
  titleToPath,
} from '../plugins/arWikisource';
import { fixture, installFetch, stripHtml } from './testUtils';

jest.mock('@hooks/persisted/useUserAgent', () => ({
  getUserAgent: () => 'SardTest',
}));
jest.mock('@plugins/helpers/fetch', () => ({
  fetchApi: (url: string, init?: any) => (global as any).fetch(url, init),
  downloadFile: jest.fn(),
}));

const TITLE = 'الأجنحة المتكسرة';
const enc = (s: string) => encodeURIComponent(s);
const parseFixture = () => JSON.parse(fixture('ws-parse-ajniha.json'));

describe('Arabic Wikisource source', () => {
  it('extracts author and ordered subpage links from the work page', () => {
    const html = parseFixture().parse.text;
    expect(extractAuthor(html)).toBe('جبران خليل جبران');
    const links = extractSubpageLinks(html, TITLE);
    expect(links[0]).toBe(`${TITLE}/توطئة`);
    expect(links.length).toBeGreaterThanOrEqual(10);
    expect(links.every(l => l.startsWith(`${TITLE}/`))).toBe(true);
  });

  it('orders subpages: linked order, nested children, then the rest naturally', () => {
    const ordered = orderSubpages(
      ['W/b', 'W/a'],
      ['W/a', 'W/b', 'W/b/2', 'W/b/1', 'W/c 10', 'W/c 2'],
      { 'W/b': ['W/b/2'] },
    );
    expect(ordered).toEqual(['W/b', 'W/b/2', 'W/b/1', 'W/a', 'W/c 2', 'W/c 10']);
  });

  it('round-trips titles and paths', () => {
    expect(titleToPath('مغامرات توم سوير/الفصل 1')).toBe(
      'مغامرات_توم_سوير/الفصل_1',
    );
    expect(pathToTitle('مغامرات_توم_سوير/الفصل_1')).toBe(
      'مغامرات توم سوير/الفصل 1',
    );
  });

  it('browses a category, mapping work sub-categories to their pages', async () => {
    installFetch([
      [
        'list=categorymembers',
        JSON.stringify({
          query: {
            categorymembers: [
              { ns: 0, title: TITLE },
              { ns: 14, title: 'تصنيف:الحجاب' },
              { ns: 14, title: 'تصنيف:بلا صفحة' },
              { ns: 0, title: `${TITLE}/توطئة` },
            ],
          },
        }),
      ],
      [
        'prop=pageimages',
        JSON.stringify({
          query: {
            pages: [
              { ns: 0, title: TITLE },
              { ns: 0, title: 'الحجاب', thumbnail: { source: 'https://x/c.jpg' } },
              { ns: 0, title: 'بلا صفحة', missing: true },
            ],
          },
        }),
      ],
    ]);
    const items = await wikisource.popularNovels(1, {
      filters: { category: { value: 'روايات' } } as any,
    });
    expect(items.map(i => i.name)).toEqual([TITLE, 'الحجاب']);
    expect(items[1].cover).toBe('https://x/c.jpg');
  });

  it('parses a work into chapters and serves them with CC BY-SA attribution', async () => {
    const sub = `${TITLE}/توطئة`;
    installFetch([
      [
        new RegExp(`action=parse.*page=${enc(sub)}`.replace(/[()]/g, '\\$&')),
        JSON.stringify({
          parse: {
            title: sub,
            text: '<div class="mw-parser-output"><div class="ws-noexport">nav</div><p>نص التوطئة الكامل</p><p><img src="//upload.wikimedia.org/a.png"></p></div>',
            categories: [],
          },
        }),
      ],
      [`action=parse`, fixture('ws-parse-ajniha.json')],
      [
        'list=allpages',
        JSON.stringify({
          query: {
            pages: [{ title: TITLE }],
            allpages: extractSubpageLinks(parseFixture().parse.text, TITLE).map(
              title => ({ title }),
            ),
          },
        }),
      ],
    ]);
    const novel = await wikisource.parseNovel(titleToPath(TITLE));
    expect(novel.name).toBe(TITLE);
    expect(novel.author).toBe('جبران خليل جبران');
    expect(novel.summary).toMatch(/CC BY-SA 4\.0/);
    expect(novel.chapters[0]).toMatchObject({
      name: 'توطئة',
      path: titleToPath(sub),
      chapterNumber: 1,
    });
    const chapter = await wikisource.parseChapter(novel.chapters[0].path);
    expect(stripHtml(chapter)).toMatch(/^نص التوطئة الكامل/);
    expect(chapter).not.toContain('nav');
    expect(chapter).toContain('https://upload.wikimedia.org/a.png');
    expect(chapter).toContain('creativecommons.org/licenses/by-sa/4.0');
  });

  it('splits a single long page by its headings', async () => {
    const title = 'كتاب طويل';
    const section = (h: string) =>
      `<h2>${h}</h2><p>${'كلام عربي فصيح. '.repeat(120)}</p>`;
    installFetch([
      [
        'action=parse',
        JSON.stringify({
          parse: {
            title,
            text: `<div>${section('الباب الأول')}${section('الباب الثاني')}${section(
              'الباب الثالث',
            )}</div>`,
            categories: [{ category: 'قصص' }],
          },
        }),
      ],
      ['list=allpages', JSON.stringify({ query: { pages: [{ title }], allpages: [] } })],
    ]);
    const novel = await wikisource.parseNovel(titleToPath(title));
    expect(novel.chapters.map(c => c.name)).toEqual([
      'الباب الأول',
      'الباب الثاني',
      'الباب الثالث',
    ]);
    expect(novel.chapters[1].path).toBe('كتاب_طويل#sard-part-2');
    const chapter = await wikisource.parseChapter(novel.chapters[1].path);
    expect(stripHtml(chapter)).toMatch(/^الباب الثاني/);
    expect(wikisource.resolveUrl!(novel.chapters[1].path)).toBe(
      `https://ar.wikisource.org/wiki/${encodeURI('كتاب_طويل')}`,
    );
  });
});
