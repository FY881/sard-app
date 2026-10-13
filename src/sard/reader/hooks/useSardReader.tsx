import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type WebView from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';

import { MMKVStorage } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';
import type { ChapterInfo, NovelInfo } from '@database/types';
import { Tts, type TtsPlaybackState, type TtsProgress } from '@modules/nitro-tts';

import {
  SARD_READER_SETTINGS,
  getSardReaderSettings,
  sanitizeSardSettings,
  setSardReaderSettings,
  type HighlightColor,
  type SardReaderSettings,
} from '../settings';
import { SARD_READER_STRINGS as S } from '../strings';
import { detectDirection } from '../arabic';
import { buildSardBodyScript, buildSardHeadStyle } from '../webview/buildDocumentParts';
import {
  addHighlight,
  deleteHighlight,
  getChapterHighlights,
  markHighlightsOrphaned,
  updateHighlight,
  type SardHighlightRow,
} from '../db';
import { takeHighlightJump } from '../jump';
import {
  cancelSleep,
  consumeChapterEnd,
  getSleepState,
  isSleepExpired,
  useSleepTimer,
} from '../ttsSleep';
import { pickArabicVoice } from '../voices';
import HighlightEditorDialog, { type HighlightDraft } from '../components/HighlightEditorDialog';
import QuoteCardModal, { type QuoteCardData } from '../components/QuoteCardModal';
import { usePlusReader } from '../../plus/reader/usePlusReader';

type TtsCommand = 'next' | 'pause' | 'play' | 'previous' | 'replay' | 'stop';

interface Anchor {
  start: number;
  end: number;
  text: string;
  prefix?: string;
  suffix?: string;
  color?: HighlightColor;
  intent?: 'highlight' | 'note';
}

interface Params {
  webViewRef: RefObject<WebView<object> | null>;
  novel: NovelInfo;
  chapter: ChapterInfo;
  /** Chapter html as it will be rendered (direction sniffing). */
  html: string;
  /** Direction LNReader derived from the plugin language. */
  sourceDir: 'rtl' | 'ltr';
  ttsState: TtsPlaybackState;
  ttsProgress: TtsProgress;
  runTtsCommand: (command: TtsCommand) => void;
}

const toWebHighlight = (h: SardHighlightRow) => ({
  id: h.id,
  start: h.startOffset,
  end: h.endOffset,
  text: h.text,
  prefix: h.prefix ?? '',
  suffix: h.suffix ?? '',
  color: h.color,
  note: h.note ?? '',
});

const inject = (ref: RefObject<WebView<object> | null>, js: string) =>
  ref.current?.injectJavaScript(`try{${js}}catch(e){};true;`);

/**
 * Sard's Arabic-first layer for LNReader's WebView reader: document pieces
 * (fonts, script), live settings, highlights, TTS sleep timer and Arabic
 * voice. WebViewReader wires the returned pieces in.
 */
