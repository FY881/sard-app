import { useCallback, useMemo } from 'react';
import { useMMKVObject } from 'react-native-mmkv';
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import type { DigitStyle, TashkeelMode } from './arabic';

/**
 * Sard-only reader settings. Kept under their own MMKV key so LNReader's
 * `ChapterReaderSettings` / `ChapterGeneralSettings` types stay untouched.
 */
export const SARD_READER_SETTINGS = 'SARD_READER_SETTINGS';

export type FocusMode = 'off' | 'ruler' | 'line' | 'paragraph';
export type DirectionMode = 'auto' | 'rtl' | 'ltr' | 'source';
export type AutoScrollMode = 'page' | 'smooth';
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'purple';

export interface SardReaderSettings {
  /* Arabic typography */
  tashkeel: TashkeelMode;
  stripTatweel: boolean;
  /**
   * Arabic-friendly justification when the reader alignment is "justify":
   * no letter-spacing (keeps cursive joining), inter-word spreading,
   * `text-justify: kashida` where the engine supports it, start-aligned last
   * line.
   */
  kashida: boolean;
  /** Automatic hyphenation for Latin text in justified mode. */
  hyphenate: boolean;
  direction: DirectionMode;
  digits: DigitStyle;
  /** 0 = use font default (400). */
  fontWeight: number;
  /** em, may be 0 */
  wordSpacing: number;
  /** em between paragraphs; null = LNReader default */
  paragraphSpacing: number | null;
  /** em first-line indent */
  textIndent: number;
  /** apply the Arabic font's recommended line height when picked */
  autoLineHeight: boolean;

  /* Focus */
  focusMode: FocusMode;
  /** band height in lines */
  focusLines: number;
  /** 0..1 dim strength outside the band */
  focusDim: number;
  /** vertical position of the band, 0..1 of the viewport */
  focusPosition: number;

  /* Smooth auto-scroll */
  autoScrollMode: AutoScrollMode;
  /** pixels per second */
  autoScrollSpeed: number;
  autoScrollNextChapter: boolean;
  /** pause while the finger is down and resume afterwards */
  autoScrollPauseOnTouch: boolean;

  /* Highlights */
  highlightsEnabled: boolean;
  defaultHighlightColor: HighlightColor;
  showChapterReadingTime: boolean;

  /* TTS extras */
  ttsPreferArabicVoice: boolean;
  /** default minutes offered by the sleep timer */
  ttsSleepDefaultMinutes: number;
  /** When the timer runs out, finish the paragraph being read before pausing. */
  ttsSleepFinishParagraph: boolean;

  /* Goals */
  dailyGoalMinutes: number;
  /** 6 = Saturday */
  weekStartsOn: number;
  goalReminderShown?: string;
}

export const defaultSardReaderSettings: SardReaderSettings = {
  tashkeel: 'show',
  stripTatweel: false,
  kashida: true,
  hyphenate: true,
  direction: 'auto',
  digits: 'default',
  fontWeight: 0,
  wordSpacing: 0,
  paragraphSpacing: null,
  textIndent: 0,
  autoLineHeight: true,

  focusMode: 'off',
  focusLines: 3,
  focusDim: 0.55,
  focusPosition: 0.38,

  autoScrollMode: 'smooth',
  autoScrollSpeed: 30,
  autoScrollNextChapter: true,
  autoScrollPauseOnTouch: true,

  highlightsEnabled: true,
  defaultHighlightColor: 'yellow',
  showChapterReadingTime: true,

  ttsPreferArabicVoice: true,
  ttsSleepDefaultMinutes: 30,
  ttsSleepFinishParagraph: true,

  dailyGoalMinutes: 20,
  weekStartsOn: 6,
};

export const HIGHLIGHT_COLORS: Record<
  HighlightColor,
  { light: string; dark: string; label: string }
> = {
  yellow: { light: '#FFE58F', dark: '#8A7A1F', label: 'أصفر' },
  green: { light: '#B7EB8F', dark: '#3F6B2A', label: 'أخضر' },
  blue: { light: '#A6D8FF', dark: '#2A5B8A', label: 'أزرق' },
  pink: { light: '#FFB3D1', dark: '#8A2A55', label: 'وردي' },
  orange: { light: '#FFC98F', dark: '#8A4F1F', label: 'برتقالي' },
  purple: { light: '#D3B8FF', dark: '#5A3A8A', label: 'بنفسجي' },
};

export const getSardReaderSettings = (): SardReaderSettings => ({
  ...defaultSardReaderSettings,
  ...getMMKVObject<Partial<SardReaderSettings>>(SARD_READER_SETTINGS),
});

export const setSardReaderSettings = (values: Partial<SardReaderSettings>) =>
  setMMKVObject(SARD_READER_SETTINGS, {
    ...getSardReaderSettings(),
    ...values,
  });

export const useSardReaderSettings = () => {
  const [stored, setStored] =
    useMMKVObject<Partial<SardReaderSettings>>(SARD_READER_SETTINGS);
  const settings = useMemo(
    () => ({ ...defaultSardReaderSettings, ...stored }),
    [stored],
  );
  const setSettings = useCallback(
    (values: Partial<SardReaderSettings>) =>
      setStored({ ...getSardReaderSettings(), ...values }),
    [setStored],
  );
  /** Restores reader defaults but keeps the user's goals. */
  const reset = useCallback(() => {
    const cur = getSardReaderSettings();
    setStored({
      ...defaultSardReaderSettings,
      dailyGoalMinutes: cur.dailyGoalMinutes,
      weekStartsOn: cur.weekStartsOn,
    });
  }, [setStored]);
  return { ...settings, settings, setSardReaderSettings: setSettings, reset };
};

/** Clamps numeric settings that come back from storage or the WebView. */
export const sanitizeSardSettings = (
  s: Partial<SardReaderSettings>,
): SardReaderSettings => {
  const v = { ...defaultSardReaderSettings, ...s };
  const clamp = (n: unknown, lo: number, hi: number, d: number) =>
    typeof n === 'number' && Number.isFinite(n)
      ? Math.min(hi, Math.max(lo, n))
      : d;
  return {
    ...v,
    focusLines: clamp(v.focusLines, 1, 8, 3),
    focusDim: clamp(v.focusDim, 0.1, 0.9, 0.55),
    focusPosition: clamp(v.focusPosition, 0.08, 0.92, 0.38),
    autoScrollSpeed: clamp(v.autoScrollSpeed, 5, 300, 30),
    dailyGoalMinutes: clamp(v.dailyGoalMinutes, 0, 600, 20),
    wordSpacing: clamp(v.wordSpacing, -0.1, 1, 0),
    paragraphSpacing:
      v.paragraphSpacing === null ? null : clamp(v.paragraphSpacing, 0, 3, 1),
    textIndent: clamp(v.textIndent, 0, 4, 0),
    fontWeight: clamp(v.fontWeight, 0, 1000, 0),
    ttsSleepDefaultMinutes: clamp(v.ttsSleepDefaultMinutes, 1, 600, 30),
  };
};
