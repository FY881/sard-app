/**
 * Librarian smart shelves (pure, local, no AI):
 *   متوقفة · قربت تخلص · جاهزة للقراءة المتواصلة · لم تبدأ · منتهية
 */

export type ShelfId =
  | 'paused'
  | 'near_finish'
  | 'binge_ready'
  | 'not_started'
  | 'finished';

export const SHELF_ORDER: ShelfId[] = [
  'near_finish',
  'binge_ready',
  'paused',
  'not_started',
  'finished',
];

export interface ShelfNovel {
  id: number;
  name: string;
  pluginId: string;
  cover?: string | null;
  path: string;
  status?: string | null;
  totalChapters: number;
  chaptersUnread: number;
  chaptersDownloaded: number;
  /** Unread chapters that are already downloaded (offline-ready). */
  unreadDownloaded: number;
  lastReadAt?: string | null;
}

export interface ShelfRules {
  pausedDays: number;
  nearFinishRatio: number;
  nearFinishRemaining: number;
  bingeMinUnreadDownloaded: number;
}

export const DEFAULT_SHELF_RULES: ShelfRules = {
  pausedDays: 14,
  nearFinishRatio: 0.85,
  nearFinishRemaining: 10,
  bingeMinUnreadDownloaded: 15,
};

export interface ShelfPlacement {
  shelves: ShelfId[];
  /** One Arabic line per shelf explaining why. */
  reasons: Partial<Record<ShelfId, string>>;
}

const DAY = 24 * 3600 * 1000;

export const parseDbDate = (s?: string | null) => {
  if (!s) return undefined;
  const iso = /[TZ]/.test(s) ? s : s.replace(' ', 'T') + 'Z';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : undefined;
};

const isCompletedStatus = (s?: string | null) =>
  !!s && /(completed|publishing finished|مكتمل)/i.test(s);

export const classifyNovel = (
  n: ShelfNovel,
  rules: ShelfRules = DEFAULT_SHELF_RULES,
  now = Date.now(),
): ShelfPlacement => {
  const total = Math.max(0, n.totalChapters || 0);
  const unread = Math.max(0, Math.min(total, n.chaptersUnread || 0));
  const read = total - unread;
  const lastRead = parseDbDate(n.lastReadAt);
  const started = read > 0 || lastRead !== undefined;
  const shelves: ShelfId[] = [];
  const reasons: Partial<Record<ShelfId, string>> = {};
  const completed = isCompletedStatus(n.status);

  if (total > 0 && unread === 0 && started) {
    shelves.push('finished');
    reasons.finished = completed
      ? 'أنهيت الرواية كاملة'
      : 'لحقت بآخر فصل منشور — بانتظار فصول جديدة';
    return { shelves, reasons };
  }
  if (!started) {
    shelves.push('not_started');
    reasons.not_started = total ? `${total} فصل بانتظارك` : 'لم تبدأ بعد';
  } else if (unread > 0) {
    const ratio = total ? read / total : 0;
    if (unread <= rules.nearFinishRemaining || ratio >= rules.nearFinishRatio) {
      shelves.push('near_finish');
      reasons.near_finish = completed
        ? `باقي ${unread} فصل وتنتهي الرواية (${Math.round(ratio * 100)}٪)`
        : `باقي ${unread} فصل وتلحق بآخر المنشور (${Math.round(
            ratio * 100,
          )}٪)`;
    }
    if (lastRead !== undefined) {
      const days = Math.floor((now - lastRead) / DAY);
      if (days >= rules.pausedDays) {
        shelves.push('paused');
        reasons.paused = `آخر قراءة قبل ${days} يوم — توقفت عند ${read} من ${total}`;
      }
    }
  }
  const binge = Math.max(0, n.unreadDownloaded || 0);
  if (binge >= rules.bingeMinUnreadDownloaded) {
    shelves.push('binge_ready');
    reasons.binge_ready = `${binge} فصل محمّل غير مقروء — جاهزة بدون إنترنت`;
  } else if (
    completed &&
    unread >= rules.bingeMinUnreadDownloaded * 2 &&
    binge > 0
  ) {
    shelves.push('binge_ready');
    reasons.binge_ready = `مكتملة و${unread} فصل بانتظارك`;
  }
  return { shelves, reasons };
};

export interface ShelfItem {
  novel: ShelfNovel;
  reason: string;
  /** Sort key: smaller first. */
  rank: number;
}

export const computeShelves = (
  novels: ShelfNovel[],
  rules: ShelfRules = DEFAULT_SHELF_RULES,
  now = Date.now(),
): Record<ShelfId, ShelfItem[]> => {
  const out: Record<ShelfId, ShelfItem[]> = {
    paused: [],
    near_finish: [],
    binge_ready: [],
    not_started: [],
    finished: [],
  };
  for (const n of novels) {
    const p = classifyNovel(n, rules, now);
    const last = parseDbDate(n.lastReadAt) ?? 0;
    for (const s of p.shelves) {
      const rank =
        s === 'near_finish'
          ? n.chaptersUnread
          : s === 'binge_ready'
          ? -n.unreadDownloaded
          : s === 'paused' || s === 'finished'
          ? -last
          : 0;
      out[s].push({ novel: n, reason: p.reasons[s] ?? '', rank });
    }
  }
  (Object.keys(out) as ShelfId[]).forEach(k =>
    out[k].sort(
      (a, b) => a.rank - b.rank || a.novel.name.localeCompare(b.novel.name),
    ),
  );
  return out;
};
