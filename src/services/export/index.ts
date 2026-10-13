import { backgroundTasks } from '@services/backgroundTasks';
import type { BackgroundTask } from '@services/backgroundTasks/contracts';

import type { ExportNovelData } from './contracts';

export * from './contracts';
export { exportNovel } from './runExport';

export const EXPORT_NOVEL_TASK = 'EXPORT_NOVEL' as const;

/**
 * Queues an export on the shared background task queue (foreground service +
 * notification). The `EXPORT_NOVEL` variant is registered in
 * services/backgroundTasks (see work/docs/tracks/export.md); the cast keeps
 * this module compiling before that registration lands.
 */
export const enqueueNovelExport = (data: ExportNovelData) => {
  const task: BackgroundTask = { name: EXPORT_NOVEL_TASK, data };
  backgroundTasks.enqueue(task);
};
