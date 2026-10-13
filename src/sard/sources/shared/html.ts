import { load } from 'cheerio';
import { SARD_SOURCE_STRINGS as S } from '../strings';

export interface SplitChapter {
  title: string;
  html: string;
}

export interface SplitOptions {
  /** Base URL used to absolutize relative src/href attributes. */
  baseUrl?: string;
  /** CSS selectors removed before splitting (boilerplate, page numbers…). */
  removeSelectors?: string[];
  /** Max HTML size of one chapter before it is cut into parts. */
  maxChapterChars?: number;
  /** Segments whose visible text is shorter than this get merged forward. */
  minChapterTextChars?: number;
}

const DEFAULT_MAX_CHARS = 150000;
const DEFAULT_MIN_TEXT = 250;
const HEADING_LEVELS = [1, 2, 3, 4] as const;
const TOC_TITLE =
  /^(contents|table of contents|list of illustrations|illustrations|index|المحتويات|الفهرس|فهرس)\.?$/i;

const PART_TITLE =
  /^(book|part|volume|vol\.|canto|act|الجزء|الكتاب|المجلد|القسم|الباب)\b/i;

/** A segment that is mostly in-document links (a table of contents). */
export const isTocSegment = (seg: { title: string; html: string }) => {
  const links = (seg.html.match(/<a\s[^>]*href=["']#/gi) || []).length;
  if (TOC_TITLE.test(seg.title)) {
    const anyLinks = (seg.html.match(/<a\s[^>]*href=/gi) || []).length;
    if (links >= 5 || (anyLinks >= 3 && stripTags(seg.html).length < 1500)) {
      return true;
    }
  }
  if (links < 8) return false;
  return stripTags(seg.html).length / links < 70;
};

export const collapseWhitespace = (s: string) => s.replace(/\s+/g, ' ').trim();

export const stripTags = (html: string) =>
  collapseWhitespace(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&#8203;/g, ''),
  );

export const absolutize = (url: string, base?: string) => {
  if (!url || !base) return url;
  if (/^(https?:|data:|file:|mailto:|#)/i.test(url)) return url;
  if (url.startsWith('//')) return 'https:' + url;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
};

/** Makes img/src, a/href, source/srcset absolute against baseUrl. */
export const absolutizeHtml = (html: string, baseUrl?: string) => {
  if (!baseUrl) return html;
  return html.replace(
    /(\s(?:src|href|poster)\s*=\s*)(["'])(.*?)\2/gi,
    (_m, pre: string, q: string, url: string) =>
      url.startsWith('#') ? `${pre}${q}${url}${q}` : `${pre}${q}${absolutize(url, baseUrl)}${q}`,
  );
};

const headingRegex = (level: number) => new RegExp(`<h${level}(?=[\\s>])`, 'gi');

const headingTitle = (segmentHtml: string, level: number) => {
  const m = segmentHtml.match(
    new RegExp(`^<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'i'),
  );
  if (!m) return '';
  const $ = load(m[1].replace(/<br\s*\/?>/gi, ' '), null, false);
  $('.caption, .pagenum, .pageno, sup, .noprint').remove();
  let title = collapseWhitespace($.root().text());
  if (!title) {
    const alt = $('img[alt]')
      .map((_, el) => $(el).attr('alt'))
      .get()
      .join(' ');
    title = collapseWhitespace(alt);
  }
  return title.length > 140 ? title.slice(0, 137) + '…' : title;
};

const textLength = (html: string) => stripTags(html).length;

const splitByLevel = (html: string, level: number) => {
  const re = headingRegex(level);
  const positions: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) positions.push(m.index);
  const pre = positions.length ? html.slice(0, positions[0]) : html;
  const segments = positions.map((start, i) => {
    const end = i + 1 < positions.length ? positions[i + 1] : html.length;
    const segHtml = html.slice(start, end);
    return { title: headingTitle(segHtml, level), html: segHtml };
  });
  return { pre, segments };
};

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Picks the heading level that best represents chapters. */
export const chooseHeadingLevel = (html: string): number | undefined => {
  let best: { level: number; count: number } | undefined;
  for (const level of HEADING_LEVELS) {
    const count = (html.match(headingRegex(level)) || []).length;
    if (count < 2) continue;
    const { segments } = splitByLevel(html, level);
    const med = median(segments.map(s => textLength(s.html)));
    // Chapters should carry real prose; tiny segments mean the level marks
    // sub-headings (or poems) and a coarser level reads better.
    if (med < 1200 && count > 3) continue;
    if (!best || count > best.count) best = { level, count };
  }
  if (best) return best.level;
  // fall back to the most frequent level with ≥2 headings
  let fallback: { level: number; count: number } | undefined;
  for (const level of HEADING_LEVELS) {
    const count = (html.match(headingRegex(level)) || []).length;
    if (count >= 2 && (!fallback || count > fallback.count)) {
      fallback = { level, count };
    }
  }
  return fallback?.level;
};

/** Cuts long HTML into parts at block boundaries. */
export const splitBySize = (html: string, maxChars: number): string[] => {
  if (html.length <= maxChars) return [html];
  const parts: string[] = [];
  let rest = html;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    let cut = Math.max(
      window.lastIndexOf('</p>'),
      window.lastIndexOf('</div>'),
      window.lastIndexOf('<br'),
    );
    if (cut < maxChars * 0.4) cut = maxChars;
    else cut = window.indexOf('>', cut) + 1 || maxChars;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.trim()) parts.push(rest);
  return parts;
};

/** Re-serializes a fragment so slicing never leaves unbalanced tags. */
export const normalizeFragment = (html: string) => {
  const $ = load(html, null, false);
  return $.html();
};

export const cleanBody = (
  fullHtml: string,
  removeSelectors: string[] = [],
): string => {
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : fullHtml;
  const $ = load(body, null, false);
  $(['script', 'style', 'link', 'meta', ...removeSelectors].join(',')).remove();
  return $.html();
};

/**
 * Splits a whole-book HTML document into chapters by its headings.
 * Strategy: choose the heading level that gives prose-sized segments,
 * keep a front-matter "intro" if substantial, drop table-of-contents
 * segments, merge heading-only segments (e.g. «BOOK I») into the next
 * one, cut oversized chapters into parts, and fall back to size-based
 * parts when the book has no usable headings.
 */
export const splitBookHtml = (
  fullHtml: string,
  options: SplitOptions = {},
): SplitChapter[] => {
  const maxChars = options.maxChapterChars ?? DEFAULT_MAX_CHARS;
  const minText = options.minChapterTextChars ?? DEFAULT_MIN_TEXT;
  const html = absolutizeHtml(
    cleanBody(fullHtml, options.removeSelectors),
    options.baseUrl,
  );
  const level = chooseHeadingLevel(html);

  let raw: SplitChapter[] = [];
  if (level === undefined) {
    raw = [{ title: S.fullText, html }];
  } else {
    const { pre, segments } = splitByLevel(html, level);
    if (textLength(pre) >= minText) {
      raw.push({ title: S.intro, html: pre });
    }
    raw.push(...segments);
  }

  // drop TOC-like segments (their links point inside the single file)
  raw = raw.filter(seg => !isTocSegment(seg));

  // merge heading-only segments forward
  const merged: SplitChapter[] = [];
  let carry: SplitChapter | undefined;
  for (const seg of raw) {
    const current: SplitChapter = carry
      ? {
          title: PART_TITLE.test(carry.title)
            ? [carry.title, seg.title].filter(Boolean).join(' — ')
            : seg.title || carry.title,
          html: carry.html + seg.html,
        }
      : seg;
    carry = undefined;
    if (textLength(current.html) < minText) {
      carry = current;
      continue;
    }
    merged.push(current);
  }
  if (carry) {
    if (merged.length) {
      const last = merged[merged.length - 1];
      last.html += carry.html;
    } else {
      merged.push(carry);
    }
  }

  // split oversized chapters / whole-book fallback
  const result: SplitChapter[] = [];
  merged.forEach(seg => {
    const parts = splitBySize(seg.html, maxChars);
    if (parts.length === 1) {
      result.push(seg);
    } else {
      parts.forEach((p, i) =>
        result.push({
          title:
            seg.title === S.fullText
              ? S.partN(i + 1)
              : `${seg.title || S.untitled} (${S.partN(i + 1)})`,
          html: p,
        }),
      );
    }
  });

  return result.map((seg, i) => ({
    title: seg.title || S.chapterN(i + 1),
    html: normalizeFragment(seg.html),
  }));
};
