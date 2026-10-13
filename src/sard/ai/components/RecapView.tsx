/**
 * «ما سبق» — recap of the chapters right before the current one.
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { ThemeColors } from '@theme/types';
import { Button } from '@components';
import { showToast } from '@utils/showToast';
import type { ChapterInfo } from '@database/types';
import { getAISettings } from '@services/ai';
import { generateRecap, type NovelRef, type RecapResult } from '../features';
import { AI_STRINGS } from '../strings';
import { enqueueChapterDownloads } from '../../agents/library';
import AiErrorNotice from './AiErrorNotice';
import { Card, formatRelativeAr, LoadingRow, MarkdownText, Muted, Notice } from './ui';
import { useAiTask } from './useAiTask';

const S = AI_STRINGS.recap;

const RecapView = ({
  theme,
  novel,
  currentChapterId,
  onOpenSettings,
  autoGenerate,
}: {
  theme: ThemeColors;
  novel: NovelRef;
  currentChapterId?: number;
  onOpenSettings?: () => void;
  /** Generate immediately when nothing is cached (reader «auto recap»). */
  autoGenerate?: boolean;
}) => {
  const task = useAiTask();
  const [result, setResult] = useState<RecapResult | undefined>();
  const [checked, setChecked] = useState(false);

  const generate = useCallback(
    (force = false) =>
      task
        .run(signal => generateRecap({ novel, currentChapterId, force, signal }))
        .then(r => {
          if (r && r.status !== 'not_cached') setResult(r);
        }),
    [task, novel, currentChapterId],
  );

  useEffect(() => {
    let alive = true;
    generateRecap({ novel, currentChapterId, cacheOnly: true })
      .then(r => {
        if (!alive) return;
        if (r.status === 'not_cached') {
          if (autoGenerate) generate();
        } else {
          setResult(r);
        }
      })
      .catch(() => {})
      .finally(() => alive && setChecked(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novel.id, currentChapterId]);

  const downloadMissing = (missing: ChapterInfo[]) => {
    const n = enqueueChapterDownloads(novel, missing);
    showToast(AI_STRINGS.recap.downloadPrevious(n));
  };

  if (task.running) {
    return (
      <LoadingRow
        theme={theme}
        label={AI_STRINGS.common.working}
        onCancel={task.cancel}
        cancelLabel={AI_STRINGS.common.cancel}
      />
    );
  }

  return (
    <View>
      {task.error ? (
        <AiErrorNotice
          theme={theme}
          error={task.error}
          onOpenSettings={onOpenSettings}
          onRetry={() => generate()}
        />
      ) : null}
      {result?.status === 'no_previous' ? (
        <Notice theme={theme} title={S.noPrevious} />
      ) : null}
      {result?.status === 'no_downloaded' ? (
        <Notice
          theme={theme}
          icon="download-outline"
          title={S.noDownloaded}
          actionLabel={
            result.missing.length
              ? S.downloadPrevious(result.missing.length)
              : undefined
          }
          onAction={() => downloadMissing(result.missing)}
        />
      ) : null}
      {result?.status === 'ok' ? (
        <Card theme={theme}>
          <MarkdownText theme={theme} text={result.text} />
          <Muted theme={theme} style={styles.meta}>
            {S.basedOn(
              result.basedOn.length,
              result.basedOn.map(c => c.name).join('، '),
            )}
            {' · '}
            {result.cached ? AI_STRINGS.common.fromCache : ''}{' '}
            {formatRelativeAr(result.createdAt)}
          </Muted>
          {result.missing.length ? (
            <Muted theme={theme} style={styles.meta}>
              {S.noDownloaded}
            </Muted>
          ) : null}
          <View style={styles.actions}>
            <Button
              mode="text"
              compact
              icon="content-copy"
              title={AI_STRINGS.common.copy}
              onPress={() =>
                Clipboard.setStringAsync(result.text).then(() =>
                  showToast(AI_STRINGS.common.copied),
                )
              }
            />
            <Button
              mode="text"
              compact
              icon="refresh"
              title={AI_STRINGS.common.regenerate}
              onPress={() => generate(true)}
            />
          </View>
        </Card>
      ) : null}
      {checked && !result && !task.error ? (
        <View style={styles.cta}>
          <Muted theme={theme} style={styles.intro}>
            {S.intro} ({getAISettings().recapChapters})
          </Muted>
          <Button
            mode="contained"
            icon="history"
            title={S.generate}
            onPress={() => generate()}
          />
        </View>
      ) : null}
    </View>
  );
};

export default RecapView;

const styles = StyleSheet.create({
  meta: { marginTop: 12, fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  cta: { alignItems: 'center', padding: 24 },
  intro: { textAlign: 'center', marginBottom: 16 },
});
