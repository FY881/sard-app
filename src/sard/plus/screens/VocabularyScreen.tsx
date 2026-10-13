/** «دفتر المفردات»: saved words with sentence and meaning, plus Leitner review cards (Plus). */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { useEntitlement } from '../../membership/service';
import { num, t } from '../../i18n';
import { Card, Empty, Muted, ProgressBar, Screen, StatTile, TierBadge, TileRow } from '../ui';
import { TextPromptDialog } from '../components/dialogs';
import { useAsync } from '../hooks';
import { addVocab, deleteVocab, dueVocab, listVocab, reviewVocab, updateVocab, type SardVocabRow } from '../db';
import { MAX_BOX } from '../logic/vocab';

const VocabularyScreen = () => {
  const theme = useTheme();
  const review = useEntitlement('reading.vocabReview');
  const { data, reload } = useAsync(async () => ({ all: await listVocab(), due: await dueVocab() }), []);
  const [editing, setEditing] = useState<SardVocabRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [session, setSession] = useState<SardVocabRow[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);

  const all = data?.all ?? [];
  const due = data?.due ?? [];
  const mastered = all.filter(v => v.box >= MAX_BOX).length;
  const card = session?.[0];

  const answer = async (correct: boolean) => {
    if (!card) return;
    await reviewVocab(card, correct);
    setDone(d => d + 1);
    setRevealed(false);
    const rest = session!.slice(1);
    setSession(rest.length ? rest : null);
    if (!rest.length) {
      showToast(t('plus.vocab.reviewDone', { n: num(done + 1) }));
      reload();
    }
  };

  return (
    <Screen title={t('plus.vocab.title')} testID="sard-vocabulary">
      <TileRow>
        <StatTile theme={theme} icon="alphabetical-variant" label={t('plus.vocab.words')} value={num(all.length)} />
        <StatTile theme={theme} icon="cards-outline" label={t('plus.vocab.due')} value={num(due.length)} />
        <StatTile theme={theme} icon="school-outline" label={t('plus.vocab.mastered')} value={num(mastered)} />
      </TileRow>

      {card ? (
        <Card theme={theme} style={styles.flash}>
          <Muted theme={theme}>{t('plus.vocab.box', { n: num(card.box), max: num(MAX_BOX) })}</Muted>
          <Text style={[styles.word, { color: theme.onSurface }]}>{card.word}</Text>
          {card.sentence ? <Text style={[styles.sentence, { color: theme.onSurfaceVariant }]}>{card.sentence}</Text> : null}
          {revealed ? (
            <>
              <Text style={[styles.meaning, { color: theme.primary }]}>{card.meaning || t('plus.vocab.noMeaning')}</Text>
              <View style={styles.row}>
                <Button testID="sard-vocab-wrong" mode="outlined" title={t('plus.vocab.again')} onPress={() => answer(false)} />
                <Button testID="sard-vocab-right" mode="contained" title={t('plus.vocab.knew')} onPress={() => answer(true)} />
              </View>
            </>
          ) : (
            <Button testID="sard-vocab-reveal" mode="contained-tonal" title={t('plus.vocab.reveal')} onPress={() => setRevealed(true)} />
          )}
          <ProgressBar theme={theme} value={done / Math.max(1, done + (session?.length ?? 0))} />
        </Card>
      ) : (
        <View style={styles.pad}>
          <View style={styles.row}>
            <Button
              testID="sard-vocab-start-review"
              mode="contained"
              icon="cards-outline"
              disabled={!due.length && review.allowed}
              title={t('plus.vocab.startReview', { n: num(due.length) })}
              onPress={() => {
                if (!review.gate()) return;
                setDone(0);
                setRevealed(false);
                setSession(due);
              }}
            />
            {!review.allowed ? <TierBadge tier={review.requiredTier} small /> : null}
          </View>
          <Button testID="sard-vocab-add" mode="outlined" icon="plus" title={t('plus.vocab.add')} onPress={() => setAdding(true)} />
        </View>
      )}

      {!all.length ? <Empty theme={theme} icon="alphabetical-variant" text={t('plus.vocab.empty')} /> : null}
      {all.map(v => (
        <Card key={v.id} theme={theme}>
          <View style={styles.head}>
            <Text style={[styles.listWord, { color: theme.onSurface }]}>{v.word}</Text>
            <Muted theme={theme}>{v.box >= MAX_BOX ? t('plus.vocab.masteredOne') : t('plus.vocab.box', { n: num(v.box), max: num(MAX_BOX) })}</Muted>
          </View>
          {v.meaning ? <Text style={{ color: theme.primary, marginTop: 4 }}>{v.meaning}</Text> : null}
          {v.sentence ? <Muted theme={theme} numberOfLines={3}>{v.sentence}</Muted> : null}
          {v.novelName ? <Muted theme={theme}>{v.novelName}</Muted> : null}
          <View style={styles.actions}>
            <Button compact title={v.meaning ? t('plus.vocab.editMeaning') : t('plus.vocab.addMeaning')} onPress={() => setEditing(v)} />
            <Button compact title={t('common.copy')} onPress={() => Clipboard.setStringAsync(`${v.word}${v.meaning ? ' — ' + v.meaning : ''}`).then(() => showToast(t('common.copied')))} />
            <Button compact textColor={theme.error} title={t('common.delete')} onPress={() => deleteVocab(v.id).then(reload)} />
          </View>
        </Card>
      ))}

      <TextPromptDialog
        visible={!!editing}
        title={t('plus.vocab.editMeaning')}
        label={editing?.word}
        initial={editing?.meaning ?? ''}
        multiline
        onDismiss={() => setEditing(null)}
        onSubmit={async val => {
          if (editing) await updateVocab(editing.id, { meaning: val });
          setEditing(null);
          reload();
        }}
      />
      <TextPromptDialog
        visible={adding}
        title={t('plus.vocab.add')}
        label={t('plus.vocab.wordLabel')}
        testID="sard-vocab-add-dialog"
        onDismiss={() => setAdding(false)}
        onSubmit={async val => {
          setAdding(false);
          if (!val.trim()) return;
          const r = await addVocab({ word: val });
          showToast(r.existed ? t('plus.reader.vocabExists', { word: val }) : t('plus.reader.vocabSaved', { word: val }));
          reload();
        }}
      />
    </Screen>
  );
};

export default VocabularyScreen;

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  flash: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  word: { fontSize: 30, fontWeight: '700' },
  sentence: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
  meaning: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listWord: { fontSize: 18, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 4, marginTop: 6, flexWrap: 'wrap' },
});
