/**
 * «سَرد+» tab of the reader bottom sheet: time left, bookmarks with notes for
 * this chapter, reader profile for this novel, blue-light filter, page-turn
 * haptics and sounds, and the vocabulary hint.
 */
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { useChapterContext } from '../../ChapterContext';
import { addBookmark, chapterBookmarks, deleteBookmark, type SardBookmarkRow } from '../../../../sard/plus/db';
import { plusReaderSettings, profilesStore, wpmStore, type PageSound, useMmkvState } from '../../../../sard/plus/store';
import { useReaderSession } from '../../../../sard/plus/readerSession';
import { requestReaderExcerpt } from '../../../../sard/plus/reader/usePlusReader';
import { applyProfile, bindNovelProfile, saveCurrentAsProfile } from '../../../../sard/plus/reader/profiles';
import { DEFAULT_WPM } from '../../../../sard/plus/logic/readingTime';
import { Stepper } from '../../../../sard/plus/components/dialogs';
import { SectionTitle, SwitchRow, TierBadge } from '../../../../sard/plus/ui';
import { useEntitlement } from '../../../../sard/membership/service';
import { num, t } from '../../../../sard/i18n';

const SOUNDS: PageSound[] = ['off', 'paper', 'click', 'chime'];

const Chip = ({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) => {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? theme.primary : theme.outline, backgroundColor: selected ? theme.secondaryContainer : 'transparent' },
      ]}
    >
      <Text style={{ color: selected ? theme.onSecondaryContainer : theme.onSurface, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
};

const SardPlusTab: React.FC = () => {
  const theme = useTheme();
  const { novel, chapter, webViewRef } = useChapterContext();
  const session = useReaderSession();
  const [settings, setSettings] = useMmkvState(plusReaderSettings);
  const [profiles] = useMmkvState(profilesStore);
  const [wpm] = useMmkvState(wpmStore);
  const [marks, setMarks] = useState<SardBookmarkRow[]>([]);
  const [note, setNote] = useState('');
  const sounds = useEntitlement('reading.pageSounds');
  const profileGate = useEntitlement('reading.readerProfiles', profiles.profiles.length);

  const chapterId = chapter?.id;
  const reload = useCallback(() => {
    if (chapterId == null) {
      setMarks([]);
      return;
    }
    chapterBookmarks(chapterId).then(setMarks).catch(() => setMarks([]));
  }, [chapterId]);
  useEffect(reload, [reload]);

  const patch = (p: Partial<typeof settings>) => setSettings({ ...plusReaderSettings.get(), ...p });

  const words = chapterId != null && session.chapterId === chapterId ? session.words : 0;
  const speed = wpm?.wpm ?? DEFAULT_WPM.ar;
  const left = Math.max(0, Math.ceil((words * (1 - session.progress)) / speed));

  const addHere = async () => {
    const ex = await requestReaderExcerpt();
    await addBookmark({
      novelId: novel.id,
      chapterId: chapter.id,
      novelName: novel.name,
      chapterName: chapter.name,
      progress: ex.progress || session.progress,
      excerpt: ex.text,
      note,
    });
    setNote('');
    showToast(t('plus.bookmarks.added'));
    reload();
  };

  const jump = (p: number) =>
    webViewRef.current?.injectJavaScript(`try{window.sardPlus&&sardPlus.jump(${Number(p) || 0})}catch(e){};true;`);

  const bound = novel ? profiles.bindings[String(novel.id)] : undefined;

  if (!novel || !chapter) {
    // Rendered without a chapter (should not happen once the sheet bridges the
    // context) - show nothing rather than crash the reader.
    return <View testID="sard-plus-reader-tab" />;
  }

  return (
    <Suspense fallback={<></>}>
      <BottomSheetScrollView contentContainerStyle={styles.content} testID="sard-plus-reader-tab">
        <SectionTitle theme={theme}>{t('plus.reader.time')}</SectionTitle>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          {words
            ? t('plus.reader.timeLeft', { min: num(left), words: num(words), wpm: num(speed) })
            : t('plus.reader.timeUnknown')}
        </Text>

        <SectionTitle theme={theme}>{t('plus.bookmarks.title')}</SectionTitle>
        <View style={styles.noteRow}>
          <BottomSheetTextInput
            testID="sard-bookmark-note"
            value={note}
            onChangeText={setNote}
            placeholder={t('plus.bookmarks.notePlaceholder')}
            placeholderTextColor={theme.onSurfaceVariant}
            style={[styles.input, { color: theme.onSurface, borderColor: theme.outline }]}
          />
          <Button testID="sard-bookmark-add" mode="contained-tonal" icon="bookmark-plus-outline" title={t('plus.bookmarks.addHere')} onPress={addHere} />
        </View>
        {marks.map(b => (
          <View key={b.id} style={styles.markRow}>
            <Pressable style={styles.flex} onPress={() => jump(b.progress)}>
              <Text style={{ color: theme.onSurface }} numberOfLines={1}>
                {`${num(Math.round(b.progress * 100))}٪ · ${b.note || b.excerpt || t('plus.bookmarks.noNote')}`}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t('common.delete')}
              onPress={() => deleteBookmark(b.id).then(reload)}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="delete-outline" size={20} color={theme.onSurfaceVariant} />
            </Pressable>
          </View>
        ))}

        <SectionTitle theme={theme}>{t('plus.profiles.title')}</SectionTitle>
        <View style={styles.chips}>
          <Chip label={t('plus.profiles.none')} selected={!bound} onPress={() => bindNovelProfile(novel.id, null)} />
          {profiles.profiles.map(p => (
            <Chip
              key={p.id}
              label={p.name}
              selected={bound === p.id}
              onPress={() => {
                bindNovelProfile(novel.id, p.id);
                applyProfile(p);
                showToast(t('plus.profiles.appliedReopen'));
              }}
            />
          ))}
          <Chip
            testID="sard-profile-save"
            label={t('plus.profiles.saveCurrent')}
            selected={false}
            onPress={() => {
              if (!profileGate.gate(profiles.profiles.length)) return;
              const p = saveCurrentAsProfile(novel.name);
              bindNovelProfile(novel.id, p.id);
              showToast(t('plus.profiles.saved', { name: p.name }));
            }}
          />
        </View>

        <SectionTitle theme={theme}>{t('plus.reader.eyes')}</SectionTitle>
        <SwitchRow
          testID="sard-blue-light-toggle"
          icon="weather-night"
          label={t('plus.reader.blueLight')}
          value={settings.blueLight}
          feature="reading.blueLight"
          onChange={v => patch({ blueLight: v })}
        />
        {settings.blueLight ? (
          <View style={styles.stepRow}>
            <Text style={{ color: theme.onSurfaceVariant }}>{t('plus.reader.strength')}</Text>
            <Stepper
              value={Math.round(settings.blueLightStrength * 100)}
              min={5}
              max={60}
              step={5}
              format={v => `${num(v)}٪`}
              onChange={v => patch({ blueLightStrength: v / 100 })}
            />
          </View>
        ) : null}
        <SwitchRow icon="vibrate" label={t('plus.reader.haptics')} value={settings.haptics} feature="reading.pageHaptics" onChange={v => patch({ haptics: v })} />
        <View style={styles.soundHead}>
          <Text style={[styles.body, { color: theme.onSurface }]}>{t('plus.reader.sound')}</Text>
          {!sounds.allowed ? <TierBadge tier={sounds.requiredTier} small /> : null}
        </View>
        <View style={styles.chips}>
          {SOUNDS.map(s => (
            <Chip
              key={s}
              label={t(`plus.sound.${s}` as any)}
              selected={(sounds.allowed ? settings.sound : 'off') === s}
              onPress={() => {
                if (s !== 'off' && !sounds.gate()) return;
                patch({ sound: s });
              }}
            />
          ))}
        </View>

        <View style={[styles.hint, { backgroundColor: theme.surfaceVariant }]}>
          <MaterialCommunityIcons name="alphabetical-variant" size={18} color={theme.primary} />
          <Text style={[styles.hintText, { color: theme.onSurfaceVariant }]}>{t('plus.reader.vocabHint')}</Text>
        </View>
      </BottomSheetScrollView>
    </Suspense>
  );
};

export default React.memo(SardPlusTab);

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  flex: { flex: 1 },
  body: { fontSize: 14, paddingHorizontal: 16, lineHeight: 22 },
  noteRow: { paddingHorizontal: 16, gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  soundHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  hint: { flexDirection: 'row', gap: 8, margin: 16, padding: 12, borderRadius: 12, alignItems: 'center' },
  hintText: { flex: 1, fontSize: 13, lineHeight: 20 },
});
