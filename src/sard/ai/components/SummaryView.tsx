/**
 * ملخص الفصل / المجلد — spoiler-aware summaries with chapter & volume pickers.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { ThemeColors } from '@theme/types';
import type { ChapterInfo } from '@database/types';
import { Button, ConfirmationDialog, SegmentedControl } from '@components';
import { showToast } from '@utils/showToast';
import {
  loadOrderedChapters,
  summarizeChapter,
  summarizeRange,
  type NovelRef,
} from '../features';
import { isRead, readCutoffIndex } from '../spoiler';
import { groupVolumes, type VolumeGroup } from '../volumes';
import { AI_STRINGS, AGENT_STRINGS } from '../strings';
import AiErrorNotice from './AiErrorNotice';
import { Card, formatRelativeAr, LoadingRow, MarkdownText, Muted, Notice, Pill } from './ui';
import { useAiTask } from './useAiTask';

const S = AI_STRINGS.summary;

type Mode = 'chapter' | 'volume';

interface Output {
  title: string;
  text: string;
  cached: boolean;
  createdAt: number;
  note?: string;
}

const SummaryView = ({
  theme,
  novel,
  currentChapterId,
  onOpenSettings,
}: {
  theme: ThemeColors;
  novel: NovelRef;
  currentChapterId?: number;
  onOpenSettings?: () => void;
}) => {
  const task = useAiTask();
  const [mode, setMode] = useState<Mode>('chapter');
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [selectedId, setSelectedId] = useState<number | undefined>(currentChapterId);
  const [selectedVolume, setSelectedVolume] = useState<number | undefined>();
  const [output, setOutput] = useState<Output | undefined>();
  const [confirm, setConfirm] = useState<
    { kind: 'spoiler' | 'network'; chapterId: number } | undefined
  >();

  useEffect(() => {
    loadOrderedChapters(novel.id).then(all => {
      setChapters(all);
      if (selectedId === undefined && all.length) {
        const cut = readCutoffIndex(all);
        setSelectedId(all[Math.max(0, cut)].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novel.id]);

  const volumes: VolumeGroup<ChapterInfo>[] = useMemo(
    () => groupVolumes(chapters),
    [chapters],
  );

  // Recent window of chapters around the reader position for quick picking.
  const pickable = useMemo(() => {
    if (!chapters.length) return [];
    const cut = readCutoffIndex(chapters, { currentChapterId, includeCurrent: true });
    const end = Math.min(chapters.length, Math.max(cut, 0) + 3);
    return chapters.slice(Math.max(0, end - 25), end).reverse();
  }, [chapters, currentChapterId]);

  const runChapter = useCallback(
    (chapterId: number, flags: { acceptSpoiler?: boolean; allowNetwork?: boolean } = {}, force = false) =>
      task
        .run(signal =>
          summarizeChapter({
            novel,
            chapterId,
            currentChapterId,
            signal,
            force,
            ...flags,
          }),
        )
        .then(r => {
          if (!r) return;
          if (r.status === 'spoiler_confirm') setConfirm({ kind: 'spoiler', chapterId });
          else if (r.status === 'no_text') setConfirm({ kind: 'network', chapterId });
          else if (r.status === 'ok') {
            setOutput({
              title: r.chapter.name,
              text: r.text,
              cached: r.cached,
              createdAt: r.createdAt,
            });
          }
        }),
    [task, novel, currentChapterId],
  );

  const runVolume = useCallback(
    (vol: VolumeGroup<ChapterInfo>, force = false) =>
      task
        .run((signal, onProgress) =>
          summarizeRange({
            novel,
            chapterIds: vol.chapters.map(c => c.id),
            currentChapterId,
            signal,
            force,
            onProgress,
          }),
        )
        .then(r => {
          if (!r) return;
          if (r.status === 'nothing_read') {
            setOutput({ title: vol.label, text: AGENT_STRINGS.chat.nothingRead, cached: false, createdAt: Date.now() });
          } else if (r.status === 'no_text') {
            setOutput({ title: vol.label, text: AI_STRINGS.recap.noDownloaded, cached: false, createdAt: Date.now() });
          } else {
            setOutput({
              title: `${vol.label}: ${S.volumeRange(r.from.name, r.to.name)}`,
              text: r.text,
              cached: r.cached,
              createdAt: r.createdAt,
              note: r.cappedAtCutoff ? AGENT_STRINGS.chat.cappedAtCutoff : undefined,
            });
          }
        }),
    [task, novel, currentChapterId],
  );

  const selectedVol = volumes.find(v => v.number === selectedVolume);

  return (
    <View>
      <View style={styles.segment}>
        <SegmentedControl<Mode>
          options={[
            { value: 'chapter', label: AI_STRINGS.common.chapter, icon: 'file-document-outline' },
            { value: 'volume', label: S.volume, icon: 'book-open-variant' },
          ]}
          value={mode}
          onChange={v => setMode(v)}
          theme={theme}
        />
      </View>

      {mode === 'chapter' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {pickable.map(c => (
            <Pill
              key={c.id}
              theme={theme}
              label={c.name.length > 28 ? c.name.slice(0, 27) + '…' : c.name}
              icon={isRead(c) ? 'check' : c.id === currentChapterId ? 'book-open-page-variant' : undefined}
              active={c.id === selectedId}
              onPress={() => setSelectedId(c.id)}
            />
          ))}
        </ScrollView>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {volumes.map(v => (
            <Pill
              key={v.number}
              theme={theme}
              label={`${v.label} (${v.chapters.length})`}
              active={v.number === selectedVolume}
              onPress={() => setSelectedVolume(v.number)}
            />
          ))}
        </ScrollView>
      )}

      {task.running ? (
        <LoadingRow
          theme={theme}
          label={
            task.progress
              ? `${AI_STRINGS.common.working} ${task.progress.done}/${task.progress.total}`
              : AI_STRINGS.common.working
          }
          onCancel={task.cancel}
          cancelLabel={AI_STRINGS.common.cancel}
        />
      ) : (
        <View style={styles.cta}>
          <Button
            mode="contained"
            icon="text-box-outline"
            title={mode === 'chapter' ? S.generate : S.volume}
            disabled={mode === 'chapter' ? !selectedId : !selectedVol}
            onPress={() =>
              mode === 'chapter'
                ? selectedId && runChapter(selectedId)
                : selectedVol && runVolume(selectedVol)
            }
          />
        </View>
      )}

      {task.error ? (
        <AiErrorNotice theme={theme} error={task.error} onOpenSettings={onOpenSettings} />
      ) : null}

      {output && !task.running ? (
        <Card theme={theme}>
          <Muted theme={theme} style={styles.title}>
            {output.title}
          </Muted>
          <MarkdownText theme={theme} text={output.text} />
          {output.note ? <Notice theme={theme} title={output.note} /> : null}
          <Muted theme={theme} style={styles.meta}>
            {output.cached ? `${AI_STRINGS.common.fromCache} · ` : ''}
            {formatRelativeAr(output.createdAt)}
          </Muted>
          <View style={styles.actions}>
            <Button
              mode="text"
              compact
              icon="content-copy"
              title={AI_STRINGS.common.copy}
              onPress={() =>
                Clipboard.setStringAsync(output.text).then(() => showToast(AI_STRINGS.common.copied))
              }
            />
            <Button
              mode="text"
              compact
              icon="refresh"
              title={AI_STRINGS.common.regenerate}
              onPress={() =>
                mode === 'chapter'
                  ? selectedId && runChapter(selectedId, { acceptSpoiler: true }, true)
                  : selectedVol && runVolume(selectedVol, true)
              }
            />
          </View>
        </Card>
      ) : null}

      <ConfirmationDialog
        visible={!!confirm}
        title={confirm?.kind === 'spoiler' ? S.spoilerWarnTitle : S.title}
        message={confirm?.kind === 'spoiler' ? S.spoilerWarn : S.notDownloaded}
        confirmLabel={AI_STRINGS.common.confirm}
        cancelLabel={AI_STRINGS.common.cancel}
        onConfirm={() => {
          const c = confirm;
          setConfirm(undefined);
          if (!c) return;
          runChapter(
            c.chapterId,
            c.kind === 'spoiler' ? { acceptSpoiler: true } : { acceptSpoiler: true, allowNetwork: true },
          );
        }}
        onDismiss={() => setConfirm(undefined)}
      />
    </View>
  );
};

export default SummaryView;

const styles = StyleSheet.create({
  segment: { marginHorizontal: 16, marginTop: 8 },
  pills: { paddingHorizontal: 16, paddingTop: 12 },
  cta: { alignItems: 'center', paddingVertical: 8 },
  title: { fontWeight: '600', marginBottom: 8 },
  meta: { marginTop: 12, fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
});
