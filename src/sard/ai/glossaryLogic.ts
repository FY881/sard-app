/**
 * Spoiler-safe glossary logic (pure).
 *
 * Each entry keeps a description HISTORY keyed by the reading-order index of
 * the chapter batch that produced it. When the reader is behind the newest
 * processed chapter (re-read, marked chapters unread, switched device) only
 * the description written at or before their cutoff is shown, and entries
 * first seen after the cutoff are hidden entirely.
 */
import { normalizeText } from './arabic';

export type GlossaryCategory =
  | 'character'
  | 'place'
  | 'power'
  | 'item'
  | 'faction'
  | 'term';

export const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
  'character',
  'place',
  'power',
  'item',
  'faction',
  'term',
];

export interface GlossaryHistoryItem {
  order: number;
  description: string;
}

export interface GlossaryEntry {
  name: string;
  normalizedName: string;
  category: GlossaryCategory;
  aliases: string[];
  firstSeenOrder: number;
  firstSeenChapterName?: string;
  lastSeenOrder: number;
  history: GlossaryHistoryItem[];
  pinned?: boolean;
}

export interface IncomingGlossaryItem {
  name: string;
  category: GlossaryCategory;
  description: string;
  aliases: string[];
}

const CATEGORY_SYNONYMS: Record<string, GlossaryCategory> = {
  character: 'character',
  characters: 'character',
  person: 'character',
  people: 'character',
  شخصية: 'character',
  شخصيه: 'character',
  شخصيات: 'character',
  place: 'place',
  location: 'place',
  places: 'place',
  مكان: 'place',
  أماكن: 'place',
  اماكن: 'place',
  power: 'power',
  ability: 'power',
  skill: 'power',
  magic: 'power',
  قدرة: 'power',
  قدره: 'power',
  قدرات: 'power',
  مهارة: 'power',
  item: 'item',
  object: 'item',
  artifact: 'item',
  weapon: 'item',
  أداة: 'item',
  اداة: 'item',
  سلاح: 'item',
  faction: 'faction',
  organization: 'faction',
  group: 'faction',
  clan: 'faction',
  جماعة: 'faction',
  منظمة: 'faction',
  عشيرة: 'faction',
  term: 'term',
  concept: 'term',
  مصطلح: 'term',
  مفهوم: 'term',
};

export const normalizeCategory = (raw: unknown): GlossaryCategory => {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase();
  return CATEGORY_SYNONYMS[key] ?? 'term';
};

