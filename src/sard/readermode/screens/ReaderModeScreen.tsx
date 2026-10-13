/**
 * «وضع القراءة»: open one web page the user chose and show only its readable
 * content with the reader's fonts/colors. "الصفحة التالية" appears only when
 * a next link was detected, and that page is fetched only when tapped.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Appbar as PaperAppbar, TextInput } from 'react-native-paper';
import WebView, { type WebViewNavigation } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import * as Print from 'expo-print';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appbar, Button, List, SafeAreaView } from '@components';
import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';

import { buildPdfHtml, escapeHtml } from '../../export/html';
import {
  FONT_ASSET_BASE,
  fontFaceCss,
  fontFamilyStack,
  getExportFont,
} from '../../export/fonts';
import {
  readerModeStrings as S,
  exportStrings,
  fmt,
} from '../../export/strings';
import { fetchReadablePage, type FetchedPage } from '../fetchPage';
import { clearRecentPages, getRecentPages, rememberPage } from '../history';
import type { RecentPage } from '../recent';
import { savePageAsChapter } from '../savePage';
import { hostOf, normalizeUserUrl, resolveHttpUrl } from '../url';

export interface ReaderModeScreenParams {
  url?: string;
}

interface Props {
  route: { params?: ReaderModeScreenParams };
  navigation: {
    goBack: () => void;
    canGoBack: () => boolean;
    navigate: (...args: never[]) => void;
  };
}

type State =
  | { status: 'idle' }
  | { status: 'loading'; url: string }
  | { status: 'error'; url: string; message: string }
  | { status: 'ready'; page: FetchedPage };

const MIN_FONT = 12;
const MAX_FONT = 34;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const ReaderModeScreen: React.FC<Props> = ({ route, navigation }) => {
  const theme = useTheme();
  const reader = useChapterReaderSettings();
  const { bottom } = useSafeAreaInsets();

  const [input, setInput] = useState(route.params?.url ?? '');
  const [state, setState] = useState<State>({ status: 'idle' });
  const [recent, setRecent] = useState<RecentPage[]>(getRecentPages);
  const [fontSize, setFontSize] = useState(
    Math.max(MIN_FONT, reader.textSize || 18),
  );
  const [clipboardUrl, setClipboardUrl] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  /** Pages visited in this session, for «رجوع». */
  const backStack = useRef<string[]>([]);
  const currentUrl = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const open = useCallback(async (raw: string, pushHistory = true) => {
    const url = normalizeUserUrl(raw);
    if (!url) {
      showToast(S.invalidUrl);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (pushHistory && currentUrl.current && currentUrl.current !== url) {
      backStack.current.push(currentUrl.current);
    }
    setState({ status: 'loading', url });
    setInput(url);
    try {
      const page = await fetchReadablePage(url, controller.signal);
      if (controller.signal.aborted) return;
      currentUrl.current = page.finalUrl;
      setState({ status: 'ready', page });
      setInput(page.finalUrl);
      rememberPage({
        url: page.finalUrl,
        title: page.title,
        site: page.siteName ?? hostOf(page.finalUrl),
      });
      setRecent(getRecentPages());
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ status: 'error', url, message: errorText(error) });
    }
  }, []);

  useEffect(() => {
    if (route.params?.url) {
      open(route.params.url, false);
    }
  }, [route.params?.url, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Offer a URL found on the clipboard while the screen is idle.
  const checkClipboard = useCallback(async () => {
    try {
      if (!(await Clipboard.hasStringAsync())) {
        setClipboardUrl(undefined);
        return;
      }
      const text = (await Clipboard.getStringAsync()).trim();
      const url = /^https?:\/\//i.test(text)
        ? normalizeUserUrl(text)
        : undefined;
      setClipboardUrl(url);
    } catch {
      setClipboardUrl(undefined);
    }
  }, []);

  useEffect(() => {
    if (state.status !== 'idle') return;
    checkClipboard();
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') checkClipboard();
    });
    return () => sub.remove();
  }, [state.status, checkClipboard]);

  const goBack = useCallback(() => {
    const previous = backStack.current.pop();
    if (previous) {
      open(previous, false);
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation, open]);

  const page = state.status === 'ready' ? state.page : undefined;

  const html = useMemo(() => {
    if (!page) return '';
    const readerFont = reader.fontFamily;
    const font = getExportFont(readerFont || undefined);
    const family = readerFont
      ? `'${readerFont}', ${fontFamilyStack(font)}`
      : fontFamilyStack(font);
    const readerFace = readerFont
      ? `@font-face { font-family: '${readerFont}'; src: url("${FONT_ASSET_BASE}/${readerFont}.ttf"); }`
      : '';
    const site = page.siteName ?? hostOf(page.finalUrl);
    const byline = page.byline ? ` · ${escapeHtml(page.byline)}` : '';
    return `<!DOCTYPE html><html dir="${page.direction}" lang="${
      page.direction === 'rtl' ? 'ar' : 'en'
    }">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
${fontFaceCss(font)}
${readerFace}
html, body { margin: 0; background: ${reader.theme}; color: ${
      reader.textColor
    }; }
body { font-family: ${family}; font-size: ${fontSize}px; line-height: ${
      reader.lineHeight || 1.7
    };
  padding: 20px ${Math.max(4, reader.padding ?? 16)}px ${bottom + 120}px;
  text-align: ${
    reader.textAlign || 'start'
  }; overflow-wrap: break-word; -webkit-text-size-adjust: 100%; }
h1.sard-title { font-size: 1.45em; line-height: 1.35; margin: 0 0 .3em; }
.sard-meta { opacity: .65; font-size: .8em; margin-bottom: 1.4em; }
img, video { max-width: 100%; height: auto; display: block; margin: .8em auto; border-radius: 6px; }
a { color: ${theme.primary}; }
pre, code { white-space: pre-wrap; }
table { max-width: 100%; display: block; overflow-x: auto; }
blockquote { margin: .8em 0; padding-inline-start: 1em; border-inline-start: 3px solid ${
      theme.primary
    }; opacity: .85; }
</style></head>
<body>
<h1 class="sard-title">${escapeHtml(page.title)}</h1>
<div class="sard-meta">${escapeHtml(
      fmt(S.source, { site }),
    )}${byline} · ${escapeHtml(
      fmt(S.readingTime, { minutes: page.minutes }),
    )} · ${escapeHtml(fmt(S.words, { count: page.wordCount }))}</div>
${page.html}
</body></html>`;
  }, [page, reader, fontSize, theme.primary, bottom]);

  const onShouldStart = useCallback(
    (event: WebViewNavigation) => {
      if (!page) return true;
      if (event.url === 'about:blank' || event.url.startsWith('data:')) {
        return true;
      }
      const target = resolveHttpUrl(event.url, page.finalUrl);
      // Same document (initial load or #anchor jump) stays in the WebView.
      if (!target || target === page.finalUrl) return true;
      // JavaScript is off and embeds are stripped, so any other navigation
      // is a link the user tapped: open that single page in reader mode.
      open(target);
      return false;
    },
    [page, open],
  );

  const save = useCallback(async () => {
    if (!page) return;
    setSaving(true);
    try {
      const saved = await savePageAsChapter(page);
      showToast(fmt(S.saved, { novel: saved.novel.name }));
      (
        navigation.navigate as unknown as (name: string, params: object) => void
      )('ReaderStack', {
        screen: 'Chapter',
        params: { novel: saved.novel, chapter: saved.chapter },
      });
    } catch (error) {
      showToast(fmt(S.saveFailed, { error: errorText(error) }));
    } finally {
      setSaving(false);
    }
  }, [page, navigation]);

  const exportPdf = useCallback(async () => {
    if (!page) return;
    try {
      // System print dialog: "Save as PDF" or any printer.
      await Print.printAsync({
        html: buildPdfHtml({
          title: page.title,
          author: page.byline,
          chapters: [{ title: page.title, position: 1, html: page.html }],
          options: {
            fontId: 'amiri',
            fontSize: 13,
            lineHeight: 1.8,
            pageSize: 'A4',
            margins: 'normal',
            paperTheme: 'white',
            justify: true,
            includeCover: false,
            includeToc: false,
            pageBreakPerChapter: false,
            watermark: exportStrings.watermark,
            direction: page.direction,
          },
        }),
      });
    } catch (error) {
      showToast(fmt(exportStrings.failed, { error: errorText(error) }));
    }
  }, [page]);

  const copyUrl = useCallback(async () => {
    if (!page) return;
    await Clipboard.setStringAsync(page.finalUrl);
    showToast(S.copied);
  }, [page]);

  const openBrowser = (url: string) =>
    WebBrowser.openBrowserAsync(url).catch(() => undefined);

  const textColor = { color: theme.onSurface };
  const mutedColor = { color: theme.onSurfaceVariant };

  return (
    <SafeAreaView excludeTop>
      <Appbar title={S.title} mode="small" theme={theme} handleGoBack={goBack}>
        {page ? (
          <>
            <PaperAppbar.Action
              icon="format-font-size-decrease"
              iconColor={theme.onSurface}
              accessibilityLabel={S.fontSmaller}
              onPress={() => setFontSize(v => Math.max(MIN_FONT, v - 1))}
            />
            <PaperAppbar.Action
              icon="format-font-size-increase"
              iconColor={theme.onSurface}
              accessibilityLabel={S.fontBigger}
              onPress={() => setFontSize(v => Math.min(MAX_FONT, v + 1))}
            />
            <PaperAppbar.Action
              icon="earth"
              iconColor={theme.onSurface}
              accessibilityLabel={S.openInBrowser}
              onPress={() => openBrowser(page.finalUrl)}
            />
          </>
        ) : null}
      </Appbar>

      <View style={styles.urlBar}>
        <TextInput
          mode="outlined"
          dense
          value={input}
          onChangeText={setInput}
          placeholder={S.urlPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={() => open(input)}
          style={styles.urlInput}
          theme={{ colors: { ...theme } }}
          left={<TextInput.Icon icon="link-variant" />}
          right={
            <TextInput.Icon
              icon={input ? 'arrow-left-circle' : 'content-paste'}
              accessibilityLabel={input ? S.open : S.paste}
              onPress={async () => {
                if (input) {
                  open(input);
                  return;
                }
                const text = (await Clipboard.getStringAsync()).trim();
                setInput(text);
                if (normalizeUserUrl(text)) open(text);
              }}
            />
          }
        />
      </View>

      {state.status === 'idle' ? (
        <FlatList
          data={recent}
          keyExtractor={item => item.url}
          contentContainerStyle={{ paddingBottom: bottom + 24 }}
          ListHeaderComponent={
            <View>
              <Text style={[styles.intro, mutedColor]}>{S.intro}</Text>
              <Text style={[styles.introSmall, mutedColor]}>
                {S.personalNote}
              </Text>
              {clipboardUrl ? (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: theme.surfaceVariant },
                  ]}
                >
                  <Text style={[styles.cardTitle, textColor]}>
                    {S.clipboardFound}
                  </Text>
                  <Text style={[styles.cardBody, mutedColor]} numberOfLines={2}>
                    {clipboardUrl}
                  </Text>
                  <View style={styles.cardActions}>
                    <Button
                      title={S.clipboardOpen}
                      mode="contained-tonal"
                      onPress={() => open(clipboardUrl)}
                    />
                  </View>
                </View>
              ) : null}
              {recent.length ? (
                <View style={styles.recentHeader}>
                  <Text style={[styles.section, { color: theme.primary }]}>
                    {S.recent}
                  </Text>
                  <Button
                    title={S.clearRecent}
                    onPress={() => {
                      clearRecentPages();
                      setRecent([]);
                    }}
                  />
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <List.Item
              title={item.title}
              description={item.site}
              icon="web"
              theme={theme}
              onPress={() => open(item.url)}
            />
          )}
        />
      ) : null}

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.centerText, mutedColor]}>{S.loading}</Text>
          <Text style={[styles.centerSmall, mutedColor]} numberOfLines={1}>
            {hostOf(state.url)}
          </Text>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View style={styles.center}>
          <Text style={[styles.errorFace, mutedColor]}>(・_・;)</Text>
          <Text style={[styles.centerText, textColor]}>{state.message}</Text>
          <View style={styles.row}>
            <Button
              title={S.retry}
              mode="contained-tonal"
              onPress={() => open(state.url, false)}
            />
            <Button
              title={S.openInBrowser}
              onPress={() => openBrowser(state.url)}
            />
          </View>
        </View>
      ) : null}

      {page ? (
        <View style={styles.flex}>
          <WebView
            originWhitelist={['*']}
            source={{ html, baseUrl: page.finalUrl }}
            style={[styles.flex, { backgroundColor: reader.theme }]}
            javaScriptEnabled={false}
            domStorageEnabled={false}
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={onShouldStart}
          />
          <View
            style={[
              styles.toolbar,
              {
                backgroundColor: theme.surface2 ?? theme.surface,
                paddingBottom: bottom + 8,
              },
            ]}
          >
            <View style={styles.row}>
              {page.links.prev ? (
                <Button
                  icon="chevron-right"
                  title={S.prevPage}
                  onPress={() => page.links.prev && open(page.links.prev)}
                />
              ) : null}
              {page.links.next ? (
                <Button
                  icon="chevron-left"
                  mode="contained"
                  title={S.nextPage}
                  onPress={() => page.links.next && open(page.links.next)}
                />
              ) : null}
            </View>
            <View style={styles.row}>
              <PaperAppbar.Action
                icon="bookmark-plus-outline"
                iconColor={theme.onSurface}
                disabled={saving}
                accessibilityLabel={S.saveAsChapter}
                onPress={save}
              />
              <PaperAppbar.Action
                icon="file-pdf-box"
                iconColor={theme.onSurface}
                accessibilityLabel={S.exportPdf}
                onPress={exportPdf}
              />
              <PaperAppbar.Action
                icon="content-copy"
                iconColor={theme.onSurface}
                accessibilityLabel={S.share}
                onPress={copyUrl}
              />
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

export default ReaderModeScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  urlBar: { paddingHorizontal: 12, paddingBottom: 8 },
  urlInput: { fontSize: 14 },
  intro: { paddingHorizontal: 16, paddingTop: 8, fontSize: 14, lineHeight: 22 },
  introSmall: { paddingHorizontal: 16, paddingTop: 4, fontSize: 12 },
  card: { margin: 16, marginBottom: 0, padding: 14, borderRadius: 16 },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  cardBody: { fontSize: 12, marginTop: 4 },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingEnd: 8,
    marginTop: 16,
  },
  section: { fontSize: 13, fontWeight: '600', paddingHorizontal: 16 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  centerText: { fontSize: 15, textAlign: 'center' },
  centerSmall: { fontSize: 12 },
  errorFace: { fontSize: 36, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toolbar: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
});
