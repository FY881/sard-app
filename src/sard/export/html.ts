/**
 * Pure HTML assembly for PDF export (rendered by expo-print's WebView) and
 * RTL preprocessing for EPUB chapters. No React Native imports so it can be
 * unit-tested in plain node.
 */
import {
  ExportFont,
  fontFaceCss,
  fontFamilyStack,
  getExportFont,
} from './fonts';
import { exportStrings, fmt } from './strings';

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const stripTagsLight = (html: string) => html.replace(/<[^>]*>/g, ' ');

const ARABIC_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN_RE = /[A-Za-z\u00C0-\u024F]/g;
const HEBREW_RE = /[\u0590-\u05FF]/g;

/** Guesses the text direction from the letters it contains. */
const FIRST_STRONG =
  /[A-Za-z\u00C0-\u024F\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export const detectDirection = (text: string): 'rtl' | 'ltr' => {
  const sample = stripTagsLight(text.slice(0, 20000));
  const letters =
    (sample.match(ARABIC_RE)?.length ?? 0) +
    (sample.match(LATIN_RE)?.length ?? 0);
  if (letters < 40) {
    // Short strings (titles): Unicode bidi rule P2, first strong character.
    const first = FIRST_STRONG.exec(sample)?.[0];
    if (!first) return 'rtl';
    return /[A-Za-z\u00C0-\u024F]/.test(first) ? 'ltr' : 'rtl';
  }
  const rtl =
    (sample.match(ARABIC_RE)?.length ?? 0) +
    (sample.match(HEBREW_RE)?.length ?? 0);
  const ltr = sample.match(LATIN_RE)?.length ?? 0;
  if (rtl === 0 && ltr === 0) return 'rtl';
  return rtl >= ltr * 0.6 ? 'rtl' : 'ltr';
};

export const stripTags = (html: string): string =>
  html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

export const countWords = (text: string): number =>
  text ? text.split(/\s+/).filter(Boolean).length : 0;

const normalizeForCompare = (text: string) =>
  text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // tashkeel + tatweel
    .replace(/[\s.,:;!?؟،؛'"«»()[\]{}\-–—_*#|/\\]+/g, '')
    .toLowerCase();

/**
 * Makes downloaded chapter HTML safe and printable: keeps only the body,
 * removes scripts/embeds/forms/event handlers and javascript: urls, and
 * drops a leading heading that only repeats the chapter title.
 */
export const cleanChapterHtml = (html: string, title?: string): string => {
  let body = html;
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(body);
  if (bodyMatch) {
    body = bodyMatch[1];
  } else {
    body = body.replace(/<head[^>]*>[\s\S]*?<\/head>/i, '');
  }
  body = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(
      /<(script|style|noscript|iframe|object|embed|form|button|select|textarea|svg|template|video|audio|canvas)\b[^>]*>[\s\S]*?<\/\1>/gi,
      '',
    )
    .replace(
      /<(script|iframe|object|embed|input|link|meta|base|source|track)\b[^>]*\/?>/gi,
      '',
    )
    .replace(/<\/?(html|head|body)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '')
    .replace(
      /\s+style\s*=\s*(["'])[^"']*position\s*:\s*(fixed|absolute)[^"']*\1/gi,
      '',
    );

  if (title) {
    const wanted = normalizeForCompare(title);
    body = body.replace(
      /^\s*(?:<(?:div|section|article)[^>]*>\s*)*<(h[1-6]|p|strong|b)\b[^>]*>([\s\S]*?)<\/\1>/i,
      (whole, _tag, inner: string) => {
        const text = normalizeForCompare(stripTags(inner));
        return wanted &&
          text &&
          (text === wanted || wanted.endsWith(text) || text.endsWith(wanted))
          ? whole.replace(/<(h[1-6]|p|strong|b)\b[^>]*>[\s\S]*?<\/\1>/i, '')
          : whole;
      },
    );
  }
  return body.trim();
};

/** Detects an image mime type from the first bytes of base64 data. */
export const mimeFromBase64 = (data: string): string | undefined => {
  const head = data.trimStart().slice(0, 16);
  if (head.startsWith('iVBOR')) return 'image/png';
  if (head.startsWith('/9j/')) return 'image/jpeg';
  if (head.startsWith('R0lGOD')) return 'image/gif';
  if (head.startsWith('UklGR')) return 'image/webp';
  if (head.startsWith('PHN2Zy') || head.startsWith('PD94bW'))
    return 'image/svg+xml';
  if (head.startsWith('Qk')) return 'image/bmp';
  return undefined;
};

const BASE64_RE = /^[A-Za-z0-9+/=\s]+$/;

/** Turns the content of a stored image file into a data URI, if possible. */
export const toDataUri = (fileContent: string): string | undefined => {
  const content = fileContent.trim();
  if (content.startsWith('data:image/')) return content;
  if (!content || content.length < 16) return undefined;
  if (!BASE64_RE.test(content.slice(0, 2000))) return undefined;
  const mime = mimeFromBase64(content);
  return mime
    ? `data:${mime};base64,${content.replace(/\s+/g, '')}`
    : undefined;
};

export type ImageResolver = (src: string) => Promise<string | undefined>;

/**
 * Rewrites every <img src> through `resolve` (e.g. inline as data URI).
 * When `resolve` returns undefined the image is removed so the printed page
 * never shows a broken-image box. `keepImages=false` removes all images.
 */
export const rewriteImages = async (
  html: string,
  resolve: ImageResolver,
  keepImages = true,
): Promise<string> => {
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  if (!tags.length) return html;
  const replacements = new Map<string, string>();
  for (const tag of tags) {
    if (replacements.has(tag)) continue;
    if (!keepImages) {
      replacements.set(tag, '');
      continue;
    }
    const src =
      /\ssrc\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] ??
      /\ssrc\s*=\s*([^\s>]+)/i.exec(tag)?.[1];
    let resolved: string | undefined;
    if (src) {
      try {
        resolved = await resolve(src);
      } catch {
        resolved = undefined;
      }
    }
    const alt = /\salt\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] ?? '';
    replacements.set(
      tag,
      resolved ? `<img src="${resolved}" alt="${escapeHtml(alt)}"/>` : '',
    );
  }
  return html.replace(/<img\b[^>]*>/gi, tag => replacements.get(tag) ?? '');
};

export type PageSize = 'A4' | 'A5' | 'Letter';
export type PaperTheme = 'white' | 'sepia' | 'dark';
export type Margins = 'narrow' | 'normal' | 'wide';

/** Page sizes in PostScript points (1/72 inch), as expo-print expects. */
export const PAGE_SIZES: Record<
  PageSize,
  { width: number; height: number; css: string }
> = {
  A4: { width: 595, height: 842, css: 'A4' },
  A5: { width: 420, height: 595, css: 'A5' },
  Letter: { width: 612, height: 792, css: 'letter' },
};

const MARGINS_MM: Record<Margins, { side: number; vertical: number }> = {
  narrow: { side: 10, vertical: 12 },
  normal: { side: 16, vertical: 18 },
  wide: { side: 24, vertical: 24 },
};

export const PAPER_THEMES: Record<
  PaperTheme,
  { background: string; text: string; muted: string; accent: string }
> = {
  white: {
    background: '#ffffff',
    text: '#1b1b1f',
    muted: '#6b6b74',
    accent: '#6750a4',
  },
  sepia: {
    background: '#f7efdf',
    text: '#3b2c17',
    muted: '#8a7455',
    accent: '#8a5a1c',
  },
  dark: {
    background: '#1c1b20',
    text: '#e6e1e5',
    muted: '#a09ca6',
    accent: '#cfbcff',
  },
};

export interface PdfChapterInput {
  title: string;
  /** 1-based position of the chapter in the novel. */
  position: number;
  /** Cleaned body HTML; undefined renders a "not downloaded" placeholder. */
  html?: string;
}

export interface PdfDocumentOptions {
  fontId?: string;
  fontSize: number;
  lineHeight: number;
  pageSize: PageSize;
  margins: Margins;
  paperTheme: PaperTheme;
  justify: boolean;
  includeCover: boolean;
  includeToc: boolean;
  pageBreakPerChapter: boolean;
  /** Footer watermark text, or undefined for none. */
  watermark?: string;
  /** Forces a direction; detected from content when omitted. */
  direction?: 'rtl' | 'ltr';
  /** Base url for @font-face (tests override). */
  fontBase?: string;
}

export interface PdfDocumentInput {
  title: string;
  author?: string;
  summary?: string;
  /** data: URI or reachable url, or undefined for a typographic cover. */
  coverUri?: string;
  /** e.g. "الجزء 2" when the export is split. */
  partLabel?: string;
  /** Novel-wide chapter count, for the cover line. */
  exportedAt?: Date;
  chapters: PdfChapterInput[];
  options: PdfDocumentOptions;
}

const formatDate = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(
    date.getDate(),
  )}`;
};

export const buildPdfStyles = (
  options: PdfDocumentOptions,
  font: ExportFont,
): string => {
  const theme = PAPER_THEMES[options.paperTheme];
  const margins = MARGINS_MM[options.margins];
  const size = PAGE_SIZES[options.pageSize];
  const fontSize = Math.min(40, Math.max(8, options.fontSize));
  const lineHeight = Math.min(3, Math.max(1, options.lineHeight));
  return `
${fontFaceCss(font, options.fontBase)}
@page { size: ${size.css}; margin: ${margins.vertical}mm ${margins.side}mm ${
    margins.vertical + 4
  }mm ${margins.side}mm;
  @bottom-center { content: counter(page); font-family: ${fontFamilyStack(
    font,
  )}; font-size: 9pt; color: ${theme.muted}; } }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: ${theme.background}; color: ${
    theme.text
  };
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: ${fontFamilyStack(
    font,
  )}; font-size: ${fontSize}pt; line-height: ${lineHeight};
  text-align: ${
    options.justify ? 'justify' : 'start'
  }; text-justify: inter-word;
  overflow-wrap: break-word; word-wrap: break-word; hyphens: none;
  font-feature-settings: "kern" 1, "liga" 1, "calt" 1; text-rendering: optimizeLegibility; }