export const useSardReader = ({
  webViewRef,
  novel,
  chapter,
  html,
  sourceDir,
  ttsState,
  ttsProgress,
  runTtsCommand,
}: Params) => {
  /* ------------------------------------------------------------ document */
  // Snapshotted per chapter so the WebView source stays stable; later
  // changes are pushed through injectJavaScript.
  const initialSettings = useMemo(
    () => sanitizeSardSettings(getSardReaderSettings()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapter.id],
  );

  const readerDir = useMemo(() => {
    const mode = initialSettings.direction;
    if (mode === 'rtl' || mode === 'ltr') return mode;
    if (mode === 'source') return sourceDir;
    return detectDirection(html, sourceDir);
  }, [html, initialSettings.direction, sourceDir]);

  const pendingJump = useMemo(() => takeHighlightJump(chapter.id), [chapter.id]);
  const pendingJumpRef = useRef<number | undefined>(pendingJump);
  pendingJumpRef.current = pendingJump;

  const bodyScript = useMemo(
    () => buildSardBodyScript(initialSettings, sourceDir, pendingJump),
    [initialSettings, sourceDir, pendingJump],
  );
  const headStyle = useMemo(() => buildSardHeadStyle(), []);

  // Sard 1.1 «سَرد+» layer (look, night, haptics/sounds, time, vocabulary, bookmarks).
  const plus = usePlusReader({ webViewRef, novel, chapter, html });
  const fullBodyScript = bodyScript + plus.bodyScript;

  /* ---------------------------------------------------------- highlights */
  const [highlights, setHighlights] = useState<SardHighlightRow[]>([]);
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;

  const pushHighlights = useCallback(
    (list: SardHighlightRow[]) =>
      inject(
        webViewRef,
        `window.sard&&sard.setHighlights(${JSON.stringify(list.map(toWebHighlight))})`,
      ),
    [webViewRef],
  );

  useEffect(() => {
    let cancelled = false;
    setHighlights([]);
    getChapterHighlights(chapter.id)
      .then(list => {
        if (cancelled) return;
        setHighlights(list);
        pushHighlights(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [chapter.id, pushHighlights]);

  const [editor, setEditor] = useState<{
    draft: HighlightDraft;
    anchor?: Anchor;
    focusNote?: boolean;
  } | null>(null);
  const [quote, setQuote] = useState<QuoteCardData | null>(null);

  const saveNewHighlight = useCallback(
    async (anchor: Anchor, color: HighlightColor, note?: string) => {
      try {
        const row = await addHighlight({
          novelId: novel.id,
          chapterId: chapter.id,
          novelName: novel.name,
          novelCover: novel.cover ?? null,
          pluginId: novel.pluginId,
          novelPath: novel.path,
          chapterName: chapter.name,
          chapterPath: chapter.path,
          text: anchor.text,
          note: note ?? null,
          color,
          startOffset: anchor.start,
          endOffset: anchor.end,
          prefix: anchor.prefix ?? null,
          suffix: anchor.suffix ?? null,
        });
        setHighlights(prev => [...prev, row]);
        inject(webViewRef, `window.sard&&sard.addHighlight(${JSON.stringify(toWebHighlight(row))})`);
        showToast(note?.trim() ? S.saved : S.highlightSaved);
      } catch (e) {
        showToast(String((e as Error)?.message ?? e));
      }
    },
    [chapter.id, chapter.name, chapter.path, novel, webViewRef],
  );

  /* ------------------------------------------------- settings → WebView */
  useEffect(() => {
    const sub = MMKVStorage.addOnValueChangedListener(key => {
      if (key !== SARD_READER_SETTINGS) return;
      const s = sanitizeSardSettings(getSardReaderSettings());
      inject(webViewRef, `window.sard&&sard.setSettings(${JSON.stringify(s)})`);
    });
    return () => sub.remove();
  }, [webViewRef]);

  /* ------------------------------------------------- TTS sleep + voice */
  const { state: sleep } = useSleepTimer();
  const pendingPauseIndexRef = useRef<number | null>(null);
  const ttsStateRef = useRef(ttsState);
  ttsStateRef.current = ttsState;
  const progressIndexRef = useRef(ttsProgress.index);
  progressIndexRef.current = ttsProgress.index;

  useEffect(() => {
    if (sleep.mode !== 'minutes') {
      pendingPauseIndexRef.current = null;
      return undefined;
    }
    const t = setInterval(() => {
      const s = getSleepState();
      if (!isSleepExpired(s)) return;
      if (ttsStateRef.current !== 'playing') {
        cancelSleep();
        return;
      }
      if (s.mode === 'minutes' && s.finishParagraph) {
        if (pendingPauseIndexRef.current === null) {
          pendingPauseIndexRef.current = progressIndexRef.current;
        }
      } else {
        runTtsCommand('pause');
        cancelSleep();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [runTtsCommand, sleep.mode]);

  useEffect(() => {
    const pending = pendingPauseIndexRef.current;
    if (pending !== null && ttsProgress.index !== pending) {
      pendingPauseIndexRef.current = null;
      runTtsCommand('pause');
      cancelSleep();
    }
  }, [runTtsCommand, ttsProgress.index]);

  useEffect(() => {
    if (pendingPauseIndexRef.current !== null && ttsState !== 'playing') {
      // Chapter finished (or user paused) while waiting for the paragraph end.
      pendingPauseIndexRef.current = null;
      cancelSleep();
    }
  }, [ttsState]);

  const arabicVoiceRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialSettings.ttsPreferArabicVoice || readerDir !== 'rtl') return undefined;
    let cancelled = false;
    Tts.getVoices(undefined)
      .then(voices => {
        if (!cancelled) arabicVoiceRef.current = pickArabicVoice(voices)?.identifier;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialSettings.ttsPreferArabicVoice, readerDir]);

  /**
   * Fills in an Arabic voice when the user has not chosen a voice/engine and
   * the chapter is Arabic, so Arabic text is not read by an English voice.
   */
  const resolveTtsSettings = useCallback(
    <T extends { voiceIdentifier?: string; engineName?: string }>(base: T): T => {
      if (base.voiceIdentifier || base.engineName || readerDir !== 'rtl') return base;
      if (!getSardReaderSettings().ttsPreferArabicVoice || !arabicVoiceRef.current) return base;
      return { ...base, voiceIdentifier: arabicVoiceRef.current };
    },
    [readerDir],
  );

  /** Whether TTS may start the next chapter by itself (sleep timer by chapters). */
  const allowTtsAutoNext = useCallback(() => consumeChapterEnd(), []);

  /* ------------------------------------------------ WebView lifecycle */
  const onLoadEnd = useCallback(() => {
    pushHighlights(highlightsRef.current);
    if (pendingJumpRef.current !== undefined) {
      inject(webViewRef, `window.sard&&sard.scrollToHighlight(${pendingJumpRef.current})`);
      pendingJumpRef.current = undefined;
    }
  }, [pushHighlights, webViewRef]);

  const onMessage = useCallback(
    (event: { type: string; data?: unknown }): boolean => {
      if (typeof event?.type !== 'string' || !event.type.startsWith('sard-')) return false;
      const data = (event.data ?? {}) as Record<string, any>;
      if (plus.onMessage(event.type, data)) return true;
      switch (event.type) {
        case 'sard-highlight': {
          const anchor = data as Anchor;
          if (typeof anchor.start !== 'number' || !anchor.text) break;
          const color =
            (anchor.color as HighlightColor) || getSardReaderSettings().defaultHighlightColor;
          if (anchor.intent === 'note') {
            setEditor({ draft: { text: anchor.text, color, note: '' }, anchor, focusNote: true });
          } else {
            void saveNewHighlight(anchor, color);
          }
          break;
        }
        case 'sard-highlight-press': {
          const h = highlightsRef.current.find(x => x.id === Number(data.id));
          if (h) {
            setEditor({
              draft: {
                id: h.id,
                text: h.text,
                note: h.note,
                color: h.color as HighlightColor,
                orphaned: h.orphaned,
              },
            });
          }
          break;
        }
        case 'sard-copy':
          if (typeof data.text === 'string') {
            void Clipboard.setStringAsync(data.text).then(() => showToast(S.copied));
          }
          break;
        case 'sard-share-quote':
          if (typeof data.text === 'string' && data.text.trim()) {
            setQuote({ text: data.text, novelName: novel.name, chapterName: chapter.name });
          }
          break;
        case 'sard-setting': {
          const patch: Partial<SardReaderSettings> = {};
          if (typeof data.focusPosition === 'number') patch.focusPosition = data.focusPosition;
          if (typeof data.autoScrollSpeed === 'number') patch.autoScrollSpeed = data.autoScrollSpeed;
          if (Object.keys(patch).length) setSardReaderSettings(patch);
          break;
        }
        case 'sard-highlight-orphans': {
          const ids: number[] = Array.isArray(data.ids) ? data.ids.map(Number) : [];
          const fresh = ids.filter(id =>
            highlightsRef.current.some(h => h.id === id && !h.orphaned),
          );
          if (fresh.length) {
            void markHighlightsOrphaned(fresh);
            setHighlights(prev =>
              prev.map(h => (fresh.includes(h.id) ? { ...h, orphaned: true } : h)),
            );
          }
          break;
        }
      }
      return true;
    },
    [chapter.name, novel.name, plus.onMessage, saveNewHighlight],
  );

  /* ------------------------------------------------------------ overlays */
  const closeEditor = useCallback(() => setEditor(null), []);

  const overlays = (
    <>
      <HighlightEditorDialog
        visible={!!editor}
        draft={editor?.draft ?? null}
        focusNote={editor?.focusNote}
        onDismiss={closeEditor}
        onSave={async ({ note, color }) => {
          const cur = editor;
          setEditor(null);
          if (!cur) return;
          if (cur.draft.id === undefined) {
            if (cur.anchor) await saveNewHighlight(cur.anchor, color, note);
            return;
          }
          const id = cur.draft.id;
          await updateHighlight(id, { note, color });
          setHighlights(prev =>
            prev.map(h => (h.id === id ? { ...h, note: note.trim() || null, color } : h)),
          );
          inject(
            webViewRef,
            `window.sard&&sard.updateHighlight(${JSON.stringify({ id, color, note })})`,
          );
          showToast(S.saved);
        }}
        onDelete={async () => {
          const id = editor?.draft.id;
          setEditor(null);
          if (id === undefined) return;
          await deleteHighlight(id);
          setHighlights(prev => prev.filter(h => h.id !== id));
          inject(webViewRef, `window.sard&&sard.removeHighlight(${id})`);
        }}
        onCopy={() => {
          if (editor) {
            void Clipboard.setStringAsync(editor.draft.text).then(() => showToast(S.copied));
          }
        }}
        onShare={() => {
          if (!editor) return;
          const d = editor.draft;
          setEditor(null);
          setQuote({ text: d.text, note: d.note, novelName: novel.name, chapterName: chapter.name });
        }}
      />
      <QuoteCardModal visible={!!quote} data={quote} onDismiss={() => setQuote(null)} />
      {plus.overlay}
    </>
  );

  return {
    readerDir,
    headStyle,
    bodyScript: fullBodyScript,
    chapterHtml: plus.chapterHtml,
    onProgress: plus.onProgress,
    onLoadEnd,
    onMessage,
    overlays,
    resolveTtsSettings,
    allowTtsAutoNext,
    highlights,
  };
};
