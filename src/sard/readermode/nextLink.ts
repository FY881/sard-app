/**
 * Detects "next page"/"previous page" links on a single page the user opened.
 * The result is only ever shown as a button; nothing is fetched until the
 * user taps it (no crawling, no prefetching).
 */
import { resolveHttpUrl, sameSite } from './url';

/* Minimal DOM surface used here, satisfied by linkedom and browsers. */
interface ElementLike {
  getAttribute(name: string): string | null;
  textContent: string | null;
}
interface DocumentLike {
  querySelectorAll(selector: string): ArrayLike<ElementLike>;
}

const normalize = (text: string) =>
  text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const NEXT_WORDS = [
  'التالي',
  'الفصل التالي',
  'الصفحة التالية',
  'الحلقة التالية',
  'الجزء التالي',
  'التالية',
  'بعده',
  'next',
  'next chapter',
  'next page',
  'next part',
  'next episode',
  'continue reading',
  'suivant',
  'siguiente',
].map(normalize);

const PREV_WORDS = [
  'السابق',
  'الفصل السابق',
  'الصفحة السابقة',
  'الحلقة السابقة',
  'الجزء السابق',
  'السابقة',
  'previous',
  'prev',
  'previous chapter',
  'previous page',
  'prev chapter',
  'précédent',
  'anterior',
].map(normalize);

const ARROWS = /^[\s«»‹›<>←→⟵⟶⇐⇒➜➔▶◀|]+|[\s«»‹›<>←→⟵⟶⇐⇒➜➔▶◀|]+$/g;

type Kind = 'next' | 'prev';

const scoreText = (text: string, kind: Kind): number => {
  const clean = normalize(text).replace(ARROWS, '').trim();
  if (!clean || clean.length > 40) return 0;
  const words = kind === 'next' ? NEXT_WORDS : PREV_WORDS;
  if (words.includes(clean)) return 60;
  if (words.some(w => clean.startsWith(w) || clean.endsWith(w))) return 40;
  return 0;
};

const NEXT_ATTR = /(^|[\s_-])next([\s_-]|$)|nextpage|next-chapter|nav-next/;
const PREV_ATTR =
  /(^|[\s_-])prev(ious)?([\s_-]|$)|prevpage|prev-chapter|nav-prev/;

const scoreAttrs = (el: ElementLike, kind: Kind): number => {
  const rel = (el.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
  if (kind === 'next' && rel.includes('next')) return 80;
  if (kind === 'prev' && (rel.includes('prev') || rel.includes('previous'))) {
    return 80;
  }
  const label = `${el.getAttribute('aria-label') ?? ''} ${
    el.getAttribute('title') ?? ''
  }`;
  const bag = `${el.getAttribute('class') ?? ''} ${
    el.getAttribute('id') ?? ''
  } ${label}`.toLowerCase();
  if ((kind === 'next' ? NEXT_ATTR : PREV_ATTR).test(bag)) return 30;
  return scoreText(label, kind) ? 25 : 0;
};

export interface PageLinks {
  next?: string;
  prev?: string;
}

const pick = (
  doc: DocumentLike,
  baseUrl: string,
  kind: Kind,
): string | undefined => {
  const current = resolveHttpUrl(baseUrl, baseUrl);
  let best: { url: string; score: number } | undefined;
  const consider = (href: string | null, score: number) => {
    if (!href || score <= 0) return;
    const url = resolveHttpUrl(href, baseUrl);
    if (!url || url === current || !sameSite(url, baseUrl)) return;
    if (!best || score > best.score) best = { url, score };
  };

  const heads = doc.querySelectorAll(
    kind === 'next'
      ? 'link[rel~="next"]'
      : 'link[rel~="prev"], link[rel~="previous"]',
  );
  for (let i = 0; i < heads.length; i++) {
    consider(heads[i].getAttribute('href'), 100);
  }

  const anchors = doc.querySelectorAll('a[href]');
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const score = scoreText(a.textContent ?? '', kind) + scoreAttrs(a, kind);
    consider(a.getAttribute('href'), score);
  }
  return best?.url;
};

export const findPageLinks = (
  doc: DocumentLike,
  baseUrl: string,
): PageLinks => {
  const next = pick(doc, baseUrl, 'next');
  let prev = pick(doc, baseUrl, 'prev');
  if (prev && prev === next) prev = undefined;
  return { next, prev };
};