p { margin: 0 0 0.75em 0; orphans: 2; widows: 2; }
a { color: ${theme.accent}; text-decoration: none; }
img { display: block; max-width: 100%; height: auto; margin: 0.8em auto; page-break-inside: avoid; break-inside: avoid; }
hr { border: none; border-top: 1px solid ${
    theme.muted
  }; opacity: 0.4; margin: 1.5em 15%; }
blockquote { margin: 0.8em 0; padding-inline-start: 1em; border-inline-start: 3px solid ${
    theme.accent
  }; color: ${theme.muted}; }
table { border-collapse: collapse; max-width: 100%; }
td, th { border: 1px solid ${theme.muted}; padding: 4px 6px; }
.sard-cover { height: 100vh; min-height: ${
    size.height * 0.85
  }pt; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; break-after: page; }
.sard-cover img { max-height: 55vh; max-width: 80%; border-radius: 6px; box-shadow: 0 6px 24px rgba(0,0,0,0.25); margin: 0 auto 1.4em auto; }
.sard-cover h1 { font-size: 2.1em; line-height: 1.35; margin: 0.2em 0; font-weight: 700; }
.sard-cover .sard-part { font-size: 1.15em; color: ${
    theme.accent
  }; margin: 0.2em 0; }
.sard-cover .sard-meta { color: ${
    theme.muted
  }; font-size: 0.95em; margin: 0.25em 0; }
