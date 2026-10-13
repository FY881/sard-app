/**
 * Text chunking and context-budget allocation (pure).
 */

export interface TextChunk {
  index: number;
  text: string;
  start: number;
  end: number;
}

const SENTENCE_END = /([.!?؟…。]+["»”’)]*\s+)/;

const splitLongParagraph = (p: string, maxChars: number): string[] => {
  if (p.length <= maxChars) return [p];
  const pieces = p.split(SENTENCE_END).reduce<string[]>((acc, part, i) => {
    // re-attach separators captured by split
    if (i % 2 === 1 && acc.length) acc[acc.length - 1] += part;
    else if (part) acc.push(part);
    return acc;
  }, []);
  const out: string[] = [];
  let cur = '';
  for (const s of pieces) {
    if (s.length > maxChars) {
      if (cur) {
        out.push(cur);
        cur = '';
      }
      for (let i = 0; i < s.length; i += maxChars) {
        out.push(s.slice(i, i + maxChars));
      }
      continue;
    }
    if ((cur + s).length > maxChars && cur) {
      out.push(cur);
      cur = s;
    } else {
      cur += s;
    }
  }
  if (cur) out.push(cur);
  return out;
};

/**
 * Splits text into chunks ≤ maxChars on paragraph, then sentence boundaries.
 * `overlapChars` repeats the tail of the previous chunk for continuity.
 */
export const chunkText = (
  text: string,
  { maxChars = 1800, overlapChars = 0 }: { maxChars?: number; overlapChars?: number } = {},
): TextChunk[] => {
  const clean = text.trim();
  if (!clean) return [];
  if (maxChars < 50) throw new Error('maxChars too small');
  const overlap = Math.max(0, Math.min(overlapChars, Math.floor(maxChars / 3)));
  const paragraphs = clean
    .split(/\n{2,}|\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .flatMap(p => splitLongParagraph(p, maxChars - overlap));

  const chunks: TextChunk[] = [];
  let cur = '';
  let cursor = 0;
  let start = 0;
  const push = () => {
    if (!cur) return;
    chunks.push({ index: chunks.length, text: cur, start, end: start + cur.length });
  };
  for (const p of paragraphs) {
    const candidate = cur ? `${cur}\n${p}` : p;
    if (candidate.length > maxChars && cur) {
      push();
      const tail = overlap ? cur.slice(-overlap) : '';
      start = cursor - tail.length;
      cur = tail ? `${tail}\n${p}` : p;
    } else {
      if (!cur) start = cursor;
      cur = candidate;
    }
    cursor += p.length + 1;
  }
  push();
  return chunks;
};

/**
 * Splits `budget` characters across items of the given lengths.
 * - never gives an item more than its length
 * - unused share is redistributed to the others
 * - 'recent' weighting favours the LAST items (most recent chapters)
 */
export const allocateBudget = (
  lengths: number[],
  budget: number,
  weighting: 'even' | 'recent' = 'even',
): number[] => {
  const n = lengths.length;
  const alloc = new Array<number>(n).fill(0);
  if (!n || budget <= 0) return alloc;
  const weights = lengths.map((_, i) =>
    weighting === 'recent' ? 1 + i / Math.max(1, n - 1) : 1,
  );
  let remaining = budget;
  let open = lengths.map((len, i) => (len > 0 ? i : -1)).filter(i => i >= 0);
  while (remaining > 0 && open.length) {
    const wSum = open.reduce((a, i) => a + weights[i], 0);
    let given = 0;
    const stillOpen: number[] = [];
    for (const i of open) {
      const share = Math.floor((remaining * weights[i]) / wSum);
      const room = lengths[i] - alloc[i];
      const add = Math.min(share, room);
      alloc[i] += add;
      given += add;
      if (alloc[i] < lengths[i]) stillOpen.push(i);
    }
    remaining -= given;
    if (given === 0) {
      // rounding left a few chars – hand them out one by one to the newest
      for (let k = stillOpen.length - 1; k >= 0 && remaining > 0; k--) {
        alloc[stillOpen[k]] += 1;
        remaining -= 1;
      }
      break;
    }
    open = stillOpen;
  }
  return alloc;
};

/**
 * Cuts text to maxChars. 'tail' keeps the end (what happened last),
 * 'headTail' keeps the opening and the ending with an ellipsis marker.
 */
export const excerpt = (
  text: string,
  maxChars: number,
  mode: 'head' | 'tail' | 'headTail' = 'headTail',
): string => {
  if (text.length <= maxChars) return text;
  if (maxChars <= 0) return '';
  const marker = '\n[…]\n';
  if (mode === 'head') return text.slice(0, maxChars).trimEnd() + marker;
  if (mode === 'tail') return marker + text.slice(text.length - maxChars).trimStart();
  const headLen = Math.floor(maxChars * 0.35);
  const tailLen = maxChars - headLen;
  return (
    text.slice(0, headLen).trimEnd() +
    marker +
    text.slice(text.length - tailLen).trimStart()
  );
};

/** Groups items into batches whose total size stays under maxChars. */
export const batchBySize = <T>(
  items: T[],
  size: (item: T) => number,
  maxChars: number,
): T[][] => {
  const batches: T[][] = [];
  let cur: T[] = [];
  let curSize = 0;
  for (const item of items) {
    const s = size(item);
    if (cur.length && curSize + s > maxChars) {
      batches.push(cur);
      cur = [];
      curSize = 0;
    }
    cur.push(item);
    curSize += s;
  }
  if (cur.length) batches.push(cur);
  return batches;
};
