/**
 * «سَرد+» reader integration (used by useSardReader): look CSS (themes,
 * textures, drop cap, ornaments, progress bar), night schedule, blue-light
 * overlay, page-turn haptics/sounds, chapter reading time + learned WPM,
 * bound reader profiles, bookmark jumps/excerpts and "save word" from the
 * selection menu.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type WebView from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';
import type { ChapterInfo, NovelInfo } from '@database/types';
import { canUse } from '../../membership/service';
import { num, t } from '../../i18n';
import { addVocab } from '../db';
import { plusReaderSettings, wpmStore, type PlusReaderSettings } from '../store';
import { isWithinWindow } from '../logic/nightSchedule';
import { estimateChapter, learnWpm, remainingMinutes } from '../logic/readingTime';
import { SARD_THEMES, buildLookCss, ornamentizeHtml, type LookSettings } from '../logic/themes';
import { contextSentence, isVocabCandidate } from '../logic/vocab';
import { setReaderSession, takeProgressJump, useReaderSession } from '../readerSession';
import { PLUS_READER_SCRIPT } from './plusReaderScript';

const NIGHT_CSS = 'body,#LNReader-chapter{background-color:#0b0b0d!important;color:#c9c9c9!important;}';

/** Look settings with locked parts switched off for the current tier. */
export const effectiveLook = (s: PlusReaderSettings): { look: LookSettings; theme?: (typeof SARD_THEMES)[number] } => {
  const look: LookSettings = { ...s.look };
  if (look.texture !== 'none' && !canUse('custom.paperTextures').allowed) look.texture = 'none';
  if (look.dropCap && !canUse('custom.dropCap').allowed) look.dropCap = false;
  if (!canUse('custom.sceneOrnaments').allowed) look.ornaments = false;
  if (!canUse('custom.progressBar').allowed) look.progressBar = false;
  let theme = SARD_THEMES.find(x => x.id === look.themeId);
  if (theme && !canUse(theme.tier === 'legend' ? 'custom.exclusiveThemes' : 'custom.premiumThemes').allowed) theme = undefined;
  return { look, theme };
};

export const nightActive = (s: PlusReaderSettings, now = new Date()) =>
  s.nightSchedule && canUse('reading.nightSchedule').allowed && isWithinWindow(now, s.nightStart, s.nightEnd);

const effectiveSound = (s: PlusReaderSettings) => (canUse('reading.pageSounds').allowed ? s.sound : 'off');

const buildCss = (s: PlusReaderSettings) => {
  const { look, theme } = effectiveLook(s);
  return buildLookCss(look, theme) + (nightActive(s) && s.nightTheme === 'default-dark' ? NIGHT_CSS : '');
};

const inject = (ref: RefObject<WebView<object> | null>, js: string) => ref.current?.injectJavaScript(`try{${js}}catch(e){};true;`);

let excerptWaiter: ((v: { text: string; progress: number }) => void) | null = null;
let excerptRef: RefObject<WebView<object> | null> | null = null;

/** Asks the open reader for the text near the current position. */
export const requestReaderExcerpt = (): Promise<{ text: string; progress: number }> =>
  new Promise(resolve => {
    const fallback = { text: '', progress: useReaderSession.getState().progress };
    if (!excerptRef?.current) return resolve(fallback);
    const timer = setTimeout(() => {
      excerptWaiter = null;
      resolve(fallback);
    }, 1200);
    excerptWaiter = v => {
      clearTimeout(timer);
      resolve(v);
    };
    inject(excerptRef, 'window.sardPlus&&sardPlus.excerpt()');
  });

