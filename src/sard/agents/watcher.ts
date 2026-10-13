/**
 * Chapter Watcher (device). Runs after LNReader's library update (automatic
 * WorkManager schedule or manual) and keeps the next N chapters downloaded for
 * every novel that opted in, honouring Wi-Fi-only.
 *
 * Integration (main agent): call `runChapterWatcher()` right after an
 * UPDATE_LIBRARY task finishes (see work/docs/tracks/ai.md).
 */
import { getAllNovelChaptersForBackup } from '@database/queries/ChapterQueries';
import { getNovelById } from '@database/queries/NovelQueries';
import { AGENT_STRINGS } from '../ai/strings';
import { addAgentLog, listNovelAgents, upsertNovelAgent } from '../ai/db';
import { getConnectionKind } from './connectivity';
import {
  enqueueChapterDownloads,
  getQueuedChapterIds,
  startLibraryUpdate,
} from './library';
import { setWatcherState } from './settings';
import { connectionAllows, planAutoDownload } from './watcherPlan';

export interface WatcherNovelResult {
  novelId: number;
  name: string;
  queued: number;
  skipped?: string;
}

export interface WatcherRunResult {
  queued: number;
  novels: WatcherNovelResult[];
}

let running = false;

export const runChapterWatcher = async (
  options: { novelIds?: number[] } = {},
): Promise<WatcherRunResult> => {
  if (running) return { queued: 0, novels: [] };
  running = true;
  try {
    const agents = (await listNovelAgents()).filter(
      a =>
        a.autoDownload &&
        (!options.novelIds || options.novelIds.includes(a.novelId)),
    );
    const connection = await getConnectionKind();
    const queuedIds = getQueuedChapterIds();
    const results: WatcherNovelResult[] = [];
    let total = 0;
    for (const a of agents) {
      const novel = getNovelById(a.novelId);
      if (!novel || !novel.inLibrary) continue;
      const allowed = connectionAllows(connection, a.wifiOnly);
      if (!allowed.ok) {
        results.push({
          novelId: a.novelId,
          name: novel.name,
          queued: 0,
          skipped: allowed.reason,
        });
        continue;
      }
      const chapters = await getAllNovelChaptersForBackup(a.novelId);
      const plan = planAutoDownload(chapters, a, queuedIds);
      if (plan.length) {
        enqueueChapterDownloads(novel, plan);
        plan.forEach(c => queuedIds.add(c.id));
      }
      total += plan.length;
      await upsertNovelAgent(a.novelId, {
        lastRunAt: Date.now(),
        lastQueuedCount: plan.length,
      });
      results.push({ novelId: a.novelId, name: novel.name, queued: plan.length });
    }
    const firstSkip = results.find(r => r.skipped)?.skipped;
    setWatcherState({
      lastRunAt: Date.now(),
      lastQueued: total,
      lastNovels: results.filter(r => r.queued > 0).length,
      lastSkipReason: firstSkip,
    });
    if (agents.length) {
      await addAgentLog({
        agent: 'watcher',
        action: 'auto_download',
        detail:
          AGENT_STRINGS.watcher.summary(
            total,
            results.filter(r => r.queued > 0).length,
          ) +
          (firstSkip ? ` — ${AGENT_STRINGS.watcher.skipped[firstSkip]}` : ''),
      });
    }
    return { queued: total, novels: results };
  } finally {
    running = false;
  }
};

/** Manual "check now": LNReader update, the watcher follows when wired. */
export const checkForNewChapters = async () => {
  startLibraryUpdate();
  await addAgentLog({
    agent: 'watcher',
    action: 'check_updates',
    detail: AGENT_STRINGS.watcher.checkUpdatesStarted,
  });
};
