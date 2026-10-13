/** «القراءة» category: reading time & speed, eye comfort, night schedule, page turns, session timer, reader profiles. */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { Button } from '@components';
import { useEntitlement } from '../../membership/service';
import { FEATURES } from '../../membership/features';
import { num, t, tr } from '../../i18n';
import { Muted, Row, Screen, SectionTitle, SwitchRow, TierBadge } from '../ui';
import { ChoiceDialog, Stepper, TextPromptDialog } from '../components/dialogs';
import { plusReaderSettings, profilesStore, wpmStore, type PageSound } from '../store';
import { DEFAULT_WPM } from '../logic/readingTime';
import { parseHm } from '../logic/nightSchedule';
import { applyProfile, deleteProfile, saveCurrentAsProfile } from '../reader/profiles';

const SOUNDS: PageSound[] = ['off', 'paper', 'click', 'chime'];

const ReadingToolsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [s, setS] = plusReaderSettings.use();
  const [wpm] = wpmStore.use();
  const [profiles] = profilesStore.use();
  const [timeDialog, setTimeDialog] = useState<null | 'nightStart' | 'nightEnd'>(null);
  const [soundDialog, setSoundDialog] = useState(false);
  const [nameDialog, setNameDialog] = useState(false);
  const sounds = useEntitlement('reading.pageSounds');
  const profileGate = useEntitlement('reading.readerProfiles', profiles.profiles.length);
  const patch = (p: Partial<typeof s>) => setS({ ...plusReaderSettings.get(), ...p });

  return (
    <Screen title={t('plus.reading.title')} testID="sard-reading-tools">
      <SectionTitle theme={theme}>{t('plus.reader.time')}</SectionTitle>
      <SwitchRow
        icon="timer-sand"
        label={tr(FEATURES['reading.chapterTime'].title)}
        desc={tr(FEATURES['reading.chapterTime'].desc)}
        value={s.showChapterTime}
        feature="reading.chapterTime"
        onChange={v => patch({ showChapterTime: v })}
      />
      <Row
        theme={theme}
        icon="speedometer"
        title={tr(FEATURES['reading.personalWpm'].title)}
        desc={
          wpm
            ? t('plus.reading.wpmLearned', { wpm: num(wpm.wpm), n: num(wpm.samples) })
            : t('plus.reading.wpmDefault', { wpm: num(DEFAULT_WPM.ar) })
        }
        right={
          wpm ? (
            <Button compact title={t('plus.common.reset')} onPress={() => wpmStore.set(undefined)} />
          ) : undefined
        }
      />
      <Row theme={theme} icon="timer-outline" title={tr(FEATURES['reading.sessionTimer'].title)} desc={tr(FEATURES['reading.sessionTimer'].desc)}
        right={
          <Stepper
            testID="sard-session-stepper"
            value={s.sessionMinutes}
            min={0}
            max={120}
            step={5}
            format={v => (v ? t('common.minutes', { n: num(v) }) : t('plus.common.off'))}
            onChange={v => patch({ sessionMinutes: v })}
          />
        }
      />

      <SectionTitle theme={theme}>{t('plus.reader.eyes')}</SectionTitle>
      <SwitchRow
        testID="sard-tools-blue-light"
        icon="weather-night"
        label={tr(FEATURES['reading.blueLight'].title)}
        desc={tr(FEATURES['reading.blueLight'].desc)}
        value={s.blueLight}
        feature="reading.blueLight"
        onChange={v => patch({ blueLight: v })}
      />
      <Row theme={theme} icon="brightness-6" title={t('plus.reader.strength')}
        right={<Stepper value={Math.round(s.blueLightStrength * 100)} min={5} max={60} step={5} format={v => `${num(v)}٪`} onChange={v => patch({ blueLightStrength: v / 100 })} />}
      />
      <SwitchRow
        icon="clock-time-ten-outline"
        label={tr(FEATURES['reading.nightSchedule'].title)}
        desc={tr(FEATURES['reading.nightSchedule'].desc)}
        value={s.nightSchedule}
        feature="reading.nightSchedule"
        onChange={v => patch({ nightSchedule: v })}
      />
      {s.nightSchedule ? (
        <>
          <Row theme={theme} icon="weather-sunset-down" title={t('plus.reading.nightStart')} desc={s.nightStart} onPress={() => setTimeDialog('nightStart')} testID="sard-night-start" />
          <Row theme={theme} icon="weather-sunset-up" title={t('plus.reading.nightEnd')} desc={s.nightEnd} onPress={() => setTimeDialog('nightEnd')} />
          <SwitchRow
            icon="theme-light-dark"
            label={t('plus.reading.nightDark')}
            value={s.nightTheme === 'default-dark'}
            onChange={v => patch({ nightTheme: v ? 'default-dark' : 'none' })}
          />
        </>
      ) : null}

      <SectionTitle theme={theme}>{t('plus.reading.turns')}</SectionTitle>
      <SwitchRow icon="vibrate" label={tr(FEATURES['reading.pageHaptics'].title)} desc={tr(FEATURES['reading.pageHaptics'].desc)} value={s.haptics} feature="reading.pageHaptics" onChange={v => patch({ haptics: v })} />
      <Row
        theme={theme}
        icon="volume-high"
        title={tr(FEATURES['reading.pageSounds'].title)}
        desc={t(`plus.sound.${sounds.allowed ? s.sound : 'off'}` as any)}
        onPress={() => (sounds.gate() ? setSoundDialog(true) : undefined)}
        right={!sounds.allowed ? <TierBadge tier={sounds.requiredTier} small /> : undefined}
        testID="sard-sound-row"
      />
      {sounds.allowed && s.sound !== 'off' ? (
        <Row theme={theme} icon="volume-medium" title={t('plus.reading.volume')}
          right={<Stepper value={Math.round(s.soundVolume * 100)} min={10} max={100} step={10} format={v => `${num(v)}٪`} onChange={v => patch({ soundVolume: v / 100 })} />}
        />
      ) : null}

      <SectionTitle theme={theme}>{t('plus.profiles.title')}</SectionTitle>
      <Muted theme={theme} style={styles.pad}>
        {t('plus.profiles.help', { n: num(profileGate.limit ?? 0) })}
      </Muted>
      {profiles.profiles.map(p => {
        const novels = Object.values(profiles.bindings).filter(v => v === p.id).length;
        return (
          <Row
            key={p.id}
            theme={theme}
            icon="account-cog-outline"
            title={p.name}
            desc={t('plus.profiles.bound', { n: num(novels) })}
            onPress={() => {
              applyProfile(p);
              showToast(t('plus.profiles.applied', { name: p.name }));
            }}
            right={<Button compact title={t('common.delete')} onPress={() => deleteProfile(p.id)} />}
          />
        );
      })}
      <View style={styles.pad}>
        <Button
          testID="sard-profile-new"
          mode="contained-tonal"
          icon="content-save-outline"
          title={t('plus.profiles.saveCurrent')}
          onPress={() => profileGate.gate(profiles.profiles.length) && setNameDialog(true)}
        />
      </View>

      <SectionTitle theme={theme}>{t('plus.reading.notebooks')}</SectionTitle>
      <Row theme={theme} icon="bookmark-multiple-outline" title={tr(FEATURES['reading.bookmarks'].title)} desc={tr(FEATURES['reading.bookmarks'].desc)} onPress={() => navigation.navigate('MoreStack', { screen: 'SardBookmarks' })} testID="sard-open-bookmarks" />
      <Row theme={theme} icon="alphabetical-variant" title={tr(FEATURES['reading.vocabulary'].title)} desc={tr(FEATURES['reading.vocabulary'].desc)} onPress={() => navigation.navigate('MoreStack', { screen: 'SardVocabulary' })} testID="sard-open-vocab" />
      <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>{t('plus.reader.vocabHint')}</Text>

      <TextPromptDialog
        visible={!!timeDialog}
        title={timeDialog === 'nightEnd' ? t('plus.reading.nightEnd') : t('plus.reading.nightStart')}
        label="HH:MM"
        initial={timeDialog ? s[timeDialog] : ''}
        keyboardType="number-pad"
        onDismiss={() => setTimeDialog(null)}
        onSubmit={v => {
          const clean = v.trim().replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/^(\d{1,2})(\d{2})$/, '$1:$2');
          if (parseHm(clean) === null) {
            showToast(t('plus.reading.badTime'));
            return;
          }
          const [h, m] = clean.split(':');
          if (timeDialog) patch({ [timeDialog]: `${h.padStart(2, '0')}:${m}` } as any);
          setTimeDialog(null);
        }}
      />
      <ChoiceDialog
        visible={soundDialog}
        title={tr(FEATURES['reading.pageSounds'].title)}
        choices={SOUNDS.map(v => ({ value: v, label: t(`plus.sound.${v}` as any) }))}
        selected={s.sound}
        onDismiss={() => setSoundDialog(false)}
        onPick={v => {
          patch({ sound: v });
          setSoundDialog(false);
        }}
      />
      <TextPromptDialog
        visible={nameDialog}
        title={t('plus.profiles.saveCurrent')}
        label={t('plus.profiles.name')}
        onDismiss={() => setNameDialog(false)}
        onSubmit={v => {
          const p = saveCurrentAsProfile(v);
          setNameDialog(false);
          showToast(t('plus.profiles.saved', { name: p.name }));
        }}
      />
    </Screen>
  );
};

export default ReadingToolsScreen;

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingVertical: 6 },
  hint: { fontSize: 12, paddingHorizontal: 16, lineHeight: 18 },
});