export const usePlusReader = ({
  webViewRef,
  novel,
  chapter,
  html,
}: {
  webViewRef: RefObject<WebView<object> | null>;
  novel: NovelInfo;
  chapter: ChapterInfo;
  html: string;
}) => {
  const snapshot = useMemo(
    () => plusReaderSettings.get(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapter.id],
  );
  const estimate = useMemo(() => estimateChapter(html, wpmStore.get()?.wpm), [html]);
  const jump = useMemo(() => takeProgressJump(chapter.id), [chapter.id]);

  const chapterHtml = useMemo(() => (effectiveLook(snapshot).look.ornaments ? ornamentizeHtml(html) : html), [html, snapshot]);

  const bodyScript = useMemo(() => {
    const { look } = effectiveLook(snapshot);
    const cfg = {
      css: buildCss(snapshot),
      dropCap: look.dropCap,
      progressBar: look.progressBar,
      sound: effectiveSound(snapshot),
      volume: snapshot.soundVolume,
      jump,
    };
    const json = JSON.stringify(cfg).replace(/<\//g, '<\\/');
    return `<script id="sard-plus-init">window.__SARD_PLUS__ = ${json};</script>
<script id="sard-plus">${PLUS_READER_SCRIPT}</script>`;
  }, [snapshot, jump]);

  /* --------------------------------------------- session + WPM learning */
  const startRef = useRef(Date.now());
  const progressRef = useRef(0);
  useEffect(() => {
    startRef.current = Date.now();
    progressRef.current = (chapter.progress ?? 0) / 100;
    excerptRef = webViewRef;
    setReaderSession({
      novelId: novel.id,
      novelName: novel.name,
      pluginId: novel.pluginId,
      novelPath: novel.path,
      novelCover: novel.cover ?? null,
      chapterId: chapter.id,
      chapterName: chapter.name,
      chapterPath: chapter.path,
      progress: progressRef.current,
      words: estimate.words,
      openedAt: startRef.current,
    });
    const words = estimate.words;
    const startProgress = progressRef.current;
    return () => {
      // Learn reading speed from a chapter read from (near) the start to (near) the end.
      if (startProgress < 0.2 && progressRef.current >= 0.9) {
        const next = learnWpm(wpmStore.get(), words, Date.now() - startRef.current);
        if (next) wpmStore.set(next);
      }
      if (excerptRef === webViewRef) excerptRef = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id]);

  const onProgress = useCallback((pct: unknown) => {
    if (typeof pct !== 'number') return;
    const p = Math.min(1, Math.max(0, pct > 1 ? pct / 100 : pct));
    progressRef.current = p;
    setReaderSession({ progress: p });
  }, []);

  /* ------------------------------------------- live settings → WebView */
  useEffect(() => {
    const sub = MMKVStorage.addOnValueChangedListener(key => {
      if (key !== plusReaderSettings.key) return;
      const s = plusReaderSettings.get();
      inject(webViewRef, `window.sardPlus&&sardPlus.setCss(${JSON.stringify(buildCss(s))});window.sardPlus&&sardPlus.setSound(${JSON.stringify(effectiveSound(s))},${Number(s.soundVolume) || 0})`);
    });
    return () => sub.remove();
  }, [webViewRef]);

  /* ------------------------------------------------------- haptics */
  const hapticsOn = useCallback(() => {
    const s = plusReaderSettings.get();
    return s.haptics && canUse('reading.pageHaptics').allowed;
  }, []);
  const firstChapter = useRef(true);
  useEffect(() => {
    if (firstChapter.current) {
      firstChapter.current = false;
      return;
    }
    if (hapticsOn()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [chapter.id, hapticsOn]);

  const onMessage = useCallback(
    (type: string, data: Record<string, any>): boolean => {
      switch (type) {
        case 'sard-page':
          if (hapticsOn()) Haptics.selectionAsync().catch(() => {});
          return true;
        case 'sard-plus-excerpt':
          excerptWaiter?.({ text: String(data.text ?? ''), progress: Number(data.progress) || progressRef.current });
          excerptWaiter = null;
          return true;
        case 'sard-vocab': {
          const word = String(data.text ?? '').trim();
          if (!isVocabCandidate(word)) {
            showToast(t('plus.reader.vocabTooLong'));
            return true;
          }
          if (!canUse('reading.vocabulary').allowed) return true;
          addVocab({
            word,
            sentence: contextSentence(String(data.sentence ?? ''), word),
            novelId: novel.id,
            novelName: novel.name,
            chapterId: chapter.id,
          })
            .then(r => showToast(r.existed ? t('plus.reader.vocabExists', { word }) : t('plus.reader.vocabSaved', { word })))
            .catch(e => showToast(t('common.error', { error: String(e?.message ?? e) })));
          return true;
        }
      }
      return false;
    },
    [chapter.id, hapticsOn, novel.id, novel.name],
  );

  const overlay = (
    <PlusReaderOverlay key={chapter.id} settings={snapshot} minutes={estimate.minutes} words={estimate.words} />
  );

  return { chapterHtml, bodyScript, onProgress, onMessage, overlay, estimate };
};

/** Blue-light / night overlay, chapter time pill and the session timer. */
const PlusReaderOverlay = ({ settings, minutes, words }: { settings: PlusReaderSettings; minutes: number; words: number }) => {
  const [live, setLive] = useState(settings);
  useEffect(() => {
    const sub = MMKVStorage.addOnValueChangedListener(key => {
      if (key === plusReaderSettings.key) setLive(plusReaderSettings.get());
    });
    return () => sub.remove();
  }, []);
  const [night, setNight] = useState(() => nightActive(live));
  useEffect(() => {
    setNight(nightActive(live));
    const timer = setInterval(() => setNight(nightActive(plusReaderSettings.get())), 60_000);
    return () => clearInterval(timer);
  }, [live]);

  const blue = (live.blueLight && canUse('reading.blueLight').allowed) || night;
  const strength = Math.min(0.6, Math.max(0.05, live.blueLightStrength || 0.25));

  // Chapter time pill fades out after a few seconds.
  const fade = useRef(new Animated.Value(1)).current;
  const showTime = live.showChapterTime && canUse('reading.chapterTime').allowed && words > 0;
  useEffect(() => {
    if (!showTime) return;
    const timer = setTimeout(() => Animated.timing(fade, { toValue: 0, duration: 600, useNativeDriver: true }).start(), 4000);
    return () => clearTimeout(timer);
  }, [fade, showTime]);

  // Session timer.
  useEffect(() => {
    if (!live.sessionMinutes || !canUse('reading.sessionTimer').allowed) return;
    const timer = setTimeout(() => {
      showToast(t('plus.reader.sessionDone', { n: num(live.sessionMinutes) }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, live.sessionMinutes * 60_000);
    return () => clearTimeout(timer);
  }, [live.sessionMinutes]);

  const progress = useReaderSession(s => s.progress);
  const left = remainingMinutes({ words, minutes, wpm: words / Math.max(1, minutes) }, progress);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="sard-plus-overlay">
      {blue ? <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FF8A1E', opacity: strength }]} testID="sard-blue-light" /> : null}
      {showTime ? (
        <Animated.View style={[styles.pill, { opacity: fade }]}>
          <Text style={styles.pillText}>{t('plus.reader.timePill', { min: num(left || minutes), words: num(words) })}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: 96,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: { color: '#fff', fontSize: 12 },
});
