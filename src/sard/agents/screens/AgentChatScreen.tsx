/**
 * «محادثة الوكيل» (route `SardAgentChat`): Arabic commands → whitelisted local
 * tools. Destructive actions show an inline confirmation card.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TextInput as PaperTextInput, Appbar as PaperAppbar } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '@hooks/persisted';
import { Appbar, Button, ConfirmationDialog, SafeAreaView } from '@components';
import { AGENT_STRINGS } from '../../ai/strings';
import type { StoredChatMessage } from '../../ai/db';
import { LoadingRow, MarkdownText, Muted, Pill } from '../../ai/components/ui';
import NovelRow from '../components/NovelRow';
import {
  aiAvailable,
  cancelPending,
  clearAgentChat,
  loadAgentChat,
  resolvePending,
  sendAgentMessage,
} from '../agentChat';
import { openNovelScreen, sardNavigate } from '../navigation';
import type { AgentAction, AgentReply } from '../toolExecutor';

const S = AGENT_STRINGS.chat;

const AgentChatScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [clearVisible, setClearVisible] = useState(false);
  const [settled, setSettled] = useState<Set<number>>(new Set());
  const scrollRef = useRef<ScrollView>(null);

  const reload = useCallback(() => loadAgentChat().then(setMessages), []);
  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      await reload();
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    }
  };

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft('');
    // show the user's bubble immediately
    setMessages(prev => [
      ...prev,
      { id: -Date.now(), thread: 'agent', role: 'user', content: t, createdAt: Date.now() },
    ]);
    run(() => sendAgentMessage(t));
  };

  const doAction = (a: AgentAction) => {
    if (a.type === 'open_novel') openNovelScreen(navigation, a.novel);
    else sardNavigate(navigation, a.screen);
  };

  const settle = (id: number) => setSettled(prev => new Set(prev).add(id));

  const renderReply = (m: StoredChatMessage, isLast: boolean) => {
    const reply = m.payload as AgentReply | undefined;
    const open = isLast && !settled.has(m.id);
    return (
      <View>
        <MarkdownText theme={theme} text={m.content} />
        {reply?.items?.length ? (
          <View style={styles.items}>
            {reply.items.map((it, i) => (
              <NovelRow
                key={`${m.id}-${i}`}
                theme={theme}
                title={it.title}
                subtitle={it.subtitle}
                cover={it.novel?.cover}
                onPress={it.novel ? () => openNovelScreen(navigation, it.novel!) : undefined}
              />
            ))}
          </View>
        ) : null}
        {reply?.kind === 'confirm' && reply.pending && open ? (
          <View style={styles.actions}>
            <Button
              mode="contained"
              compact
              title={S.confirmAction}
              onPress={() => {
                settle(m.id);
                run(() => resolvePending(reply.pending!, { confirmed: true }));
              }}
            />
            <Button
              mode="text"
              compact
              title="إلغاء"
              onPress={() => {
                settle(m.id);
                run(() => cancelPending());
              }}
            />
          </View>
        ) : null}
        {reply?.kind === 'choose_novel' && reply.choices && reply.pending && open ? (
          <View style={styles.pills}>
            {reply.choices.map(c => (
              <Pill
                key={c.id}
                theme={theme}
                label={c.name}
                onPress={() => {
                  settle(m.id);
                  run(() => resolvePending(reply.pending!, { novelId: c.id }));
                }}
              />
            ))}
          </View>
        ) : null}
        {reply?.actions?.length ? (
          <View style={styles.actions}>
            {reply.actions.map((a, i) => (
              <Button
                key={i}
                mode="outlined"
                compact
                title={a.label}
                onPress={() => doAction(a)}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const lastAssistantId = [...messages].reverse().find(m => m.role === 'assistant')?.id;

  return (
    <SafeAreaView excludeTop>
      <Appbar title={S.title} handleGoBack={navigation.goBack} theme={theme} mode="small">
        <PaperAppbar.Action
          icon="delete-sweep-outline"
          iconColor={theme.onSurface}
          onPress={() => setClearVisible(true)}
          disabled={!messages.length}
        />
      </Appbar>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <View
            style={[
              styles.bubble,
              styles.theirs,
              { backgroundColor: theme.surfaceContainerHigh ?? theme.surfaceVariant },
            ]}
          >
            <Text style={[styles.text, { color: theme.onSurface }]}>{S.welcome}</Text>
            {!aiAvailable() ? (
              <Muted theme={theme} style={styles.hint}>
                {S.offlineHint}
              </Muted>
            ) : null}
          </View>
          {messages.map(m => {
            const mine = m.role === 'user';
            return (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  mine ? styles.mine : styles.theirs,
                  {
                    backgroundColor: mine
                      ? theme.primaryContainer
                      : (m.payload as AgentReply | undefined)?.kind === 'error'
                      ? theme.errorContainer
                      : theme.surfaceContainerHigh ?? theme.surfaceVariant,
                  },
                ]}
              >
                {mine ? (
                  <Text style={[styles.text, { color: theme.onPrimaryContainer }]}>{m.content}</Text>
                ) : (
                  renderReply(m, m.id === lastAssistantId)
                )}
              </View>
            );
          })}
          {busy ? <LoadingRow theme={theme} label={S.working} /> : null}
        </ScrollView>
        {!messages.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestions}
          >
            {S.suggestions.map(s => (
              <Pill
                key={s}
                theme={theme}
                label={s}
                onPress={() => (s.includes('…') ? setDraft(s.replace('…', '')) : send(s))}
              />
            ))}
          </ScrollView>
        ) : null}
        <View style={[styles.inputRow, { borderTopColor: theme.outlineVariant }]}>
          <PaperTextInput
            mode="outlined"
            dense
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder={S.placeholder}
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
            title=""
            disabled={!draft.trim() || busy}
            onPress={() => send(draft)}
          />
        </View>
      </KeyboardAvoidingView>
      <ConfirmationDialog
        visible={clearVisible}
        title={S.clear}
        message={S.clearConfirm}
        confirmLabel={S.clear}
        cancelLabel="إلغاء"
        confirmTone="danger"
        onConfirm={async () => {
          setClearVisible(false);
          await clearAgentChat();
          reload();
        }}
        onDismiss={() => setClearVisible(false)}
      />
    </SafeAreaView>
  );
};

export default AgentChatScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 12, paddingBottom: 16 },
  bubble: { borderRadius: 18, padding: 12, marginVertical: 4, maxWidth: '94%' },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  text: { fontSize: 15, lineHeight: 24 },
  hint: { marginTop: 8 },
  items: { marginTop: 6, marginHorizontal: -12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  suggestions: { paddingHorizontal: 12, paddingTop: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  input: { flex: 1, maxHeight: 120 },
});