/** Extracts the first JSON object/array from a model reply (fences ok). */
export const extractJson = (text: string): unknown => {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.search(/[[{]/);
    if (start < 0) return undefined;
    const open = trimmed[start];
    const close = open === '{' ? '}' : ']';
    const end = trimmed.lastIndexOf(close);
    if (end <= start) return undefined;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
};

export const parseGlossaryResponse = (text: string): IncomingGlossaryItem[] => {
  const json = extractJson(text) as any;
  const list: any[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.entries)
    ? json.entries
    : Array.isArray(json?.items)
    ? json.items
    : [];
  const out: IncomingGlossaryItem[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const name = String(raw?.name ?? '').trim();
    const description = String(raw?.description ?? raw?.desc ?? '').trim();
    if (!name || name.length > 80 || !description) continue;
    const key = normalizeText(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const aliases = Array.isArray(raw?.aliases)
      ? raw.aliases
          .map((a: unknown) => String(a ?? '').trim())
          .filter((a: string) => a && a.length <= 80 && normalizeText(a) !== key)
      : [];
    out.push({
      name,
      category: normalizeCategory(raw?.category ?? raw?.type),
      description: description.slice(0, 600),
      aliases: Array.from(new Set(aliases as string[])).slice(0, 8),
    });
  }
  return out;
};

const findMatch = (entries: GlossaryEntry[], item: IncomingGlossaryItem) => {
  const keys = [item.name, ...item.aliases].map(normalizeText);
  return entries.findIndex(
    e =>
      keys.includes(e.normalizedName) ||
      e.aliases.some(a => keys.includes(normalizeText(a))),
  );
};

export const mergeGlossary = (
  existing: GlossaryEntry[],
  incoming: IncomingGlossaryItem[],
  batch: { order: number; chapterName?: string },
): GlossaryEntry[] => {
  const entries = existing.map(e => ({
    ...e,
    aliases: [...e.aliases],
    history: [...e.history],
  }));
  for (const item of incoming) {
    const idx = findMatch(entries, item);
    if (idx < 0) {
      entries.push({
        name: item.name,
        normalizedName: normalizeText(item.name),
        category: item.category,
        aliases: item.aliases,
        firstSeenOrder: batch.order,
        firstSeenChapterName: batch.chapterName,
        lastSeenOrder: batch.order,
        history: [{ order: batch.order, description: item.description }],
      });
      continue;
    }
    const e = entries[idx];
    const aliasSet = new Set([...e.aliases, ...item.aliases]);
    if (normalizeText(item.name) !== e.normalizedName) aliasSet.add(item.name);
    aliasSet.delete(e.name);
    e.aliases = Array.from(aliasSet).slice(0, 12);
    e.lastSeenOrder = Math.max(e.lastSeenOrder, batch.order);
    const last = e.history[e.history.length - 1];
    if (!last || last.description !== item.description) {
      // same batch order → replace, otherwise append a new version
      if (last && last.order === batch.order) {
        last.description = item.description;
      } else {
        e.history.push({ order: batch.order, description: item.description });
      }
    }
    if (e.category === 'term' && item.category !== 'term') {
      e.category = item.category;
    }
  }
  return entries;
};

export const descriptionAtCutoff = (
  entry: GlossaryEntry,
  cutoffOrder: number,
): string | undefined => {
  let best: GlossaryHistoryItem | undefined;
  for (const h of entry.history) {
    if (h.order <= cutoffOrder && (!best || h.order >= best.order)) best = h;
  }
  return best?.description;
};

export interface VisibleGlossaryEntry {
  name: string;
  category: GlossaryCategory;
  aliases: string[];
  description: string;
  firstSeenChapterName?: string;
  pinned?: boolean;
}

/** Entries the reader may see at `cutoffOrder`, spoilers removed. */
export const visibleGlossary = (
  entries: GlossaryEntry[],
  cutoffOrder: number,
): VisibleGlossaryEntry[] =>
  entries
    .filter(e => e.firstSeenOrder <= cutoffOrder)
    .map(e => ({
      name: e.name,
      category: e.category,
      aliases: e.aliases,
      description: descriptionAtCutoff(e, cutoffOrder) ?? '',
      firstSeenChapterName: e.firstSeenChapterName,
      pinned: e.pinned,
    }))
    .filter(e => e.description)
    .sort(
      (a, b) =>
        Number(!!b.pinned) - Number(!!a.pinned) ||
        GLOSSARY_CATEGORIES.indexOf(a.category) -
          GLOSSARY_CATEGORIES.indexOf(b.category) ||
        a.name.localeCompare(b.name, 'ar'),
    );

/** Compact "known so far" list sent with the next batch (keeps names stable). */
export const compactGlossaryForPrompt = (
  entries: VisibleGlossaryEntry[],
  maxChars = 6000,
) => {
  const lines: string[] = [];
  let used = 0;
  for (const e of entries) {
    const line = `- ${e.name} [${e.category}]${
      e.aliases.length ? ` (${e.aliases.join('، ')})` : ''
    }: ${e.description.slice(0, 160)}`;
    if (used + line.length > maxChars) break;
    used += line.length + 1;
    lines.push(line);
  }
  return lines.join('\n');
};

export const filterGlossary = (
  entries: VisibleGlossaryEntry[],
  query: string,
  category?: GlossaryCategory | 'all',
) => {
  const q = normalizeText(query);
  return entries.filter(
    e =>
      (!category || category === 'all' || e.category === category) &&
      (!q ||
        normalizeText(e.name).includes(q) ||
        e.aliases.some(a => normalizeText(a).includes(q)) ||
        normalizeText(e.description).includes(q)),
  );
};
