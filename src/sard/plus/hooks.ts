/** Async loading helpers for the «سَرد+» screens (reloads when the screen regains focus). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export const useAsync = <T>(fn: () => Promise<T>, deps: unknown[] = [], reloadOnFocus = true) => {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const v = await fnRef.current();
      if (alive.current) {
        setData(v);
        setError(undefined);
      }
    } catch (e) {
      if (alive.current) setError(String((e as Error)?.message ?? e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void reload(), deps);
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      if (reloadOnFocus) void reload();
    }, [reload, reloadOnFocus]),
  );
  return { data, loading, error, reload, setData };
};
