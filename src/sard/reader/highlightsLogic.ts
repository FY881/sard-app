/** Pure helpers for the highlights list (grouping + text export). */
export interface HighlightLike {
  id: number;
  novelId: number;
  novelName?: string | null;
  chapterName?: string | null;
  chapterId: number;
  startOffset: number;
  text: string;
  note?: string | null;
  createdAt: number;
}

export interface HighlightSection<T> {
  novelId: number;
  title: string;
  data: T[];
}

/** Groups rows by novel, keeping the incoming order inside and between groups. */
export const groupHighlightsByNovel = <T extends HighlightLike>(
  rows: T[],
  untitled = 'بلا عنوان',
): HighlightSection<T>[] => {
  const map = new Map<number, HighlightSection<T>>();
  for (const r of rows) {
    let s = map.get(r.novelId);
    if (!s) {
      s = { novelId: r.novelId, title: r.novelName || untitled, data: [] };
      map.set(r.novelId, s);
    }
    s.data.push(r);
  }
  return [...map.values()];
};

/** Plain-text export: novel heading, then quote + chapter + note per item. */
export const highlightsToText = <T extends HighlightLike>(rows: T[]): string =>
  groupHighlightsByNovel(rows)
    .map(section => {
      const items = [...section.data]
        .sort((a, b) => a.chapterId - b.chapterId || a.startOffset - b.startOffset)
        .map(h => {
          const lines = [`«${h.text.trim()}»`];
          if (h.chapterName) lines.push(`— ${h.chapterName}`);
          if (h.note?.trim()) lines.push(`ملاحظة: ${h.note.trim()}`);
          return lines.join('\n');
        });
      return [`📖 ${section.title}`, ...items].join('\n\n');
    })
    .join('\n\n————\n\n');
