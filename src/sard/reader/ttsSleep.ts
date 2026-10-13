import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * TTS sleep timer: a tiny in-memory store shared by the TTS tab (which sets
 * it) and the WebView reader (which enforces it). It deliberately does not
 * persist: a sleep timer should never survive an app restart.
 */
export type SleepState =
  | { mode: 'off' }
  | { mode: 'minutes'; endsAt: number; minutes: number; finishParagraph: boolean }
  | { mode: 'chapters'; chaptersLeft: number };

let state: SleepState = { mode: 'off' };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const getSleepState = () => state;
const setState = (next: SleepState) => {
  state = next;
  emit();
};

export const startSleepMinutes = (
  minutes: number,
  finishParagraph = true,
  now = Date.now(),
) =>
  setState({
    mode: 'minutes',
    minutes,
    endsAt: now + Math.max(1, minutes) * 60000,
    finishParagraph,
  });

/** `1` = stop at the end of the current chapter. */
export const startSleepChapters = (chapters: number) =>
  setState({ mode: 'chapters', chaptersLeft: Math.max(1, Math.round(chapters)) });

export const cancelSleep = () => setState({ mode: 'off' });

export const extendSleep = (minutes = 10, now = Date.now()) => {
  if (state.mode === 'minutes') {
    setState({ ...state, endsAt: Math.max(state.endsAt, now) + minutes * 60000 });
  } else if (state.mode === 'chapters') {
    setState({ ...state, chaptersLeft: state.chaptersLeft + 1 });
  } else {
    startSleepMinutes(minutes, true, now);
  }
};

/** Whether a minutes timer has run out. */
export const isSleepExpired = (s: SleepState, now = Date.now()) =>
  s.mode === 'minutes' && now >= s.endsAt;

/**
 * Called when TTS finished a chapter and wants to continue into the next one.
 * Returns whether playback may continue. Pure on the given state.
 */
export const nextStateOnChapterEnd = (
  s: SleepState,
): { continuePlayback: boolean; next: SleepState } => {
  if (s.mode !== 'chapters') return { continuePlayback: true, next: s };
  if (s.chaptersLeft <= 1) return { continuePlayback: false, next: { mode: 'off' } };
  return {
    continuePlayback: true,
    next: { mode: 'chapters', chaptersLeft: s.chaptersLeft - 1 },
  };
};

export const consumeChapterEnd = (): boolean => {
  const { continuePlayback, next } = nextStateOnChapterEnd(state);
  if (next !== state) setState(next);
  return continuePlayback;
};

export const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const two = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${two(mm)}:${two(s)}` : `${two(m)}:${two(s)}`;
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Current sleep state plus a remaining-ms value that ticks every second. */
export const useSleepTimer = () => {
  const s = useSyncExternalStore(subscribe, getSleepState, getSleepState);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (s.mode !== 'minutes') return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [s]);
  const remainingMs = s.mode === 'minutes' ? Math.max(0, s.endsAt - now) : 0;
  return { state: s, remainingMs };
};
