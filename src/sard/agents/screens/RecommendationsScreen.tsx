/**
 * Recommender (route `SardRecommendations`): picks from the user's installed
 * sources' popular lists, scored by an on-device taste profile.
 */
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '@hooks/persisted';
import { Appbar, Button, SafeAreaView, SwitchItem } from '@components';
import { AGENT_STRINGS } from '../../ai/strings';
import {
  Card,
  formatRelativeAr,
  LoadingRow,
  Muted,
  Notice,
  Pill,
  ProgressBar,
} from '../../ai/components/ui';
import NovelRow from '../components/NovelRow';
import {
  getCachedRecommendations,
  getInstalledSources,
  getRecommendations,
  type RecommendationRun,
} from '../recommender';
import { openNovelScreen } from '../navigation';

const R = AGENT_STRINGS.recommender;

const RecommendationsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [run, setRun] = useState<RecommendationRun | undefined>(() => getCachedRecommendations());
  const [loading, setLoading] = useState(false);
  const [deep, setDeep] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string }>();
  const ctrl = useRef<AbortController | null>(null);
  const hasSources = getInstalledSources().length > 0;

  const refresh = async (force: boolean) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    try {
      const r = await getRecommendations({
        force,
        deep,
        signal: c.signal,
        onProgress: (done, total, name) => setProgress({ done, total, name }),
      });
      if (!c.signal.aborted) setRun(r);
    } finally {
      setLoading(false);
      setProgress(undefined);
    }
  };

  useEffect(() => {
    if (!run && hasSources) refresh(false);
    return () => ctrl.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const header = (
    <View>
      {run?.profile.topGenres.length ? (
        <Card theme={theme}>
          <Muted theme={theme}>{R.taste}</Muted>
          <View style={styles.pills}>
            {run.profile.topGenres.map(g => (
              <Pill key={g} theme={theme} label={g} active />
            ))}
          </View>
        </Card>
      ) : !loading && run ? (
        <Notice theme={theme} title={R.noTaste} />
      ) : null}
      <SwitchItem
        label={R.deepScan}
        value={deep}
        onPress={() => setDeep(v => !v)}
        theme={theme}
      />
      {loading ? (
        <View>
          <LoadingRow
            theme={theme}
            label={
              progress?.name
                ? R.scanning(progress.done + 1, progress.total, progress.name)
                : AGENT_STRINGS.chat.working
            }
            onCancel={() => ctrl.current?.abort()}
            cancelLabel="إيقاف"
          />
          {progress?.total ? (
            <ProgressBar theme={theme} value={progress.done / progress.total} style={styles.bar} />
          ) : null}
        </View>
      ) : (
        <View style={styles.cta}>
          <Button mode="contained-tonal" icon="refresh" title={R.refresh} onPress={() => refresh(true)} />
        </View>
      )}
      {run && !loading ? (
        <Muted theme={theme} style={styles.meta}>
          {R.sourcesUsed(run.sources)}
          {run.failed ? ` · ${R.failedSources(run.failed)}` : ''} · {formatRelativeAr(run.at)}
        </Muted>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView excludeTop>
      <Appbar title={R.title} handleGoBack={navigation.goBack} theme={theme} mode="small" />
      {!hasSources ? (
        <Notice theme={theme} icon="puzzle-outline" title={R.noSources} />
      ) : (
        <FlatList
          data={run?.items ?? []}
          keyExtractor={i => `${i.pluginId}::${i.path}`}
          ListHeaderComponent={header}
          ListEmptyComponent={!loading && run ? <Notice theme={theme} title={R.empty} /> : null}
          renderItem={({ item }) => (
            <NovelRow
              theme={theme}
              title={item.name}
              subtitle={item.summary ? item.summary.slice(0, 160) : undefined}
              caption={item.why}
              cover={item.cover}
              onPress={() =>
                openNovelScreen(navigation, {
                  name: item.name,
                  path: item.path,
                  pluginId: item.pluginId,
                  cover: item.cover,
                })
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
};

export default RecommendationsScreen;

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  cta: { alignItems: 'center', paddingVertical: 8 },
  bar: { marginHorizontal: 16 },
  meta: { marginHorizontal: 16, marginBottom: 8, fontSize: 12 },
});
