import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';

import {
  Dialog,
  SegmentedControl,
  SelectableChip,
  Slider,
  SwitchItem,
} from '@components';
import NativeFile from '@modules/native-file';
import { NovelInfo } from '@database/types';
import { getAllNovelChaptersForBackup } from '@database/queries/ChapterQueries';
import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';
import {
  DEFAULT_EXPORT_OPTIONS,
  enqueueNovelExport,
  type ExportFormat,
  type ExportOptions,
} from '@services/export';

import { EXPORT_FONTS } from '../fonts';
import {
  AUTO_SPLIT_SIZE,
  AUTO_SPLIT_THRESHOLD,
  selectChapters,
  sanitizeFileName,
  type ExportScope,
  type MissingPolicy,
  type SelectableChapter,
} from '../selection';
import type { Margins, PageSize, PaperTheme } from '../html';
import { exportStrings as S, fmt } from '../strings';

import * as DocumentPicker from 'expo-document-picker';
import { BACKGROUND_TASKS_STORE_KEY, type QueuedBackgroundTask } from '@services/backgroundTasks';
import { canUse, requireFeature } from '../../membership/service';
import { bumpCounter } from '../../plus/store';
import { t } from '../../i18n';

const SETTINGS_KEY = 'SARD_EXPORT_SETTINGS';

/** Export jobs already waiting in the background queue (Legend may queue several). */
const queuedExports = () =>
  (getMMKVObject<QueuedBackgroundTask[]>(BACKGROUND_TASKS_STORE_KEY) ?? []).filter(
    q => q?.task?.name === 'EXPORT_NOVEL',
  ).length;

interface PersistedExportSettings {
  format: ExportFormat;
  scope: ExportScope;
  missingPolicy: MissingPolicy;
  destinationUri: string;
  options: ExportOptions;
}

const loadSettings = (): PersistedExportSettings => {
  const saved = getMMKVObject<Partial<PersistedExportSettings>>(SETTINGS_KEY);
  return {
    format: saved?.format ?? 'pdf',
    scope: saved?.scope ?? 'all',
    missingPolicy: saved?.missingPolicy ?? 'download',
    destinationUri: saved?.destinationUri ?? '',
    options: { ...DEFAULT_EXPORT_OPTIONS, ...(saved?.options ?? {}) },
  };
};

interface ExportNovelDialogProps {
  novel: NovelInfo;
  visible: boolean;
  onDismiss: () => void;
  /** Optional reader-theme CSS for EPUB (built by the novel screen). */
  readerThemeCss?: string;
}

