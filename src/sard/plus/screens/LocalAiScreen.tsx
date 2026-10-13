/**
 * «الذكاء المحلي»: on-device tools with no internet and no key — chapter
 * summary, keywords, who's in the chapter (Plus), text difficulty, quiz
 * (Pro), offline recap of the last chapters (Plus) and full-text search in
 * a novel's downloaded chapters.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { TextInput } from 'react-native-paper';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { getChapter } from '@database/queries/ChapterQueries';
import { getNovelById } from '@database/queries/NovelQueries';
import { useEntitlement } from '../../membership/service';
import { FEATURES, type FeatureKey } from '../../membership/features';
import { num, t, tr } from '../../i18n';
import { Card, ChipsRow, Empty, Gated, Muted, Row, Screen, SectionTitle, StatTile, TileRow } from '../ui';
import { ChoiceDialog } from '../components/dialogs';
import { useAsync } from '../hooks';
import { loadLibraryNovels, type LibraryNovel } from '../../agents/library';
import { downloadedChaptersText, getChapterText, lastReadChaptersText, novelChaptersLite } from '../data';
import { characters, clozeQuiz, difficulty, keywords, searchText, summarize, type ClozeQuestion, type SearchHit } from '../logic/textAnalysis';

type Tool = 'summary' | 'keywords' | 'characters' | 'difficulty' | 'quiz' | 'recap' | 'search';
const TOOLS: { id: Tool; feature: FeatureKey }[] = [
  { id: 'summary', feature: 'localAi.summary' },
  { id: 'keywords', feature: 'localAi.keywords' },
  { id: 'characters', feature: 'localAi.characters' },
  { id: 'difficulty', feature: 'localAi.readingLevel' },
  { id: 'quiz', feature: 'localAi.quiz' },
  { id: 'recap', feature: 'localAi.recap' },
  { id: 'search', feature: 'localAi.search' },
];

const LocalAiScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { data: novels = [] } = useAsync(() => loadLibraryNovels(), [], false);
  const [novel, setNovel] = useState<LibraryNovel | null>(null);
  const [chapters, setChapters] = useState<{ id: number; name: string; isDownloaded: boolean | null }[]>([]);
  const [chapterId, setChapterId] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [tool, setTool] = useState<Tool>('summary');
  const [pickNovel, setPickNovel] = useState(false);
  const [pickChapter, setPickChapter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recap, setRecap] = useState<{ name: string; lines: string[] }[] | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [quizSeed, setQuizSeed] = useState(0);
  const gate = useEntitlement(TOOLS.find(x => x.id === tool)!.feature);

  const chooseNovel = async (id: number) => {
    setPickNovel(false);
    const n = novels.find(x => x.id === id) ?? null;
    setNovel(n);
    setChapterId(null);
    setText('');
    setRecap(null);
    setHits(null);
    if (n) {
      const list = await novelChaptersLite(n.id);
      setChapters(list);
      const last = [...list].reverse().find(c => !c.unread) ?? list[0];
      if (last) void chooseChapter(n, last.id);
    }
  };

  const chooseChapter = async (n: LibraryNovel, id: number) => {
    setPickChapter(false);
    setChapterId(id);
    setBusy(true);
    setError('');
    setAnswers({});
    try {
      setText(await getChapterText(n, id));
    } catch {
      setText('');
      setError(t('plus.ai.unavailable'));
    } finally {
      setBusy(false);
    }
  };

  const summary = useMemo(() => (text ? summarize(text, 6) : []), [text]);
  const kws = useMemo(() => (text ? keywords(text, 16) : []), [text]);
  const chars = useMemo(() => (text ? characters(text, 15) : []), [text]);
  const diff = useMemo(() => (text ? difficulty(text) : null), [text]);
  const quiz = useMemo<ClozeQuestion[]>(() => {
    if (!text) return [];
    let s = quizSeed + 1;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    return clozeQuiz(text, 5, rand);
  }, [text, quizSeed]);

  const runRecap = async () => {
    if (!novel || !gate.gate()) return;
    setBusy(true);
    try {
      const parts = await lastReadChaptersText(novel, 3);
      setRecap(parts.map(p => ({ name: p.name, lines: summarize(p.text, 3) })));
    } finally {
      setBusy(false);
    }
  };

  const runSearch = async () => {
    if (!novel || !query.trim()) return;
    setBusy(true);
    try {
      setHits(searchText(await downloadedChaptersText(novel), query, 150));
    } finally {
      setBusy(false);
    }
  };

  const openChapter = async (id: number) => {
    if (!novel) return;
    const [chapter, full] = await Promise.all([getChapter(id), getNovelById(novel.id)]);
    if (chapter && full) navigation.navigate('ReaderStack', { screen: 'Chapter', params: { novel: full, chapter } });
  };

  const chapterName = chapters.find(c => c.id === chapterId)?.name;
  const needsChapter = !['recap', 'search'].includes(tool);

  return (
    <Screen title={t('plus.ai.title')} testID="sard-local-ai">
      <Card theme={theme}>
        <View style={styles.head}>
          <MaterialCommunityIcons name="shield-check-outline" size={20} color={theme.primary} />
          <Text style={[styles.cardTitle, { color: theme.onSurface }]}>{t('plus.ai.offlineTitle')}</Text>
        </View>
        <Muted theme={theme}>{t('plus.ai.offlineBody')}</Muted>
      </Card>
      <Row theme={theme} icon="book-outline" title={novel?.name ?? t('common.pickNovel')} desc={t('common.novel')} onPress={() => setPickNovel(true)} testID="sard-ai-pick-novel" />
      {novel ? <Row theme={theme} icon="file-document-outline" title={chapterName ?? t('common.pickChapter')} desc={t('common.chapter')} onPress={() => setPickChapter(true)} testID="sard-ai-pick-chapter" /> : null}

      <ChipsRow>
        {TOOLS.map(x => (
          <Button key={x.id} compact mode={tool === x.id ? 'contained' : 'outlined'} title={tr(FEATURES[x.feature].title)} onPress={() => setTool(x.id)} testID={`sard-ai-tool-${x.id}`} />
        ))}
      </ChipsRow>
      <Muted theme={theme} style={styles.pad}>{tr(FEATURES[TOOLS.find(x => x.id === tool)!.feature].desc)}</Muted>

      <Gated feature={TOOLS.find(x => x.id === tool)!.feature}>
        {!novel ? <Empty theme={theme} icon="brain" text={t('plus.ai.pickFirst')} /> : null}
        {busy ? <Muted theme={theme} style={styles.pad}>{t('common.loading')}</Muted> : null}
        {error && needsChapter ? <Muted theme={theme} style={styles.pad}>{error}</Muted> : null}

        {novel && text && tool === 'summary' ? (
          <Card theme={theme}>
            {summary.map((s, i) => (
              <Text key={i} style={[styles.line, { color: theme.onSurface }]}>{`• ${s}`}</Text>
            ))}
          </Card>
        ) : null}
        {novel && text && tool === 'keywords' ? (
          <View style={styles.wrap}>
            {kws.map(k => (
              <View key={k.word} style={[styles.kw, { backgroundColor: theme.secondaryContainer }]}>
                <Text style={{ color: theme.onSecondaryContainer }}>{`${k.word} · ${num(k.count)}`}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {novel && text && tool === 'characters' ? (
          <Card theme={theme}>
            {!chars.length ? <Muted theme={theme}>{t('plus.ai.noNames')}</Muted> : null}
            {chars.map(c => (
              <View key={c.name} style={styles.charRow}>
                <MaterialCommunityIcons name="account-outline" size={18} color={theme.primary} />
                <Text style={[styles.flex, { color: theme.onSurface }]}>{c.name}</Text>
                <Muted theme={theme}>{t('plus.ai.mentions', { n: num(c.count) })}</Muted>
              </View>
            ))}
          </Card>
        ) : null}
        {novel && text && tool === 'difficulty' && diff ? (
          <>
            <TileRow>
              <StatTile theme={theme} label={t('plus.ai.level')} value={`${num(diff.level)}/${num(5)}`} />
              <StatTile theme={theme} label={t('plus.ai.words')} value={num(diff.words)} />
              <StatTile theme={theme} label={t('plus.ai.sentenceLen')} value={num(diff.avgSentenceWords)} />
            </TileRow>
            <Muted theme={theme} style={styles.pad}>{t(`plus.ai.levelText.${diff.level}` as any)}</Muted>
          </>
        ) : null}
        {novel && text && tool === 'quiz' ? (
          <>
            {!quiz.length ? <Muted theme={theme} style={styles.pad}>{t('plus.ai.quizShort')}</Muted> : null}
            {quiz.map((q, i) => (
              <Card key={i} theme={theme}>
                <Text style={[styles.line, { color: theme.onSurface }]}>{`${num(i + 1)}. ${q.prompt}`}</Text>
                <View style={styles.wrap}>
                  {q.options.map(o => {
                    const chosen = answers[i] === o;
                    const show = answers[i] !== undefined;
                    const color = show && o === q.answer ? theme.primary : chosen ? theme.error : theme.outline;
                    return (
                      <Pressable key={o} disabled={show} onPress={() => setAnswers(a => ({ ...a, [i]: o }))} style={[styles.opt, { borderColor: color }]}>
                        <Text style={{ color: theme.onSurface }}>{o}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            ))}
            {quiz.length ? (
              <View style={styles.pad}>
                <Muted theme={theme}>
                  {t('plus.ai.score', { ok: num(quiz.filter((q, i) => answers[i] === q.answer).length), n: num(quiz.length) })}
                </Muted>
                <Button compact title={t('plus.ai.newQuiz')} onPress={() => { setAnswers({}); setQuizSeed(s => s + 1); }} />
              </View>
            ) : null}
          </>
        ) : null}
        {novel && tool === 'recap' ? (
          <>
            <View style={styles.pad}>
              <Button mode="contained-tonal" icon="history" title={t('plus.ai.runRecap')} onPress={runRecap} testID="sard-ai-recap" />
            </View>
            {recap?.map(r => (
              <Card key={r.name} theme={theme}>
                <Text style={[styles.cardTitle, { color: theme.onSurface }]}>{r.name}</Text>
                {r.lines.map((l, i) => (
                  <Text key={i} style={[styles.line, { color: theme.onSurface }]}>{`• ${l}`}</Text>
                ))}
              </Card>
            ))}
            {recap && !recap.length ? <Muted theme={theme} style={styles.pad}>{t('plus.ai.recapNone')}</Muted> : null}
          </>
        ) : null}
        {novel && tool === 'search' ? (
          <>
            <View style={styles.pad}>
              <TextInput mode="outlined" dense label={t('plus.ai.searchLabel')} value={query} onChangeText={setQuery} onSubmitEditing={runSearch} returnKeyType="search" theme={{ colors: { ...theme } }} testID="sard-ai-search-input" />
              <Muted theme={theme}>{t('plus.ai.searchHelp')}</Muted>
            </View>
            {hits ? <SectionTitle theme={theme}>{t('plus.ai.hits', { n: num(hits.length) })}</SectionTitle> : null}
            {hits?.map((h, i) => (
              <Row key={`${h.chapterId}-${i}`} theme={theme} icon="text-search" title={h.chapterName} desc={h.snippet} onPress={() => openChapter(h.chapterId)} />
            ))}
          </>
        ) : null}
      </Gated>

      <ChoiceDialog
        visible={pickNovel}
        title={t('common.pickNovel')}
        searchable
        choices={novels.map(n => ({ value: n.id, label: n.name }))}
        selected={novel?.id}
        onDismiss={() => setPickNovel(false)}
        onPick={v => void chooseNovel(Number(v))}
        testID="sard-ai-novels"
      />
      <ChoiceDialog
        visible={pickChapter}
        title={t('common.pickChapter')}
        searchable
        choices={chapters.map(c => ({ value: c.id, label: c.name, icon: c.isDownloaded ? 'download-circle-outline' : undefined }))}
        selected={chapterId}
        onDismiss={() => setPickChapter(false)}
        onPick={v => novel && void chooseChapter(novel, Number(v))}
      />
    </Screen>
  );
};

export default LocalAiScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: 16, paddingVertical: 6, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  line: { fontSize: 15, lineHeight: 26, marginVertical: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 8 },
  kw: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  charRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  opt: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
});
