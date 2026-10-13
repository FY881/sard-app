/**
 * Generic article extraction for reader mode: Mozilla Readability over a
 * linkedom DOM, with a generic densest-text-block fallback. No site-specific
 * rules. Pure (no React Native imports) so it is unit-tested on fixtures.
 */
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

import {
  cleanChapterHtml,
  countWords,
  detectDirection,
  stripTags,
} from '../export/html';
import { findPageLinks, type PageLinks } from './nextLink';
import { hostOf, resolveHttpUrl } from './url';

export interface ExtractedArticle {
  url: string;
  title: string;
  byline?: string;
  siteName?: string;
  excerpt?: string;
  /** Sanitized article HTML with absolute links/images. */
  html: string;
  text: string;
  wordCount: number;
  minutes: number;
  direction: 'rtl' | 'ltr';
  lang?: string;
  links: PageLinks;
  usedFallback: boolean;
}

export class NoReadableContentError extends Error {
  constructor() {
    super('no-readable-content');
    this.name = 'NoReadableContentError';
  }
}

const MIN_TEXT_CHARS = 140;

/* linkedom's DOM typings are loose; keep a narrow local surface. */
interface Node {
  innerHTML: string;
  textContent: string | null;
  parentNode: unknown;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  remove(): void;
}
interface Doc {
  querySelector(selector: string): Node | null;
  querySelectorAll(selector: string): Node[] & ArrayLike<Node>;
  documentElement: Node | null;
}

const parse = (html: string): Doc => parseHTML(html).document as unknown as Doc;

const toArray = (list: ArrayLike<Node>): Node[] => Array.from(list);

const meta = (doc: Doc, selector: string): string | undefined =>
  doc.querySelector(selector)?.getAttribute('content')?.trim() || undefined;

/** Makes every href/src absolute against the page url; drops unsafe ones. */
export const absolutizeUrls = (html: string, baseUrl: string): string =>
  html.replace(
    /(\s(?:href|src))\s*=\s*(["'])(.*?)\2/gi,
    (_whole, attr: string, quote: string, value: string) => {
      if (/^data:image\//i.test(value) || value.startsWith('#')) {
        return `${attr}=${quote}${value}${quote}`;
      }
      const abs = resolveHttpUrl(value.replace(/&amp;/g, '&'), baseUrl);
      return abs ? `${attr}=${quote}${abs.replace(/"/g, '%22')}${quote}` : '';
    },
  );

/** Promotes lazy-loaded image sources (data-src, data-lazy-src, srcset). */
const fixLazyImages = (doc: Doc) => {
  for (const img of toArray(doc.querySelectorAll('img'))) {
    const lazy =
      img.getAttribute('data-src') ||
      img.getAttribute('data-lazy-src') ||
      img.getAttribute('data-original') ||
      img.getAttribute('data-url');
    const src = img.getAttribute('src') ?? '';
    if (lazy && (!src || src.startsWith('data:'))) {
      img.setAttribute('src', lazy);
    } else if (!src) {
      const srcset =
        img.getAttribute('srcset') || img.getAttribute('data-srcset');
      const first = srcset?.split(',')[0]?.trim().split(/\s+/)[0];
      if (first) img.setAttribute('src', first);
    }
  }
};

const FALLBACK_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '[itemprop="articleBody"]',
  '.entry-content',
  '.post-content',
  '.article-content',
  '.chapter-content',
  '.content',
  '#content',
  '.post',
  '.text',
];

/** Picks the element whose paragraphs carry the most non-link text. */
const fallbackExtract = (doc: Doc): string | undefined => {
  toArray(
    doc.querySelectorAll(
      'script, style, noscript, nav, header, footer, aside, form, iframe',
    ),
  ).forEach(el => el.remove());
  const seen = new Set<Node>();
  const candidates: Node[] = [];
  const add = (el: Node | null) => {
    if (el && !seen.has(el) && typeof el.innerHTML === 'string') {
      seen.add(el);
      candidates.push(el);
    }
  };
  FALLBACK_SELECTORS.forEach(sel =>
    toArray(doc.querySelectorAll(sel)).forEach(add),
  );
  toArray(doc.querySelectorAll('p, br')).forEach(p =>
    add(p.parentNode as Node | null),
  );

  let bestHtml: string | undefined;
  let bestScore = 0;
  for (const el of candidates) {
    const html = el.innerHTML;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const paragraphs =
      (html.match(/<p\b/gi) ?? []).length +
      (html.match(/<br\s*\/?>/gi) ?? []).length * 0.5;
    const linkText = (html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/gi) ?? [])
      .map(a => stripTags(a))
      .join(' ').length;
    const density = 1 - Math.min(1, linkText / text.length);
    const score = text.length * density + paragraphs * 25;
    if (score > bestScore) {
      bestScore = score;
      bestHtml = html;
    }
  }
  return bestHtml ?? doc.querySelector('body')?.innerHTML;
};

/** Pages that separate paragraphs only with <br> read poorly; normalize. */
const textToParagraphs = (html: string): string => {
  if (/<p\b/i.test(html) || !/<br\s*\/?>/i.test(html)) return html;
  return html
    .split(/(?:<br\s*\/?>\s*){2,}/i)
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map(chunk => `<p>${chunk}</p>`)
    .join('\n');
};

export const extractArticle = (html: string, url: string): ExtractedArticle => {
  const doc = parse(html);

  const links = findPageLinks(doc, url);
  const pageTitle =
    meta(doc, 'meta[property="og:title"]') ||
    doc.querySelector('title')?.textContent?.trim() ||
    hostOf(url);
  const siteName = meta(doc, 'meta[property="og:site_name"]') || hostOf(url);
  const htmlLang = doc.documentElement?.getAttribute('lang') || undefined;
  const htmlDir = doc.documentElement?.getAttribute('dir')?.toLowerCase();

  fixLazyImages(doc);

  let content: string | undefined;
  let title = pageTitle;
  let byline: string | undefined;
  let excerpt: string | undefined;
  let usedFallback = false;

  try {
    const reader = new Readability(doc as unknown as Document, {
      charThreshold: 300,
      keepClasses: false,
    });
    const article = reader.parse();
    if (
      article?.content &&
      (article.textContent ?? '').trim().length >= MIN_TEXT_CHARS
    ) {
      content = article.content;
      title = article.title?.trim() || pageTitle;
      byline = article.byline?.trim() || undefined;
      excerpt = article.excerpt?.trim() || undefined;
    }
  } catch {
    content = undefined;
  }

  if (!content) {
    usedFallback = true;
    const fresh = parse(html);
    fixLazyImages(fresh);
    content = fallbackExtract(fresh);
  }

  const cleaned = absolutizeUrls(
    textToParagraphs(cleanChapterHtml(content ?? '', title)),
    url,
  );
  const text = stripTags(cleaned);
  if (text.length < MIN_TEXT_CHARS / 2) {
    throw new NoReadableContentError();
  }
  const wordCount = countWords(text);
  const direction =
    htmlDir === 'rtl' || htmlDir === 'ltr'
      ? htmlDir
      : detectDirection(`${title} ${text}`);

  return {
    url,
    title,
    byline,
    siteName,
    excerpt,
    html: cleaned,
    text,
    wordCount,
    minutes: Math.max(1, Math.round(wordCount / 200)),
    direction,
    lang: htmlLang,
    links,
    usedFallback,
  };
};
