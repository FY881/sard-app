/**
 * Executes whitelisted agent tools locally (device).
 * Every call has been validated by `validateToolCall`; destructive tools
 * return a confirmation request first and only run with `confirmed: true`.
 */
import {
  deleteChapters,
  markChaptersRead,
} from '@database/queries/ChapterQueries';
import { removeNovelsFromLibrary } from '@database/queries/NovelQueries';
import { getQuota } from '@services/ai';
import { aiErrorMessage, AGENT_STRINGS } from '../ai/strings';
import { addAgentLog, upsertNovelAgent } from '../ai/db';
import {
  generateRecap,
  loadOrderedChapters,
  summarizeChapter,
  summarizeRange,
} from '../ai/features';
import { readCutoffIndex } from '../ai/spoiler';
import { groupVolumes } from '../ai/volumes';
import { loadDuplicates, loadSmartShelves, organizeLibraryIntoCategories } from './librarian';
import {
  enqueueChapterDownloads,
  getQueuedChapterIds,
  loadLibraryNovels,
  startLibraryUpdate,
  type LibraryNovel,
} from './library';
import { matchNovel } from './novelMatcher';
import { getRecommendations } from './recommender';
import type { ShelfId } from './shelves';
import type { ToolName, ValidatedCall } from './tools';
import { pickChaptersToDownload } from './watcherPlan';

const S = AGENT_STRINGS.chat;

const AGENT_STRINGS_SPOILER =
  'لم تقرأ هذا الفصل بعد، وقد يكشف الملخص أحداثاً لم تصلها. هل تريد المتابعة؟';
const NOT_DOWNLOADED =
  'الفصل غير محمّل. هل أجلب نصه من مصدر الرواية المثبت لتلخيصه؟';
const RECAP_NO_DOWNLOADED =
  'لا توجد فصول سابقة محمّلة لكتابة «ما سبق». حمّل آخر الفصول التي قرأتها أولاً.';
const RECAP_NO_PREVIOUS = 'لم تقرأ أي فصل من هذه الرواية بعد.';

export type AgentScreen =
  | 'SardSmartShelves'
  | 'SardRecommendations'
  | 'SardAiSettings'
  | 'SardWatcher';

export type AgentAction =
  | {
      type: 'open_novel';
      label: string;
      novel: Pick<LibraryNovel, 'id' | 'name' | 'path' | 'pluginId' | 'cover'>;
    }
  | { type: 'navigate'; label: string; screen: AgentScreen };

export interface PendingCall {
  tool: ToolName;
  args: Record<string, unknown>;
  novelId?: number;
  /** Extra flags accepted on confirmation (spoiler/network). */
  flags?: { acceptSpoiler?: boolean; allowNetwork?: boolean };
}

export interface AgentListItem {
  title: string;
  subtitle?: string;
  novel?: Pick<LibraryNovel, 'id' | 'name' | 'path' | 'pluginId' | 'cover'>;
}

export type AgentReply = {
  text: string;
  kind: 'text' | 'confirm' | 'choose_novel' | 'error';
  actions?: AgentAction[];
  pending?: PendingCall;
  choices?: { id: number; name: string }[];
  items?: AgentListItem[];
  /** True when the reply came from the AI model (counts toward quota). */
  viaAI?: boolean;
};

const novelRef = (n: LibraryNovel) => ({
  id: n.id,
  name: n.name,
  path: n.path,
  pluginId: n.pluginId,
  cover: n.cover,
});

const openAction = (n: LibraryNovel): AgentAction => ({
  type: 'open_novel',
  label: S.openNovel,
  novel: novelRef(n),
});

