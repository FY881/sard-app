import {
  absolutize,
  chooseHeadingLevel,
  isTocSegment,
  splitBookHtml,
  splitBySize,
  stripTags,
} from '../shared/html';
import {
  humanizeAuthorName,
  plainTextToHtml,
  stripGutenbergTextBoilerplate,
} from '../shared/text';

const prose = (n: number, word = 'lorem') =>
  `<p>${Array.from({ length: n }, () => word).join(' ')}</p>`;

describe('splitBookHtml', () => {
  it('splits by the chapter heading level and drops boilerplate and TOC', () => {
    const html = `<html><body>
      <section id="pg-header">PG header ${prose(50)}</section>
      <h1>The Book</h1>${prose(80)}
      <h2>CONTENTS</h2><p>${Array.from(
        { length: 10 },
        (_, i) => `<a href="#c${i}">Chapter ${i}</a>`,
      ).join(' ')}</p>
      <h2 id="c1">BOOK I</h2>
      <h2>CHAPTER I. <span class="pagenum">{12}</span>Start</h2>${prose(400)}
      <h2>CHAPTER II.<br/>Middle</h2>${prose(400)}
      <h2>BOOK II</h2>
      <h2>CHAPTER III</h2>${prose(400)}<img src="images/a.jpg">
      <section id="pg-footer">footer</section>
    </body></html>`;
    const chapters = splitBookHtml(html, {
      baseUrl: 'https://www.gutenberg.org/cache/epub/1/',
      removeSelectors: ['#pg-header', '#pg-footer', '.pagenum'],
    });
    expect(chapters.map(c => c.title)).toEqual([
      'المقدّمة',
      'BOOK I — CHAPTER I. Start',
      'CHAPTER II. Middle',
      'BOOK II — CHAPTER III',
    ]);
    expect(chapters[3].html).toContain(
      'src="https://www.gutenberg.org/cache/epub/1/images/a.jpg"',
    );
    expect(chapters.some(c => c.html.includes('PG header'))).toBe(false);
    expect(chapters.some(c => c.html.includes('footer'))).toBe(false);
  });

  it('falls back to size-based parts when there are no headings', () => {
    const html = Array.from({ length: 30 }, () => prose(200)).join('\n');
    const chapters = splitBookHtml(html, { maxChapterChars: 5000 });
    expect(chapters.length).toBeGreaterThan(3);
    expect(chapters[0].title).toBe('الجزء 1');
    expect(stripTags(chapters.map(c => c.html).join(' ')).length).toBe(
      stripTags(html).length,
    );
  });

  it('prefers a coarser level when the finer one only marks short sub-headings', () => {
    const html = [1, 2, 3]
      .map(
        i =>
          `<h2>Chapter ${i}</h2>${prose(300)}<h4>note</h4>${prose(
            5,
          )}<h4>note</h4>${prose(5)}<h4>n</h4>${prose(5)}<h4>n</h4>${prose(5)}`,
      )
      .join('');
    expect(chooseHeadingLevel(html)).toBe(2);
  });

  it('detects link-only table of contents segments', () => {
    const toc = {
      title: 'Whatever',
      html: Array.from({ length: 12 }, (_, i) => `<a href="#x${i}">C${i}</a>`).join(
        ' ',
      ),
    };
    expect(isTocSegment(toc)).toBe(true);
    expect(isTocSegment({ title: 'Chapter', html: prose(300) })).toBe(false);
  });
});

describe('text helpers', () => {
  it('cuts long html at block boundaries', () => {
    const parts = splitBySize(prose(100) + prose(100) + prose(100), 1300);
    expect(parts.length).toBeGreaterThan(1);
    parts.slice(0, -1).forEach(p => expect(p.endsWith('</p>')).toBe(true));
  });

  it('turns plain text into html with chapter headings', () => {
    const text = `*** START OF THE PROJECT GUTENBERG EBOOK X ***\n\nCHAPTER I\n\nIt was a dark\nnight.\n\nCHAPTER II\n\nMore.\n\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\nlicense`;
    const html = plainTextToHtml(stripGutenbergTextBoilerplate(text));
    expect(html).toContain('<h2>CHAPTER I</h2>');
    expect(html).toContain('<p>It was a dark night.</p>');
    expect(html).not.toContain('license');
  });

  it('humanizes "Last, First" author names', () => {
    expect(humanizeAuthorName('Austen, Jane')).toBe('Jane Austen');
    expect(humanizeAuthorName('Plato')).toBe('Plato');
  });

  it('absolutizes relative urls', () => {
    expect(absolutize('images/x.png', 'https://a.org/b/c.html')).toBe(
      'https://a.org/b/images/x.png',
    );
    expect(absolutize('//upload.wikimedia.org/x.png', 'https://a.org/')).toBe(
      'https://upload.wikimedia.org/x.png',
    );
    expect(absolutize('#note', 'https://a.org/')).toBe('#note');
  });
});
