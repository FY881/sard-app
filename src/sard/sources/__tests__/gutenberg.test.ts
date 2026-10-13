import gutenberg, {
  buildSearchQuery,
  parseBookEntry,
  parseListing,
  searchUrl,
} from '../plugins/gutenberg';
import { fixture, installFetch, stripHtml } from './testUtils';

jest.mock('@hooks/persisted/useUserAgent', () => ({
  getUserAgent: () => 'SardTest',
}));
jest.mock('@plugins/helpers/fetch', () => ({
  fetchApi: (url: string, init?: any) => (global as any).fetch(url, init),
  downloadFile: jest.fn(),
}));

const bookHtml = `<html><body>
<section class="pg-boilerplate pgheader" id="pg-header"><h2 id="pg-header-heading">The Project Gutenberg eBook of Test</h2><p>boilerplate</p></section>
<h1>Pride and Prejudice</h1>
<h2>CONTENTS</h2>${Array.from(
  { length: 10 },
  (_, i) => `<p class="toc"><a href="#c${i}">Chapter ${i}</a></p>`,
).join('')}
<h2><a id="c1"></a><img alt="" src="images/i_030.jpg"><span class="caption">A caption.</span><br><br>Chapter I.</h2>
<p>${'It is a truth universally acknowledged. '.repeat(60)}</p>
<h2>CHAPTER II.</h2><p>${'Mr. Bennet was among the earliest. '.repeat(60)}</p>
<section class="pg-boilerplate pgfooter" id="pg-footer"><p>license</p></section>
</body></html>`;

describe('Project Gutenberg source', () => {
  it('parses the OPDS listing into novels with covers', () => {
    const items = parseListing(fixture('gutenberg-search.opds.xml'));
    expect(items.length).toBeGreaterThan(0);
    items.forEach(item => {
      expect(item.path).toMatch(/^ebooks\/\d+$/);
      expect(item.cover).toMatch(
        /^https:\/\/www\.gutenberg\.org\/cache\/epub\/\d+\/pg\d+\.cover\.medium\.jpg$/,
      );
    });
    // social "follow us" entries are not books
    expect(items.some(i => /facebook|bluesky|mastodon/i.test(i.name))).toBe(
      false,
    );
  });

  it('reads book metadata from the per-book OPDS entry', () => {
    const book = parseBookEntry(fixture('gutenberg-1342.opds.xml'), '1342');
    expect(book.title).toBe('Pride and Prejudice');
    expect(book.author).toBe('Jane Austen');
    expect(book.subjects).toContain('Love stories');
    expect(book.rights).toMatch(/Public domain/);
    expect(book.summary).toMatch(/Elizabeth Bennet/);
  });

  it('builds filtered search queries with Gutenberg prefixes', () => {
    expect(
      buildSearchQuery('holmes', {
        language: { value: 'en' },
        subject: { value: 'detective and mystery stories' },
        customSubject: { value: '' },
        author: { value: 'Doyle' },
      }),
    ).toBe('holmes s.detective and mystery stories a.Doyle l.en');
    expect(searchUrl('l.ar', 'downloads', 2)).toBe(
      'https://www.gutenberg.org/ebooks/search.opds/?query=l.ar&sort_order=downloads&start_index=26',
    );
  });

  it('lists popular / latest through the OPDS search feed', async () => {
    const ff = installFetch([
      ['search.opds', fixture('gutenberg-search.opds.xml')],
    ]);
    const popular = await gutenberg.popularNovels(1, {
      filters: { language: { value: 'ar' } } as any,
    });
    expect(popular.length).toBeGreaterThan(0);
    expect(ff.calls[0]).toContain('query=l.ar');
    expect(ff.calls[0]).toContain('sort_order=downloads');
    await gutenberg.popularNovels(1, { showLatestNovels: true });
    expect(ff.calls[1]).toContain('sort_order=release_date');
  });

  it('splits the book HTML into chapters and serves each one', async () => {
    installFetch([
      ['/ebooks/1342.opds', fixture('gutenberg-1342.opds.xml')],
      ['pg1342-images.html', bookHtml],
    ]);
    const novel = await gutenberg.parseNovel('ebooks/1342');
    expect(novel.name).toBe('Pride and Prejudice');
    expect(novel.summary).toMatch(/الترخيص/);
    expect(novel.chapters.map(c => c.name)).toEqual([
      'Chapter I.',
      'CHAPTER II.',
    ]);
    const chapter = await gutenberg.parseChapter(novel.chapters[0].path);
    expect(stripHtml(chapter)).toMatch(/Chapter I\. It is a truth/);
    expect(chapter).toContain(
      'https://www.gutenberg.org/cache/epub/1342/images/i_030.jpg',
    );
    expect(chapter).not.toContain('boilerplate');
    expect(chapter).not.toContain('license');
  });

  it('falls back to the plain-text edition when there is no HTML', async () => {
    installFetch([
      ['/ebooks/77.opds', fixture('gutenberg-1342.opds.xml').replace(/1342/g, '77')],
      ['pg77-images.html', 'nope', 404],
      [
        'pg77.txt',
        `*** START OF THE PROJECT GUTENBERG EBOOK T ***\n\nCHAPTER I\n\n${'Text. '.repeat(
          100,
        )}\n\nCHAPTER II\n\n${'More. '.repeat(100)}\n\n*** END OF THE PROJECT GUTENBERG EBOOK T ***`,
      ],
    ]);
    const novel = await gutenberg.parseNovel('ebooks/77');
    expect(novel.chapters.map(c => c.name)).toEqual(['CHAPTER I', 'CHAPTER II']);
  });

  it('resolves web urls for the novel and its chapters', () => {
    expect(gutenberg.resolveUrl!('ebooks/1342', true)).toBe(
      'https://www.gutenberg.org/ebooks/1342',
    );
    expect(gutenberg.resolveUrl!('ebooks/1342/c/2')).toBe(
      'https://www.gutenberg.org/cache/epub/1342/pg1342-images.html',
    );
  });
});
