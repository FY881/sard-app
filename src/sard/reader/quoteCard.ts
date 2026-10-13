/** Pure helpers for quote cards (kept apart from the component for tests). */
import { SARD_READER_STRINGS as S } from './strings';

export const QUOTE_MAX_CHARS = 700;

/** Font size that keeps long quotes inside the square card. */
export const quoteFontSize = (length: number) =>
  length < 80 ? 26 : length < 160 ? 22 : length < 280 ? 19 : length < 450 ? 16 : 14;

export const truncateQuote = (text: string, max = QUOTE_MAX_CHARS) => {
  const t = text.trim().replace(/\s+\n/g, '\n');
  return t.length > max ? `${t.slice(0, max).trim()}…` : t;
};

export const buildQuoteShareText = (d: {
  text: string;
  novelName?: string | null;
  chapterName?: string | null;
  note?: string | null;
}) => {
  const src = [d.novelName, d.chapterName].filter(Boolean).join(' — ');
  return `«${d.text.trim()}»${src ? `\n\n— ${src}` : ''}${
    d.note?.trim() ? `\n\n${S.note}: ${d.note.trim()}` : ''
  }\n\n${S.quoteFooter}`;
};
