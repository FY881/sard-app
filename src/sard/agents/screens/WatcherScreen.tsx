/**
 * Chapter Watcher (route `SardWatcher`): status, run/check now, and the
 * per-novel auto-download switches for the whole library.
 */
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { TextInput as PaperTextInput } from 'react-native-paper';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '@hooks/persisted';
import { Appbar, Button, SafeAreaView } from '@components';
import { Switch } from 'react-native-paper';
import { showToast } from '@utils/showToast';
import type { SardNovelAgentRow } from '@database/schema/sardAi';
import { AGENT_STRINGS } from '../../ai/strings';
import { normalizeText } from '../../ai/arabic';
import { listNovelAgents, upsertNovelAgent } from '../../ai/db';
import { Card, formatRelativeAr, Muted, Notice } from '../../ai/components/ui';
import NovelRow from '../components/NovelRow';
import NovelWatcherCard from '../components/NovelWatcherCard';
import { loadLibraryNovels, type LibraryNovel } from '../library';
import { useWatcherState } from '../settings';
import { checkForNewChapters, runChapterWatcher } from '../watcher';

const W = AGENT_STRINGS.watcher;

const WatcherScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const state = useWatcherState();
  const [novels, setNovels] = useState<LibraryNovel[]>([]);
  const [agents, setAgents] = useState<Map<number, SardNovelAgentRow>>(new Map());
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<number | undefined>();
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const [lib, rows] = await Promise.all([loadLibraryNovels(), listNovelAgents()]);
    setNovels(lib);
    setAgents(new Map(rows.map(r => [r.novelId, r])));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    const list = q ? novels.filter(n => normalizeText(n.name).includes(q)) : novels;
    return [...list].sort(
      (a, b) =>
        Number(!!agents.get(b.id)?.autoDownload) - Number(!!agents.get(a.id)?.autoDownload) ||
        (b.lastReadAt ?? '').localeCompare(a.lastReadAt ?? ''),
    );
  }, [novels, agents, query]);

  const enabledCount = [...agents.values()].filter(a => a.autoDownload).length;

  const toggle = async (n: LibraryNovel) => {
    const cur = agents.get(n.id);
    const next = await upsertNovelAgent(n.id, { autoDownload: !cur?.autoDownload });
    setAgents(prev => new Map(prev).set(n.id, next));
    if (next.autoDownload) runChapterWatcher({ novelIds: [n.id] }).catch(() => {});
  };

  const header = (
    <View>
      <Card theme={theme}>
        <Muted theme={theme}>{W.desc}</Muted>
        <Muted theme={theme} style={styles.meta}>
          {W.enabledNovels(enabledCount)} ·{' '}
          {state.lastRunAt ? AGENT_STRINGS.lastRun(formatRelativeAr(state.lastRunAt)) : AGENT_STRINGS.never}
          {state.lastRunAt ? ` · ${W.summary(state.lastQueued ?? 0, state.lastNovels ?? 0)}` : ''}
        </Muted>
        <View style={styles.actions}>
          <Button
            mode="contained"
            compact
            icon="update"
            title={W.checkUpdates}
            onPress={() => {
              checkForNewChapters();
              showToast(W.checkUpdatesStarted);
            }}
          />
          <Button
            mode="outlined"
            compact
            loading={running}
            disabled={running || !enabledCount}
            title={AGENT_STRINGS.runNow}
            onPress={async () => {
              setRunning(true);
              try {
                const r = await runChapterWatcher();
                showToast(W.summary(r.queued, r.novels.filter(x => x.queued).length));
                load();
              } finally {
                setRunning(false);
              }
            }}
          />
        </View>
      </Card>
      {state.lastSkipReason ? (
        <Notice theme={theme} icon="wifi-off" title={W.skipped[state.lastSkipReason] ?? ''} />
      ) : null}
      <Muted theme={theme} style={styles.battery}>
        {W.battery}
      </Muted>
      <PaperTextInput
        mode="outlined"
        dense
        value={query}
        onChangeText={setQuery}
        placeholder={W.searchNovels}
        left={<PaperTextInput.Icon icon="magnify" color={theme.onSurfaceVariant} />}
        textColor={theme.onSurface}
        outlineColor={theme.outline}
        activeOutlineColor={theme.primary}
        style={styles.search}
        theme={{ colors: { background: theme.surface, onSurfaceVariant: theme.onSurfaceVariant } }}
      />
    </View>
  );

  return (
    <SafeAreaView excludeTop>
      <Appbar title={W.title} handleGoBack={navigation.goBack} theme={theme} mode="small" />
      <FlatList
        data={filtered}
        keyExtractor={n => String(n.id)}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          const a = agents.get(item.id);
          return (
            <View>
              <NovelRow
                theme={theme}
                title={item.name}
                subtitle={
                  a?.autoDownload
                    ? `${W.autoDownloadDesc(a.autoDownloadCount)}${a.wifiOnly ? ` · ${W.wifiOnly}` : ''}`
                    : undefined
                }
                caption={
                  a?.lastRunAt
                    ? `${AGENT_STRINGS.lastRun(formatRelativeAr(a.lastRunAt))} · +${a.lastQueuedCount ?? 0}`
                    : undefined
                }
                cover={item.cover}
                onPress={() => setExpanded(expanded === item.id ? undefined : item.id)}
                right={
                  <Switch
                    value={!!a?.autoDownload}
                    onValueChange={() => toggle(item)}
                    color={theme.primary}
                  />
                }
              />
              {expanded === item.id ? <NovelWatcherCard novelId={item.id} compact /> : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
};

export default WatcherScreen;

const styles = StyleSheet.create({
  meta: { marginTop: 8, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  battery: { marginHorizontal: 16, marginVertical: 4, fontSize: 12 },
  search: { marginHorizontal: 16, marginVertical: 8 },
});
