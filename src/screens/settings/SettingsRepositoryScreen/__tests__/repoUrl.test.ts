import {
  addDismissed,
  extractRepoUrl,
  isRepoUrl,
  summarizeRepository,
} from '../utils/repoUrl';

const URL = 'https://raw.example.org/someone/repo/plugins/v3/plugins.min.json';

describe('repo url detection', () => {
  it('accepts plugins.min.json urls only', () => {
    expect(isRepoUrl(URL)).toBe(true);
    expect(isRepoUrl('https://example.org/plugins.json')).toBe(false);
    expect(isRepoUrl('ftp://example.org/plugins.min.json')).toBe(false);
    expect(isRepoUrl('plugins.min.json')).toBe(false);
  });

  it('extracts from plain text, clipboard noise and deep links', () => {
    expect(extractRepoUrl(URL)).toBe(URL);
    expect(extractRepoUrl(`المستودع: ${URL}، شكرًا`)).toBe(URL);
    expect(
      extractRepoUrl(`lnreader://repo/add?url=${encodeURIComponent(URL)}`),
    ).toBe(URL);
    expect(
      extractRepoUrl(`sard://repo/add?name=x&url=${encodeURIComponent(URL)}`),
    ).toBe(URL);
    expect(
      extractRepoUrl('sard://repo/add?url=https%3A%2F%2Fx.org%2Fbad.json'),
    ).toBeUndefined();
    expect(extractRepoUrl('https://example.com/some/page')).toBeUndefined();
    expect(extractRepoUrl('')).toBeUndefined();
    expect(extractRepoUrl(null)).toBeUndefined();
  });
});

describe('summarizeRepository', () => {
  it('summarizes plugins and languages', () => {
    const summary = summarizeRepository([
      { id: 'a', name: 'A', url: 'https://x/a.js', lang: 'Arabic' },
      { id: 'b', name: 'B', url: 'https://x/b.js', lang: 'English' },
      { id: 'c', name: 'C', url: 'https://x/c.js', lang: 'ar' },
      { id: 'd', name: 'D', url: 'https://x/d.js', lang: 'English' },
      { nope: true },
    ]);
    expect(summary.count).toBe(4);
    expect(summary.arabicCount).toBe(2);
    expect(summary.languages[0]).toEqual({ lang: 'English', count: 2 });
    expect(summary.sampleNames).toEqual(['A', 'B', 'C', 'D']);
  });

  it('rejects non repositories', () => {
    expect(() => summarizeRepository({ plugins: [] })).toThrow(
      'not-a-repository',
    );
    expect(() => summarizeRepository([{ foo: 1 }])).toThrow('not-a-repository');
    expect(summarizeRepository([]).count).toBe(0);
  });

  it('keeps a bounded dismissed list', () => {
    expect(addDismissed(['b', 'a'], 'a')).toEqual(['a', 'b']);
    expect(addDismissed(['1', '2', '3'], '4', 3)).toEqual(['4', '1', '2']);
  });
});
