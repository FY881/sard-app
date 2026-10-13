/**
 * Chapter HTML → clean plain text (pure, no DOM).
 */

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  zwnj: '',
  zwj: '',
  rlm: '',
  lrm: '',
};

export const decodeEntities = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000
        ? String.fromCodePoint(n)
        : m;
    }
    const v = ENTITIES[code.toLowerCase()];
    return v === undefined ? m : v;
  });

export const htmlToPlainText = (html: string): string => {
  if (!html) return '';
  let s = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|section|article|tr)>/gi, '\n\n')
    .replace(/<(p|div|h[1-6]|li|blockquote|section|article|tr)(\s[^>]*)?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n***\n')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s)
    .replace(/\r/g, '')
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
};

/** Rough token estimate (mixed Arabic/English ≈ 3.5 chars per token). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);
