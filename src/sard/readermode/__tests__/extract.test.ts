/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHTML } from 'linkedom';

import {
  absolutizeUrls,
  extractArticle,
  NoReadableContentError,
} from '../extract';
import { findPageLinks } from '../nextLink';
import { buildSavedPageHtml } from '../savedPageHtml';
import { addRecent } from '../recent';

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('extractArticle (Readability + linkedom)', () => {
  const url = 'https://stories.example.com/stories/moon/chapter-3';
  const article = extractArticle(fixture('arabic-article.html'), url);

  it('extracts the article body without page chrome', () => {
    expect(article.title).toContain('الفصل الثالث');
    expect(article.text).toContain('كانت الليلة هادئة');
    expect(article.text).toContain('انطفأ ضوء القمر');
    expect(article.text).not.toContain('الأكثر قراءة');
    expect(article.text).not.toContain('جميع الحقوق محفوظة');
    expect(article.html).not.toMatch(/<script|onclick|<button/i);
    expect(article.usedFallback).toBe(false);
  });

  it('is RTL Arabic with reading stats', () => {
    expect(article.direction).toBe('rtl');
    expect(article.lang).toBe('ar');
    expect(article.siteName).toBe('مدونة الحكايات');
    expect(article.wordCount).toBeGreaterThan(80);
    expect(article.minutes).toBeGreaterThanOrEqual(1);
  });

  it('promotes lazy images and makes their urls absolute', () => {
    expect(article.html).toContain(
      'src="https://stories.example.com/images/moon.jpg"',
    );
  });

  it('detects next/prev links on the same site only', () => {
    expect(article.links.next).toBe(
      'https://stories.example.com/stories/moon/chapter-4',
    );
    expect(article.links.prev).toBe(
      'https://stories.example.com/stories/moon/chapter-2',
    );
  });

  it('handles <br>-only pages and a title-attribute next link', () => {
    const result = extractArticle(
      fixture('br-only.html'),
      'https://forum.example.org/t/1?page=2',
    );
    expect(result.text).toContain('The first paragraph');
    expect(result.text).toContain('A third paragraph');
    expect(result.direction).toBe('ltr');
    expect(result.links.next).toBe('https://forum.example.org/t/1?page=3');
    expect(result.html).toMatch(/<p>/);
  });

  it('throws NoReadableContentError for pages without text', () => {
    expect(() =>
      extractArticle(
        '<html><body><nav><a href="/">x</a></nav></body></html>',
        'https://e.com/',
      ),
    ).toThrow(NoReadableContentError);
  });

  it('builds the saved-chapter document with its source link', () => {
    const saved = buildSavedPageHtml(article);
    expect(saved).toContain('dir="rtl" lang="ar"');
    expect(saved).toContain(`href="${url}"`);
    expect(saved).toContain('كانت الليلة هادئة');
  });
});

describe('findPageLinks', () => {
  it('prefers rel=next and ignores self links and other sites', () => {
    const { document } =
      parseHTML(`<html><head><link rel="next" href="/p/3"></head><body>
      <a href="/p/2">التالي</a><a href="https://evil.example/x">الصفحة التالية</a>
      <a href="/p/1">السابق</a></body></html>`);
    expect(
      findPageLinks(document as never, 'https://site.example/p/2'),
    ).toEqual({
      next: 'https://site.example/p/3',
      prev: 'https://site.example/p/1',
    });
  });

  it('matches Arabic spelling variants (ة/ه, أ/ا)', () => {
    const { document } = parseHTML(
      '<body><a href="/n">« الصفحه التاليه</a></body>',
    );
    expect(findPageLinks(document as never, 'https://s.example/a').next).toBe(
      'https://s.example/n',
    );
  });

  it('returns nothing when the page has no navigation', () => {
    const { document } = parseHTML('<body><a href="/about">من نحن</a></body>');
    expect(findPageLinks(document as never, 'https://s.example/a')).toEqual({
      next: undefined,
      prev: undefined,
    });
  });
});

describe('helpers', () => {
  it('absolutizes urls and drops javascript ones', () => {
    expect(
      absolutizeUrls(
        '<a href="../x?a=1&amp;b=2">x</a><a href="javascript:void(0)">y</a>',
        'https://e.com/a/b/c',
      ),
    ).toBe('<a href="https://e.com/a/x?a=1&b=2">x</a><a>y</a>');
  });

  it('keeps a de-duplicated, capped recent list', () => {
    const page = (url: string, openedAt: number) => ({
      url,
      title: url,
      site: 's',
      openedAt,
    });
    const list = addRecent([page('a', 1), page('b', 2)], page('b', 3), 2);
    expect(list.map(p => p.url)).toEqual(['b', 'a']);
    expect(addRecent(list, page('c', 4), 2).map(p => p.url)).toEqual([
      'c',
      'b',
    ]);
  });
});
