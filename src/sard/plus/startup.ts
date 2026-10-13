/**
 * Sard 1.1 background jobs run shortly after launch: smart cleanup (Plus,
 * at most daily), auto backup (Plus, daily/weekly), scheduled agents (Pro)
 * and a silent achievements check. Each job is isolated; failures are ignored.
 */
import { canUse } from '../membership/service';
import { runAutoBackupIfDue } from './backup';
import { runSmartCleanup } from './data';
import { loadMotivation } from './motivationState';
import { cleanupStore } from './store';
import { runScheduledAgentsIfDue } from './components/AgentsPlusSection';

let started = false;

export const runStartupJobs = async (now = Date.now()) => {
  const done: string[] = [];
  const c = cleanupStore.get();
  if (c.enabled && canUse('offline.smartCleanup').allowed && (!c.lastRunAt || now - c.lastRunAt > 20 * 3600_000)) {
    try {
      await runSmartCleanup(c);
      cleanupStore.set({ ...cleanupStore.get(), lastRunAt: now });
      done.push('cleanup');
    } catch {
      // ignore
    }
  }
  if (canUse('tools.autoBackup').allowed) {
    try {
      if (await runAutoBackupIfDue(now)) done.push('backup');
    } catch {
      // ignore
    }
  }
  try {
    if (await runScheduledAgentsIfDue(now)) done.push('agents');
  } catch {
    // ignore
  }
  try {
    await loadMotivation({ toast: true });
    done.push('motivation');
  } catch {
    // ignore
  }
  return done;
};

/** Schedules the jobs once per app process. */
export const scheduleStartupJobs = (delayMs = 8000) => {
  if (started) return;
  started = true;
  setTimeout(() => void runStartupJobs(), delayMs);
};