.sard-cover .sard-ornament { color: ${
    theme.accent
  }; font-size: 1.4em; margin: 0.6em 0; letter-spacing: 0.4em; }
.sard-cover .sard-summary { margin-top: 1.2em; max-width: 85%; color: ${
    theme.muted
  }; font-size: 0.9em; text-align: justify; }
.sard-toc { page-break-after: always; break-after: page; }
.sard-toc h2 { text-align: center; font-size: 1.5em; margin: 0 0 1em 0; }
.sard-toc ol { list-style: none; margin: 0; padding: 0; }
.sard-toc li { display: flex; gap: 0.6em; padding: 0.28em 0; border-bottom: 1px dotted ${
    theme.muted
  }55; font-size: 0.92em; break-inside: avoid; }
.sard-toc .sard-num { color: ${
    theme.muted
  }; min-width: 2.6em; font-variant-numeric: tabular-nums; }
.sard-chapter { ${
    options.pageBreakPerChapter
      ? 'page-break-before: always; break-before: page;'
      : 'margin-top: 2.4em;'
  } }
.sard-chapter:first-of-type { page-break-before: auto; break-before: auto; }
.sard-chapter > h2 { font-size: 1.45em; line-height: 1.4; text-align: center; margin: 0.4em 0 1.1em 0; font-weight: 700; break-after: avoid; page-break-after: avoid; }
.sard-chapter > h2 .sard-chapnum { display: block; font-size: 0.6em; font-weight: 400; color: ${
    theme.muted
  }; margin-bottom: 0.3em; }
.sard-missing { text-align: center; color: ${
    theme.muted
  }; font-style: italic; padding: 2em 0; }
.sard-watermark { position: fixed; bottom: -${
    margins.vertical
  }mm; left: 0; right: 0; height: ${
    margins.vertical
  }mm; display: flex; align-items: center; justify-content: center; font-size: 7.5pt; color: ${
    theme.muted
  }; opacity: 0.85; letter-spacing: 0.02em; }