/** Chapter lookup by number ("12"), name, or "current". */
const findChapter = async (novelId: number, query: string | undefined) => {
  const all = await loadOrderedChapters(novelId);
  if (!all.length) return { all, chapter: undefined };
  if (!query || query === 'current' || query === 'الحالي') {
    const cut = readCutoffIndex(all);
    return { all, chapter: all[Math.max(0, cut)] };
  }
  const n = Number(query);
  if (Number.isFinite(n)) {
    const byNumber = all.find(c => c.chapterNumber === n);
    return { all, chapter: byNumber ?? all[n - 1] };
  }
  const q = query.trim().toLowerCase();
  return { all, chapter: all.find(c => c.name.toLowerCase().includes(q)) };
};

export const executeTool = async (
  call: Extract<ValidatedCall, { ok: true }>,
  options: {
    confirmed?: boolean;
    novelId?: number;
    flags?: PendingCall['flags'];
  } = {},
): Promise<AgentReply> => {
  const { name, args, spec } = call;
  let novel: LibraryNovel | undefined;

  if (spec.needsNovel) {
    const library = await loadLibraryNovels();
    if (options.novelId !== undefined) {
      novel = library.find(n => n.id === options.novelId);
    } else {
      const m = matchNovel(String(args.novel ?? ''), library);
      if (m.status === 'none') {
        return { kind: 'error', text: S.novelNotFound(String(args.novel ?? '')) };
      }
      if (m.status === 'ambiguous') {
        return {
          kind: 'choose_novel',
          text: S.whichNovel,
          choices: m.candidates.map(c => ({ id: c.id, name: c.name })),
          pending: { tool: name, args },
        };
      }
      novel = m.novel;
    }
    if (!novel) return { kind: 'error', text: S.novelNotFound(String(args.novel ?? '')) };
  }

  const pendingFor = (flags?: PendingCall['flags']): PendingCall => ({
    tool: name,
    args,
    novelId: novel?.id,
    flags,
  });

  try {
    switch (name) {
      case 'download_chapters': {
        const n = novel!;
        const chapters = await loadOrderedChapters(n.id);
        const which = (args.which as 'latest' | 'next' | 'all') ?? 'next';
        const pick = pickChaptersToDownload(
          chapters,
          which,
          args.count as number | undefined,
          getQueuedChapterIds(),
        );
        if (!pick.length) return { kind: 'text', text: S.downloadNone(n.name), actions: [openAction(n)] };
        if (pick.length > 50 && !options.confirmed) {
          return {
            kind: 'confirm',
            text: S.confirmDownloadMany(pick.length, n.name),
            pending: pendingFor(),
          };
        }
        enqueueChapterDownloads(n, pick);
        await addAgentLog({ agent: 'chat', action: 'download', detail: `${n.name} ×${pick.length}`, novelId: n.id });
        return { kind: 'text', text: S.downloadQueued(pick.length, n.name), actions: [openAction(n)] };
      }

      case 'summarize_chapter': {
        const n = novel!;
        const { chapter } = await findChapter(n.id, args.chapter as string | undefined);
        if (!chapter) return { kind: 'error', text: S.chapterNotFound };
        const r = await summarizeChapter({
          novel: n,
          chapterId: chapter.id,
          acceptSpoiler: options.flags?.acceptSpoiler,
          allowNetwork: options.flags?.allowNetwork,
        });
        if (r.status === 'spoiler_confirm') {
          return {
            kind: 'confirm',
            text: `${AGENT_STRINGS_SPOILER}\n«${chapter.name}»`,
            pending: pendingFor({ ...options.flags, acceptSpoiler: true }),
          };
        }
        if (r.status === 'no_text') {
          return {
            kind: 'confirm',
            text: `«${chapter.name}»: ${NOT_DOWNLOADED}`,
            pending: pendingFor({ ...options.flags, allowNetwork: true }),
          };
        }
        if (r.status !== 'ok') return { kind: 'error', text: S.chapterNotFound };
        return { kind: 'text', text: `ملخص «${chapter.name}»:\n\n${r.text}`, actions: [openAction(n)], viaAI: !r.cached };
      }

      case 'summarize_volume': {
        const n = novel!;
        const all = await loadOrderedChapters(n.id);
        let ids: number[] = [];
        let label = '';
        if (args.volume !== undefined) {
          const vols = groupVolumes(all);
          const v = vols.find(x => x.number === args.volume) ?? vols[(args.volume as number) - 1];
          if (!v) return { kind: 'error', text: S.volumeNotFound(args.volume as number, vols.length) };
          ids = v.chapters.map(c => c.id);
          label = v.label;
        } else {
          const from = Math.max(1, (args.from_chapter as number) ?? 1);
          const to = Math.max(from, (args.to_chapter as number) ?? all.length);
          const inRange = all.filter((c, i) => {
            const num = c.chapterNumber ?? i + 1;
            return num >= from && num <= to;
          });
          ids = inRange.map(c => c.id);
          label = `الفصول ${from}–${to}`;
        }
        const r = await summarizeRange({ novel: n, chapterIds: ids });
        if (r.status === 'nothing_read') return { kind: 'text', text: S.nothingRead };
        if (r.status === 'no_text') return { kind: 'error', text: NOT_DOWNLOADED };
        return {
          kind: 'text',
          text: `ملخص ${label} من «${n.name}» (${r.count} فصل):\n\n${r.text}${
            r.cappedAtCutoff ? `\n\n— ${S.cappedAtCutoff}` : ''
          }`,
          actions: [openAction(n)],
          viaAI: !r.cached,
        };
      }

      case 'recap_novel': {
        const n = novel!;
        const r = await generateRecap({ novel: n });
        if (r.status === 'ok') {
          return { kind: 'text', text: `ما سبق في «${n.name}»:\n\n${r.text}`, actions: [openAction(n)], viaAI: !r.cached };
        }
        if (r.status === 'no_downloaded') {
          return { kind: 'text', text: RECAP_NO_DOWNLOADED, actions: [openAction(n)] };
        }
        return { kind: 'text', text: RECAP_NO_PREVIOUS };
      }

      case 'organize_library': {
        if (!options.confirmed) {
          return { kind: 'confirm', text: AGENT_STRINGS.librarian.organizeConfirm, pending: pendingFor() };
        }
        const placed = await organizeLibraryIntoCategories();
        return {
          kind: 'text',
          text: AGENT_STRINGS.librarian.organizeDone(placed),
          actions: [{ type: 'navigate', label: S.openShelves, screen: 'SardSmartShelves' }],
        };
      }

      case 'show_shelf': {
        const shelf = args.shelf as ShelfId;
        const shelves = await loadSmartShelves();
        const items = shelves[shelf] ?? [];
        const shelfName = AGENT_STRINGS.librarian.shelves[shelf];
        return {
          kind: 'text',
          text: items.length ? S.shelfHeader(shelfName, items.length) : AGENT_STRINGS.librarian.shelfEmpty,
          items: items.slice(0, 15).map(i => ({
            title: i.novel.name,
            subtitle: i.reason,
            novel: { id: i.novel.id, name: i.novel.name, path: i.novel.path, pluginId: i.novel.pluginId, cover: i.novel.cover },
          })),
          actions: [{ type: 'navigate', label: S.openShelves, screen: 'SardSmartShelves' }],
        };
      }

      case 'find_duplicates': {
        const groups = await loadDuplicates();
        if (!groups.length) return { kind: 'text', text: AGENT_STRINGS.librarian.noDuplicates };
        return {
          kind: 'text',
          text: S.duplicatesHeader(groups.length),
          items: groups.slice(0, 10).map(g => ({
            title: g.keep.name,
            subtitle: g.novels.map(n => `${n.name} · ${n.pluginId}`).join('\n'),
            novel: novelRef(g.keep),
          })),
          actions: [{ type: 'navigate', label: S.openShelves, screen: 'SardSmartShelves' }],
        };
      }

      case 'recommend_novels': {
        const r = await getRecommendations({ limit: (args.count as number) ?? 6 });
        if (!r.sources) return { kind: 'text', text: AGENT_STRINGS.recommender.noSources };
        if (!r.items.length) return { kind: 'text', text: AGENT_STRINGS.recommender.empty };
        return {
          kind: 'text',
          text: S.recommendHeader,
          items: r.items.map(c => ({ title: c.name, subtitle: c.why })),
          actions: [{ type: 'navigate', label: S.openRecommendations, screen: 'SardRecommendations' }],
        };
      }

      case 'check_updates': {
        startLibraryUpdate();
        await addAgentLog({ agent: 'watcher', action: 'check_updates', detail: S.updatesStarted });
        return { kind: 'text', text: S.updatesStarted };
      }

      case 'set_auto_download': {
        const n = novel!;
        const next = await upsertNovelAgent(n.id, {
          autoDownload: !!args.enabled,
          ...(args.count !== undefined ? { autoDownloadCount: args.count as number } : {}),
          ...(args.wifi_only !== undefined ? { wifiOnly: !!args.wifi_only } : {}),
        });
        return {
          kind: 'text',
          text: S.autoDownloadSet(n.name, next.autoDownload, next.autoDownloadCount, next.wifiOnly),
          actions: [{ type: 'navigate', label: AGENT_STRINGS.watcher.title, screen: 'SardWatcher' }],
        };
      }

      case 'mark_chapters_read': {
        const n = novel!;
        const all = await loadOrderedChapters(n.id);
        const upTo = args.up_to_chapter as number;
        const target = all.filter((c, i) => (c.chapterNumber ?? i + 1) <= upTo && c.unread);
        if (!options.confirmed) {
          return { kind: 'confirm', text: S.markReadConfirm(n.name, target.length), pending: pendingFor() };
        }
        await markChaptersRead(target.map(c => c.id));
        await addAgentLog({ agent: 'chat', action: 'mark_read', detail: `${n.name} ×${target.length}`, novelId: n.id });
        return { kind: 'text', text: S.markReadDone(target.length), actions: [openAction(n)] };
      }

      case 'delete_downloads': {
        const n = novel!;
        const all = await loadOrderedChapters(n.id);
        const scope = (args.scope as 'read' | 'all') ?? 'read';
        const target = all.filter(c => c.isDownloaded && (scope === 'all' || !c.unread));
        if (!options.confirmed) {
          return { kind: 'confirm', text: S.deleteDownloadsConfirm(n.name, target.length), pending: pendingFor() };
        }
        await deleteChapters(n.pluginId, n.id, target.map(c => c.id));
        await addAgentLog({ agent: 'chat', action: 'delete_downloads', detail: `${n.name} ×${target.length}`, novelId: n.id });
        return { kind: 'text', text: S.deleteDownloadsDone(target.length) };
      }

      case 'remove_from_library': {
        const n = novel!;
        if (!options.confirmed) {
          return { kind: 'confirm', text: S.removeConfirm(n.name), pending: pendingFor() };
        }
        await removeNovelsFromLibrary([n.id]);
        await addAgentLog({ agent: 'chat', action: 'remove', detail: n.name, novelId: n.id });
        return { kind: 'text', text: S.removeDone(n.name) };
      }

      case 'open_novel':
        return { kind: 'text', text: `«${novel!.name}»`, actions: [openAction(novel!)] };

      case 'usage_today': {
        const q = getQuota();
        return {
          kind: 'text',
          text: S.usage(q.usedTotal(), q.getLimits().dailyTotal),
          actions: [{ type: 'navigate', label: 'إعدادات الذكاء الاصطناعي', screen: 'SardAiSettings' }],
        };
      }

    }
  } catch (e) {
    return { kind: 'error', text: aiErrorMessage(e) };
  }
  return { kind: 'error', text: S.unknownTool };
};
