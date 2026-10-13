/**
 * Small async-task hook with cancellation, progress and Arabic errors.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isAIError, type AIErrorCode } from '@services/ai';
import { aiErrorMessage } from '../strings';

export interface AiTaskError {
  message: string;
  code?: AIErrorCode;
  /** True when the fix is in AI settings (key, model, disabled). */
  needsSettings: boolean;
}

export const toTaskError = (e: unknown): AiTaskError => {
  const code = isAIError(e) ? e.code : undefined;
  return {
    message: aiErrorMessage(e),
    code,
    needsSettings:
      code === 'NO_KEY' ||
      code === 'INVALID_KEY' ||
      code === 'DISABLED' ||
      code === 'MODEL_NOT_FOUND' ||
      code === 'LOCAL_QUOTA',
  };
};

export const useAiTask = () => {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<AiTaskError | undefined>();
  const [progress, setProgress] = useState<{ done: number; total: number; label?: string }>();
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const run = useCallback(
    async <T>(fn: (signal: AbortSignal, onProgress: (d: number, t: number, l?: string) => void) => Promise<T>) => {
      controller.current?.abort();
      const c = new AbortController();
      controller.current = c;
      setRunning(true);
      setError(undefined);
      setProgress(undefined);
      try {
        const r = await fn(c.signal, (done, total, label) => {
          if (mounted.current) setProgress({ done, total, label });
        });
        return r;
      } catch (e) {
        if (mounted.current && !(isAIError(e) && e.code === 'ABORTED')) {
          setError(toTaskError(e));
        }
        return undefined;
      } finally {
        if (mounted.current && controller.current === c) {
          setRunning(false);
          setProgress(undefined);
        }
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    setRunning(false);
    setProgress(undefined);
  }, []);

  return { run, cancel, running, error, setError, progress };
};
