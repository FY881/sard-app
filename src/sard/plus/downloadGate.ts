/**
 * Download rules from memberships, used by LNReader's download task:
 * the free tier keeps at most 300 downloaded chapters, and the download
 * scheduler (Plus) holds the queue until Wi-Fi / charging / the time window.
 */
import { and, eq, sql } from 'drizzle-orm';
import * as Battery from 'expo-battery';
import { dbManager } from '@database/db';
import { chapterSchema } from '@database/schema';
import { canUse, currentLimit } from '../membership/service';
import { openPaywall } from '../membership/paywallStore';
import { getConnectionKind } from '../agents/connectivity';
import { num, t } from '../i18n';
import { schedulerStore } from './store';
import { schedulerBlock, type DeviceConditions, type WaitReason } from './logic/offline';

export class OfflineCapError extends Error {
  constructor(public cap: number) {
    super(t('plus.offline.capReached', { cap: num(cap) }));
    this.name = 'OfflineCapError';
  }
}

const downloadedTotal = async () => {
  const r = await dbManager
    .select({ n: sql<number>`COUNT(*)` })
    .from(chapterSchema)
    .where(and(eq(chapterSchema.isDownloaded, true)))
    .get();
  return Number(r?.n ?? 0);
};

let paywallShownAt = 0;

/** Throws OfflineCapError when one more download would pass the tier cap. */
export const assertOfflineRoom = async () => {
  const cap = currentLimit('offlineChapters');
  if (cap === Infinity) return;
  const count = await downloadedTotal();
  if (count >= cap) {
    if (Date.now() - paywallShownAt > 60_000) {
      paywallShownAt = Date.now();
      openPaywall('offline.unlimited', canUse('offline.unlimited', count));
    }
    throw new OfflineCapError(cap);
  }
};

const isCharging = async (): Promise<boolean | null> => {
  try {
    const s = await Battery.getBatteryStateAsync();
    return s === Battery.BatteryState.CHARGING || s === Battery.BatteryState.FULL;
  } catch {
    return null;
  }
};

export const currentConditions = async (): Promise<DeviceConditions> => {
  const kind = await getConnectionKind();
  return {
    connection: kind === 'ethernet' ? 'wifi' : (kind as DeviceConditions['connection']),
    charging: await isCharging(),
    now: new Date(),
  };
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Waits (polling every 30 s) while the download scheduler blocks downloads. */
export const waitForDownloadWindow = async (onWait?: (reason: WaitReason) => void, pollMs = 30_000) => {
  for (;;) {
    const s = schedulerStore.get();
    if (!s.enabled || !canUse('offline.scheduler').allowed) return;
    const reason = schedulerBlock(s, await currentConditions());
    if (!reason) return;
    onWait?.(reason);
    await sleep(pollMs);
  }
};
