/** Pure helpers for the reader-mode recent list. */
export interface RecentPage {
  url: string;
  title: string;
  site: string;
  openedAt: number;
}

export const MAX_RECENT = 30;

/** Adds a page to the front, de-duplicated by url, capped at `max`. */
export const addRecent = (
  list: RecentPage[],
  page: RecentPage,
  max = MAX_RECENT,
): RecentPage[] =>
  [page, ...list.filter(item => item.url !== page.url)].slice(0, max);