const ExportNovelDialog: React.FC<ExportNovelDialogProps> = ({
  novel,
  visible,
  onDismiss,
  readerThemeCss,
}) => {
  const theme = useTheme();
  const { epubLocation = '' } = useChapterReaderSettings();
  const initial = useMemo(loadSettings, []);

  const [format, setFormat] = useState<ExportFormat>(initial.format);
  const [scope, setScope] = useState<ExportScope>(initial.scope);
  const [range, setRange] = useState('');
  const [missingPolicy, setMissingPolicy] = useState<MissingPolicy>(
    initial.missingPolicy,
  );
  const [options, setOptions] = useState<ExportOptions>(initial.options);
  const [useReaderTheme, setUseReaderTheme] = useState(false);
  const [uri, setUri] = useState(initial.destinationUri || epubLocation);
  const [fileName, setFileName] = useState(sanitizeFileName(novel.name));
  const [fileNameError, setFileNameError] = useState(false);
  const [chapters, setChapters] = useState<SelectableChapter[] | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [customCover, setCustomCover] = useState<string | undefined>();

  const isPlugin = !novel.isLocal && novel.pluginId !== 'local';

  useEffect(() => {
    let active = true;
    getAllNovelChaptersForBackup(novel.id)
      .then(rows => {
        if (active) setChapters(rows);
      })
      .catch(error => {
        if (active) {
          setChapters([]);
          showToast(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      active = false;
    };
  }, [novel.id]);

  const selection = useMemo(
    () => (chapters ? selectChapters(chapters, { scope, range }) : undefined),
    [chapters, scope, range],
  );

  const selectionError = useMemo(() => {
    if (!selection || selection.ok) return '';
    switch (selection.reason) {
      case 'bounds':
        return fmt(S.rangeOutOfBounds, { total: chapters?.length ?? 0 });
      case 'empty':
        return scope === 'range' && !range.trim() ? '' : S.rangeEmpty;
      case 'noChapters':
        return S.noChapters;
      default:
        return S.rangeInvalid;
    }
  }, [selection, chapters, scope, range]);

  const setOption = useCallback(
    <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) =>
      setOptions(prev => ({ ...prev, [key]: value })),
    [],
  );

  const selectedCount = selection?.ok ? selection.selected.length : 0;
  const missingCount = selection?.ok ? selection.missing.length : 0;
  const autoParts =
    format === 'pdf' &&
    !options.chaptersPerFile &&
    selectedCount > AUTO_SPLIT_THRESHOLD
      ? Math.ceil(selectedCount / AUTO_SPLIT_SIZE)
      : 0;

  const pickFolder = async () => {
    try {
      const result = await NativeFile.pickDirectory();
      setUri(result.uri);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    }
  };

  const submit = async () => {
    const name = sanitizeFileName(fileName, '');
    if (!name) {
      setFileNameError(true);
      return;
    }
    if (!selection?.ok) {
      showToast(selectionError || S.noChapters);
      return;
    }
    // Sard 1.1 membership gates: free exports one chapter; Plus a novel /
    // volume / range; Pro paper templates + custom cover; Legend batches.
    if (selection.selected.length > 1 && !requireFeature('export.fullNovel')) {
      return;
    }
    if ((options.paperTheme !== 'white' || customCover) && !requireFeature('export.templates')) {
      return;
    }
    const waiting = queuedExports();
    if (waiting >= 1 && !requireFeature('export.batch', waiting)) {
      return;
    }
    if (
      missingPolicy === 'skip' &&
      !novel.isLocal &&
      selection.downloaded.length === 0
    ) {
      showToast(S.noDownloaded);
      return;
    }
    setSubmitting(true);
    try {
      let destination = uri;
      if (!destination) {
        destination = (await NativeFile.pickDirectory()).uri;
        setUri(destination);
      }
      const finalOptions: ExportOptions = {
        ...options,
        epubExtraStylesheet: useReaderTheme ? readerThemeCss : undefined,
      };
      setMMKVObject<PersistedExportSettings>(SETTINGS_KEY, {
        format,
        scope,
        missingPolicy,
        destinationUri: destination,
        options: { ...finalOptions, epubExtraStylesheet: undefined },
      });
      enqueueNovelExport({
        format,
        novel: {
          id: novel.id,
          name: novel.name,
          pluginId: novel.pluginId,
          author: novel.author,
          summary: novel.summary,
          cover: customCover ?? novel.cover,
          isLocal: novel.isLocal,
        },
        chapters: selection.selected.map(({ chapter, position }) => ({
          id: chapter.id,
          name: chapter.name,
          position,
          chapterNumber: chapter.chapterNumber,
          isDownloaded: Boolean(chapter.isDownloaded),
        })),
        missingPolicy: novel.isLocal ? 'skip' : missingPolicy,
        destinationUri: destination,
        fileName: name,
        options: finalOptions,
        watermark: isPlugin,
      });
      bumpCounter('exports');
      showToast(S.queued);
      onDismiss();
    } catch (error) {
      showToast(
        fmt(S.failed, {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const textStyle = { color: theme.onSurface };
  const mutedStyle = { color: theme.onSurfaceVariant };

  return (
    <Dialog.Root
      visible={visible}
      onDismiss={submitting ? () => undefined : onDismiss}
    >
      <Dialog.Header>
        <Dialog.Title>{S.dialogTitle}</Dialog.Title>
        <Dialog.Description>{S.dialogDescription}</Dialog.Description>
      </Dialog.Header>
      <Dialog.ScrollArea>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.section, { color: theme.primary }]}>
            {S.format}
          </Text>
          <View style={styles.pad}>
            <SegmentedControl<ExportFormat>
              theme={theme}
              value={format}
              onChange={setFormat}
              options={[
                { value: 'pdf', label: S.formatPdf, icon: 'file-pdf-box' },
                {
                  value: 'epub',
                  label: S.formatEpub,
                  icon: 'book-open-page-variant-outline',
                },
              ]}
            />
          </View>

          <Text style={[styles.section, { color: theme.primary }]}>
            {S.scope}
          </Text>
          <View style={styles.pad}>
            <SegmentedControl<ExportScope>
              theme={theme}
              value={scope}
              onChange={setScope}
              options={[
                { value: 'all', label: S.scopeAll },
                { value: 'downloaded', label: S.scopeDownloaded },
                { value: 'range', label: S.scopeRange },
              ]}
            />
          </View>
          {scope === 'range' ? (
            <View style={styles.pad}>
              <TextInput
                mode="outlined"
                label={S.rangeLabel}
                value={range}
                onChangeText={setRange}
                keyboardType="numbers-and-punctuation"
                error={Boolean(selectionError)}
                theme={{ colors: { ...theme } }}
              />
              <HelperText type={selectionError ? 'error' : 'info'} visible>
                {selectionError || S.rangeHelp}
              </HelperText>
            </View>
          ) : null}

          <View
            style={[styles.summary, { backgroundColor: theme.surfaceVariant }]}
          >
            {!chapters ? (
              <View style={styles.row}>
                <ActivityIndicator color={theme.primary} size="small" />
                <Text style={[styles.summaryText, mutedStyle]}>
                  {S.loadingChapters}
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.summaryText, textStyle]}>
                  {fmt(S.summary, { count: selectedCount })}
                  {missingCount && !novel.isLocal
                    ? ` · ${fmt(S.summaryMissing, { missing: missingCount })}`
                    : ''}
                </Text>
                {autoParts ? (
                  <Text style={[styles.summaryHint, mutedStyle]}>
                    {fmt(S.splitAuto, { parts: autoParts })}
                  </Text>
                ) : null}
              </>
            )}
          </View>

          {missingCount > 0 && !novel.isLocal ? (
            <>
              <Text style={[styles.section, { color: theme.primary }]}>
                {S.missingTitle}
              </Text>
              <View style={styles.pad}>
                <SegmentedControl<MissingPolicy>
                  theme={theme}
                  value={missingPolicy}
                  onChange={setMissingPolicy}
                  options={[
                    { value: 'download', label: S.missingDownload },
                    { value: 'skip', label: S.missingSkip },
                  ]}
                />
              </View>
            </>
          ) : null}

          {isPlugin ? (
            <View
              style={[styles.notice, { borderColor: theme.outlineVariant }]}
            >
              <Text style={[styles.noticeText, mutedStyle]}>
                {S.watermarkNotice}
              </Text>
            </View>
          ) : null}

          <Text style={[styles.section, { color: theme.primary }]}>
            {S.font}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {EXPORT_FONTS.map(font => (
              <SelectableChip
                key={font.id}
                label={font.name}
                selected={options.fontId === font.id}
                theme={theme}
                customFontFamily={font.file}
                onPress={() => setOption('fontId', font.id)}
              />
            ))}
          </ScrollView>

          {format === 'pdf' ? (
            <>
              <View style={styles.sliderRow}>
                <Text style={[styles.sliderLabel, textStyle]}>
                  {S.fontSize}
                </Text>
                <Slider
                  style={styles.slider}
                  value={options.fontSize}
                  min={9}
                  max={24}
                  step={1}
                  showValueIndicator
                  onValueChange={v => setOption('fontSize', v)}
                />
              </View>
              <View style={styles.sliderRow}>
                <Text style={[styles.sliderLabel, textStyle]}>
                  {S.lineHeight}
                </Text>
                <Slider
                  style={styles.slider}
                  value={options.lineHeight}
                  min={1.2}
                  max={2.6}
                  step={0.1}
                  showValueIndicator
                  formatValue={v => v.toFixed(1)}
                  onValueChange={v =>
                    setOption('lineHeight', Math.round(v * 10) / 10)
                  }
                />
              </View>
              <Text style={[styles.section, { color: theme.primary }]}>
                {S.pageSize}
              </Text>
              <View style={styles.pad}>
                <SegmentedControl<PageSize>
                  theme={theme}
                  value={options.pageSize}
                  onChange={v => setOption('pageSize', v)}
                  options={[
                    { value: 'A5', label: 'A5' },
                    { value: 'A4', label: 'A4' },
                    { value: 'Letter', label: 'Letter' },
                  ]}
                />
              </View>
              <Text style={[styles.section, { color: theme.primary }]}>
                {S.margins}
              </Text>
              <View style={styles.pad}>
                <SegmentedControl<Margins>
                  theme={theme}
                  value={options.margins}
                  onChange={v => setOption('margins', v)}
                  options={[
                    { value: 'narrow', label: S.marginsNarrow },
                    { value: 'normal', label: S.marginsNormal },
                    { value: 'wide', label: S.marginsWide },
                  ]}
                />
              </View>
              <Text style={[styles.section, { color: theme.primary }]}>
                {S.paperTheme}
              </Text>
              <View style={styles.pad}>
                <SegmentedControl<PaperTheme>
                  theme={theme}
                  value={options.paperTheme}
                  onChange={v => {
                    if (v !== 'white' && !requireFeature('export.templates')) return;
                    setOption('paperTheme', v);
                  }}
                  options={[
                    { value: 'white', label: S.paperWhite },
                    { value: 'sepia', label: S.paperSepia },
                    { value: 'dark', label: S.paperDark },
                  ]}
                />
              </View>
              <SwitchItem
                label={S.includeToc}
                value={options.includeToc}
                onPress={() => setOption('includeToc', !options.includeToc)}
                theme={theme}
              />
              <SwitchItem
                label={S.pageBreak}
                value={options.pageBreakPerChapter}
                onPress={() =>
                  setOption('pageBreakPerChapter', !options.pageBreakPerChapter)
                }
                theme={theme}
              />
            </>
          ) : (
            <SwitchItem
              label={S.useReaderTheme}
              value={useReaderTheme}
              onPress={() => setUseReaderTheme(v => !v)}
              theme={theme}
            />
          )}
          <SwitchItem
            label={S.includeCover}
            value={options.includeCover}
            onPress={() => setOption('includeCover', !options.includeCover)}
            theme={theme}
          />
          {options.includeCover ? (
            <SwitchItem
              label={t('plus.export.customCover')}
              description={
                customCover
                  ? t('plus.export.customCoverSet')
                  : canUse('export.templates').allowed
                    ? t('plus.export.customCoverHelp')
                    : t('plus.export.proOnly')
              }
              value={!!customCover}
              onPress={async () => {
                if (customCover) return setCustomCover(undefined);
                if (!requireFeature('export.templates')) return;
                const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
                if (!res.canceled && res.assets?.[0]?.uri) setCustomCover(res.assets[0].uri);
              }}
              theme={theme}
            />
          ) : null}
          <SwitchItem
            label={S.includeImages}
            value={options.includeImages}
            onPress={() => setOption('includeImages', !options.includeImages)}
            theme={theme}
          />
          <SwitchItem
            label={S.justify}
            value={options.justify}
            onPress={() => setOption('justify', !options.justify)}
            theme={theme}
          />
          <SwitchItem
            label={S.includeChapterNumber}
            value={options.includeChapterNumber}
            onPress={() =>
              setOption('includeChapterNumber', !options.includeChapterNumber)
            }
            theme={theme}
          />

          <View style={styles.form}>
            <TextInput
              mode="outlined"
              label={S.splitLabel}
              keyboardType="number-pad"
              value={
                options.chaptersPerFile ? String(options.chaptersPerFile) : ''
              }
              placeholder="0"
              onChangeText={v =>
                setOption(
                  'chaptersPerFile',
                  Math.max(0, parseInt(v.replace(/\D/g, ''), 10) || 0),
                )
              }
              theme={{ colors: { ...theme } }}
            />
            <HelperText type="info" visible>
              {S.splitHelp}
            </HelperText>
            <Pressable
              accessibilityRole="button"
              onPress={() => void pickFolder()}
            >
              <TextInput
                editable={false}
                pointerEvents="none"
                mode="outlined"
                label={S.directory}
                placeholder={S.selectFolder}
                value={uri}
                right={
                  <TextInput.Icon
                    icon="folder-outline"
                    forceTextInputFocus={false}
                    onPress={() => void pickFolder()}
                  />
                }
                theme={{ colors: { ...theme } }}
              />
            </Pressable>
            <View>
              <TextInput
                mode="outlined"
                label={S.fileName}
                value={fileName}
                error={fileNameError}
                onChangeText={v => {
                  setFileName(v);
                  if (v.trim()) setFileNameError(false);
                }}
                right={
                  <TextInput.Affix text={format === 'pdf' ? '.pdf' : '.epub'} />
                }
                theme={{ colors: { ...theme } }}
              />
              {fileNameError ? (
                <HelperText type="error">{S.fileNameRequired}</HelperText>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions>
        <Dialog.Action
          disabled={submitting}
          onPress={onDismiss}
          title={S.cancel}
        />
        <Dialog.Action
          disabled={submitting || !selection?.ok}
          loading={submitting}
          onPress={() => void submit()}
          title={S.export}
        />
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export default ExportNovelDialog;

const styles = StyleSheet.create({
  scroll: { paddingBottom: 12 },
  section: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pad: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summary: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  summaryText: { fontSize: 14 },
  summaryHint: { fontSize: 12, marginTop: 4 },
  notice: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  noticeText: { fontSize: 12, lineHeight: 18 },
  chips: { paddingHorizontal: 10 },
  sliderRow: { paddingHorizontal: 16, paddingTop: 12 },
  sliderLabel: { fontSize: 14, marginBottom: 4 },
  slider: { width: '100%' },
  form: { gap: 4, paddingHorizontal: 16, paddingTop: 16 },
});
