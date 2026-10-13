/** Helpers shared by the bundled sources for plain text and metadata. */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CHAPTER_LINE =
  /^\s*((CHAPTER|Chapter|BOOK|Book|PART|Part|LETTER|Letter|VOLUME|Volume|STAVE|Stave|ACT|Act|CANTO|Canto)\s+[\dIVXLCDMivxlcdm]+\b.*|[IVXLCDM]{1,7}\.?\s*$|الفصل\s+\S+.*|الباب\s+\S+.*)$/;

/**
 * Converts a plain-text book to HTML with <h2> headings for lines that look
 * like chapter markers, so it can go through the same splitter as HTML books.
 */
export const plainTextToHtml = (text: string) => {
  const normalized = text.replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  return blocks
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      const oneLine = !trimmed.includes('\n');
      if (oneLine && trimmed.length < 90 && CHAPTER_LINE.test(trimmed)) {
        return `<h2>${escapeHtml(trimmed)}</h2>`;
      }
      return `<p>${escapeHtml(trimmed).replace(/\n/g, ' ')}</p>`;
    })
    .join('\n');
};

/** Strips the Project Gutenberg header/footer from a plain-text file. */
export const stripGutenbergTextBoilerplate = (text: string) => {
  const start = text.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  const end = text.search(/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i);
  let body = text;
  if (end > 0) body = body.slice(0, end);
  if (start >= 0) {
    const nl = body.indexOf('\n', start);
    body = body.slice(nl + 1);
  }
  return body;
};

/** "Austen, Jane" → "Jane Austen"; keeps "Plato" and "Smith, John, Sir" sane. */
export const humanizeAuthorName = (name: string) => {
  const parts = name.split(',').map(p => p.trim());
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `${parts[1]} ${parts[0]}`;
  }
  if (parts.length > 2) {
    return `${parts[1]} ${parts[0]}`;
  }
  return name.trim();
};

export const htmlParagraph = (text: string) => `<p>${escapeHtml(text)}</p>`;

export { escapeHtml };

export const toArabicDigits = (n: number | string) =>
  String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

export const uniq = <T>(arr: T[]) => Array.from(new Set(arr));