`;
};

export const buildPdfHtml = (input: PdfDocumentInput): string => {
  const { options } = input;
  const font = getExportFont(options.fontId);
  const direction =
    options.direction ??
    detectDirection(
      [
        input.title,
        ...input.chapters.slice(0, 5).map(c => `${c.title} ${c.html ?? ''}`),
      ].join(' '),
    );
  const lang = direction === 'rtl' ? 'ar' : 'en';
  const chapters = input.chapters;
  const first = chapters[0]?.position;
  const last = chapters[chapters.length - 1]?.position;

  const cover = options.includeCover
    ? `<section class="sard-cover">
  ${
    input.coverUri
      ? `<img src="${escapeHtml(input.coverUri)}" alt=""/>`
      : '<div class="sard-ornament">❖ ❖ ❖</div>'
  }
  <h1>${escapeHtml(input.title)}</h1>
  ${
    input.partLabel
      ? `<div class="sard-part">${escapeHtml(input.partLabel)}</div>`
      : ''
  }
  ${
    input.author
      ? `<div class="sard-meta">${escapeHtml(
          fmt(exportStrings.coverAuthor, { author: input.author }),
        )}</div>`
      : ''
  }
  <div class="sard-meta">${escapeHtml(
    fmt(exportStrings.coverChapters, { count: chapters.length }),
  )}${
        first !== undefined && last !== undefined && chapters.length > 1
          ? ` · ${escapeHtml(
              fmt(exportStrings.coverRange, { from: first, to: last }),
            )}`
          : ''
      }</div>
  ${
    input.summary
      ? `<div class="sard-summary">${escapeHtml(
          input.summary.slice(0, 900),
        )}</div>`
      : ''
  }
  <div class="sard-meta" style="margin-top:2em;font-size:0.8em">${escapeHtml(
    fmt(exportStrings.coverExportedAt, {
      date: formatDate(input.exportedAt ?? new Date()),
    }),
  )}</div>
</section>`
    : '';

  const toc =
    options.includeToc && chapters.length > 1
      ? `<nav class="sard-toc"><h2>${escapeHtml(
          exportStrings.tocTitle,
        )}</h2><ol>${chapters
          .map(
            (chapter, index) =>
              `<li><span class="sard-num">${
                chapter.position
              }</span><a href="#sard-ch-${index}">${escapeHtml(
                chapter.title,
              )}</a></li>`,
          )
          .join('')}</ol></nav>`
      : '';

  const body = chapters
    .map(
      (chapter, index) => `<section class="sard-chapter" id="sard-ch-${index}">
<h2><span class="sard-chapnum">${escapeHtml(
        fmt(exportStrings.chapterLabel, { num: chapter.position }),
      )}</span>${escapeHtml(chapter.title)}</h2>
${
  chapter.html ??
  `<p class="sard-missing">${escapeHtml(
    exportStrings.missingChapterPlaceholder,
  )}</p>`
}
</section>`,
    )
    .join('\n');

  const watermark = options.watermark
    ? `<div class="sard-watermark">${escapeHtml(options.watermark)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${direction}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(
    input.partLabel ? `${input.title} - ${input.partLabel}` : input.title,
  )}</title>
<style>${buildPdfStyles(options, font)}</style>
</head>
<body dir="${direction}">
${watermark}
${cover}
${toc}
${body}
</body>
</html>`;
};

/**
 * Wraps a downloaded chapter document so EPUB readers lay it out RTL with
 * the chosen font. Returns a full XHTML-friendly HTML document; nitro-epub
 * re-parses it and keeps the body.
 */
export const wrapEpubChapter = (
  html: string,
  title: string,
  direction: 'rtl' | 'ltr',
): string => {
  const body = cleanChapterHtml(html);
  const lang = direction === 'rtl' ? 'ar' : 'en';
  return `<html><head><title>${escapeHtml(
    title,
  )}</title></head><body><div class="sard-chapter" dir="${direction}" lang="${lang}"><h2 class="sard-title">${escapeHtml(
    title,
  )}</h2>${body}</div></body></html>`;
};

export const buildEpubStylesheet = (
  fontId: string | undefined,
  direction: 'rtl' | 'ltr',
  justify: boolean,
): string => {
  const font = getExportFont(fontId);
  return `
html, body { direction: ${direction}; unicode-bidi: embed; }
body { font-family: ${fontFamilyStack(font)}; line-height: 1.8; text-align: ${
    justify ? 'justify' : 'start'
  }; overflow-wrap: break-word; }
.sard-chapter { direction: ${direction}; }
.sard-title { text-align: center; margin: 0.6em 0 1.2em 0; line-height: 1.4; }
p { margin: 0 0 0.75em 0; }
img { display: block; max-width: 100%; height: auto; margin: 0.8em auto; }
`;
};
