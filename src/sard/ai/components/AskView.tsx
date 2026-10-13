/**
 * اسأل الرواية — spoiler-safe Q&A over read chapters (persisted thread).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextInput as PaperTextInput } from 'react-native-paper';
import type { ThemeColors } from '@theme/types';
import { Button } from '@components';
import { appendChat, clearChat, listChat, type StoredChatMessage } from '../db';
import { askNovel, type AskResult, type NovelRef } from '../features';
import { AI_STRINGS } from '../strings';
import AiErrorNotice from './AiErrorNotice';
import { LoadingRow, MarkdownText, Muted, Pill } from './ui';
import { useAiTask } from './useAiTask';

const S = AI_STRINGS.ask;

const threadFor = (novelId: number) => `ask:${novelId}`;

const AskView = ({
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
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(
    () => listChat(threadFor(novel.id), 100).then(setMessages),
    [novel.id],
  );

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || task.running) return;
    setDraft('');
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    await appendChat(threadFor(novel.id), 'user', q);
    await load();
    const r = await task.run((signal, onProgress) =>
      askNovel({ novel, question: q, history, currentChapterId, signal, onProgress }),
    );
    if (r) {
      await appendChat(threadFor(novel.id), 'assistant', r.answer, {
        sources: r.sources,
        boundaryName: r.boundaryName,
      });
      await load();
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const noContext =
    task.error?.code === 'EMPTY' ? S.noContext : undefined;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {!messages.length ? (
          <View style={styles.intro}>
            <Muted theme={theme} style={styles.introText}>
              {S.intro}
            </Muted>
            <View style={styles.pills}>
              {S.suggestions.map(s => (
                <Pill key={s} theme={theme} label={s} onPress={() => send(s)} />
              ))}
            </View>
          </View>
        ) : null}
        {messages.map(m => {
          const mine = m.role === 'user';
          const payload = m.payload as Partial<AskResult> | undefined;
          return (
            <View
              key={m.id}
              style={[
                styles.bubble,
                mine ? styles.mine : styles.theirs,
                {
                  backgroundColor: mine
                    ? theme.primaryContainer
                    : theme.surfaceContainerHigh ?? theme.surfaceVariant,
                },
              ]}
            >
              {mine ? (
                <Text style={[styles.mineText, { color: theme.onPrimaryContainer }]}>
                  {m.content}
                </Text>
              ) : (
                <MarkdownText theme={theme} text={m.content} />
              )}
              {!mine && payload?.sources?.length ? (
                <Muted theme={theme} style={styles.sources}>
                  {S.sources}: {payload.sources.map(s => s.chapterName).join('، ')}
                </Muted>
              ) : null}
            </View>
          );
        })}
        {task.running ? (
          <LoadingRow
            theme={theme}
            label={
              task.progress
                ? S.indexing(task.progress.done, task.progress.total)
                : AI_STRINGS.common.working
            }
            onCancel={task.cancel}
            cancelLabel={AI_STRINGS.common.cancel}
          />
        ) : null}
        {task.error ? (
          noContext ? (
            <Muted theme={theme} style={styles.introText}>
              {noContext}
            </Muted>
          ) : (
            <AiErrorNotice theme={theme} error={task.error} onOpenSettings={onOpenSettings} />
          )
        ) : null}
      </ScrollView>
      <View style={[styles.inputRow, { borderTopColor: theme.outlineVariant }]}>
        <PaperTextInput
          mode="outlined"
          dense
          value={draft}
          onChangeText={setDraft}
          placeholder={S.placeholder}
          onSubmitEditing={() => send(draft)}
          returnKeyType="send"
          textColor={theme.onSurface}
          outlineColor={theme.outline}
          activeOutlineColor={theme.primary}
          style={styles.input}
          theme={{ colors: { background: theme.surface, onSurfaceVariant: theme.onSurfaceVariant } }}
        />
        <Button
          mode="contained"
          compact
          icon="send"
          title={S.send}
          disabled={!draft.trim() || task.running}
          onPress={() => send(draft)}
        />
      </View>
      {messages.length ? (
        <Button
          mode="text"
          compact
          icon="delete-sweep-outline"
          title={S.clearChat}
          onPress={async () => {
            await clearChat(threadFor(novel.id));
            load();
          }}
        />
      ) : null}
    </View>
  );
};

export default AskView;

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 360 },
  flex: { flex: 1 },
  list: { padding: 16, paddingBottom: 8 },
  intro: { alignItems: 'center', paddingVertical: 16 },
  introText: { textAlign: 'center', marginBottom: 12, marginHorizontal: 16 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  bubble: { borderRadius: 16, padding: 12, marginVertical: 4, maxWidth: '92%' },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  mineText: { fontSize: 15, lineHeight: 23 },
  sources: { marginTop: 8, fontSize: 12 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  input: { flex: 1 },
});
