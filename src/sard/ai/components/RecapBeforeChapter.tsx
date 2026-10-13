/**
 * Compact «ما سبق» card for the reader, shown before a chapter when the user
 * has been away from the novel (or always, via AI settings).
 * Renders nothing when AI is off/no key, when there's nothing previous, or
 * when the user hasn't been away and auto-recap is off.
 *
 *   <RecapBeforeChapter novel={novel} chapter={chapter} lastReadAt={novel.lastReadAt}
 *     onOpenFull={() => sheetRef.current?.present()} />
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useTheme } from '@hooks/persisted';
import { Button } from '@components';
import { useAISettings, useHasApiKey } from '@services/ai';
import { generateRecap, type NovelRef } from '../features';
import { AI_STRINGS } from '../strings';
import { parseDbDate } from '../../agents/shelves';
import { Card, MarkdownText, Muted } from './ui';
import { useAiTask } from './useAiTask';

const AWAY_MS = 3 * 24 * 3600 * 1000;

const RecapBeforeChapter = ({
  novel,
  chapterId,
  lastReadAt,
  onOpenFull,
  onDismiss,
}: {
  novel: NovelRef;
  chapterId: number;
  lastReadAt?: string | null;
  onOpenFull?: () => void;
  onDismiss?: () => void;
}) => {
  const theme = useTheme();
  const { settings } = useAISettings();
  const hasKey = useHasApiKey(settings.provider);
  const task = useAiTask();
  const [text, setText] = useState<string | undefined>();
  const [hidden, setHidden] = useState(false);
  const last = parseDbDate(lastReadAt);
  const away = last !== undefined && Date.now() - last > AWAY_MS;
  const eligible = settings.enabled && hasKey && (settings.autoRecapBeforeChapter || away);

  useEffect(() => {
    if (!eligible) return;
    let alive = true;
    generateRecap({ novel, currentChapterId: chapterId, cacheOnly: true })
      .then(r => {
        if (alive && r.status === 'ok') setText(r.text);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [eligible, novel, chapterId]);

  if (!eligible || hidden) return null;

  const generate = () =>
    task
      .run(signal => generateRecap({ novel, currentChapterId: chapterId, signal }))
      .then(r => {
        if (r?.status === 'ok') setText(r.text);
        else if (r) setHidden(true);
      });

  return (
    <Card theme={theme} style={styles.card}>
      <View style={styles.head}>
        <MaterialCommunityIcons name="history" size={18} color={theme.primary} />
        <Text style={[styles.title, { color: theme.onSurface }]}>{AI_STRINGS.recap.title}</Text>
        <Button
          mode="text"
          compact
          title={AI_STRINGS.common.close}
          onPress={() => {
            setHidden(true);
            onDismiss?.();
          }}
        />
      </View>
      {text ? (
        <MarkdownText theme={theme} text={text} />
      ) : (
        <Muted theme={theme}>{AI_STRINGS.recap.intro}</Muted>
      )}
      {task.error ? (
        <Text style={[styles.err, { color: theme.error }]}>{task.error.message}</Text>
      ) : null}
      <View style={styles.actions}>
        {!text ? (
          <Button
            mode="contained-tonal"
            compact
            loading={task.running}
            disabled={task.running}
            title={AI_STRINGS.recap.generate}
            onPress={generate}
          />
        ) : null}
        {onOpenFull ? (
          <Button mode="text" compact title={AI_STRINGS.common.open} onPress={onOpenFull} />
        ) : null}
      </View>
    </Card>
  );
};

export default RecapBeforeChapter;

const styles = StyleSheet.create({
  card: { marginTop: 12 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 15, fontWeight: '700', flex: 1, marginStart: 6 },
  err: { marginTop: 8, fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 8 },
});
