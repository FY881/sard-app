import { htmlToPlainText, decodeEntities } from '../text';
import { allocateBudget, batchBySize, chunkText, excerpt } from '../chunking';
import { normalizeArabic, normalizeText, tokenize, editDistance } from '../arabic';

describe('htmlToPlainText', () => {
  it('strips tags, scripts and keeps paragraphs', () => {
    const html =
      '<div><script>alert(1)</script><p>مرحبا&nbsp;بك</p><p>السطر الثاني<br/>تابع</p><img src="x.png"></div>';
    const text = htmlToPlainText(html);
    expect(text).toContain('مرحبا بك');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('<');
    expect(text.split('\n').length).toBeGreaterThanOrEqual(2);
  });
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('&laquo;a&raquo; &amp; &#1576;')).toBe('«a» & ب');
  });
  it('returns empty for empty input', () => {
    expect(htmlToPlainText('')).toBe('');
  });
});

describe('arabic normalization', () => {
  it('unifies alef/yaa/taa marbuta and removes tashkeel', () => {
    expect(normalizeArabic('إِلَى المَدْرَسَةِ')).toBe('الي المدرسه');
    expect(normalizeText('  «سولو» ليفلينج!! ')).toBe('سولو ليفلينج');
  });
  it('converts Arabic-Indic digits', () => {
    expect(normalizeText('الفصل ١٢٣')).toBe('الفصل 123');
  });
  it('tokenizes without stopwords and strips the article', () => {
    expect(tokenize('ذهب البطل إلى القلعة')).toEqual(['ذهب', 'بطل', 'قلعه']);
  });
  it('computes edit distance with cutoff', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('abc', 'xyzxyz', 1)).toBeGreaterThan(1);
  });
});

describe('chunkText', () => {
  const para = (n: number) => `فقرة رقم ${n} ` + 'كلام '.repeat(40);
  const text = Array.from({ length: 20 }, (_, i) => para(i)).join('\n\n');

  it('keeps every chunk under maxChars', () => {
    const chunks = chunkText(text, { maxChars: 500 });
    expect(chunks.length).toBeGreaterThan(5);
    chunks.forEach(c => expect(c.text.length).toBeLessThanOrEqual(500));
  });
  it('covers all paragraphs in order', () => {
    const chunks = chunkText(text, { maxChars: 800 });
    const joined = chunks.map(c => c.text).join('\n');
    for (let i = 0; i < 20; i++) expect(joined).toContain(`فقرة رقم ${i} `);
    expect(chunks.map(c => c.index)).toEqual(chunks.map((_, i) => i));
  });
  it('splits a huge single paragraph by sentences / hard cut', () => {
    const long = 'جملة طويلة. '.repeat(500);
    const chunks = chunkText(long, { maxChars: 300 });
    chunks.forEach(c => expect(c.text.length).toBeLessThanOrEqual(300));
    expect(chunks.length).toBeGreaterThan(10);
  });
  it('adds overlap from the previous chunk', () => {
    const chunks = chunkText(text, { maxChars: 600, overlapChars: 100 });
    const tail = chunks[0].text.slice(-100);
    expect(chunks[1].text.startsWith(tail)).toBe(true);
  });
  it('returns [] for blank text', () => {
    expect(chunkText('   ')).toEqual([]);
  });
});

describe('allocateBudget', () => {
  it('never exceeds budget or item length', () => {
    const a = allocateBudget([100, 5000, 300], 2000);
    expect(a[0]).toBe(100);
    expect(a[2]).toBe(300);
    expect(a.reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(2000);
    expect(a[1]).toBeGreaterThan(1500);
  });
  it('favours recent items with recent weighting', () => {
    const a = allocateBudget([10000, 10000, 10000], 3000, 'recent');
    expect(a[2]).toBeGreaterThan(a[0]);
  });
  it('gives everything when it fits', () => {
    expect(allocateBudget([10, 20], 1000)).toEqual([10, 20]);
  });
  it('handles empty', () => {
    expect(allocateBudget([], 100)).toEqual([]);
  });
});

describe('excerpt & batchBySize', () => {
  it('keeps head and tail', () => {
    const s = 'A'.repeat(100) + 'B'.repeat(100);
    const e = excerpt(s, 50, 'headTail');
    expect(e.startsWith('A')).toBe(true);
    expect(e.endsWith('B')).toBe(true);
    expect(excerpt('short', 50)).toBe('short');
  });
  it('batches by size', () => {
    const b = batchBySize([5, 5, 5, 20, 1], x => x, 10);
    expect(b).toEqual([[5, 5], [5], [20], [1]]);
  });
});
