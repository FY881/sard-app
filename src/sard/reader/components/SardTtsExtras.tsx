import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';

import { List, SelectableChip } from '@components';
import { useTheme } from '@hooks/persisted';
import type { ChapterReaderSettings } from '@hooks/persisted/useSettings';
import type { TtsVoice } from '@modules/nitro-tts';
import ReaderSheetPreferenceItem from '@screens/reader/components/ReaderBottomSheet/ReaderSheetPreferenceItem';

import { SARD_READER_STRINGS as S } from '../strings';
import { useSardReaderSettings } from '../settings';
import { RATE_PRESETS, sortArabicVoices } from '../voices';
import {
  cancelSleep,
  extendSleep,
  formatRemaining,
  startSleepChapters,
  startSleepMinutes,
  useSleepTimer,
} from '../ttsSleep';

type TtsValue = ChapterReaderSettings['tts'];

const SLEEP_MINUTES = [10, 15, 30, 45, 60, 90];
const SLEEP_CHAPTERS = [1, 2, 3, 5];

/**
 * Sard additions to LNReader's TTS tab: speed presets, voice test, Arabic
 * voice preference + quick picks, and the sleep timer (minutes or chapters).
 * Auto-next chapter, rate, pitch, engine and voice already exist upstream.
 */
const SardTtsExtras: React.FC<{
  tts: TtsValue;
  voices: TtsVoice[];
  setTts: (next: Partial<NonNullable<TtsValue>>) => void;
}> = ({ tts, voices, setTts }) => {
  const theme = useTheme();
  const sard = useSardReaderSettings();
  const { state: sleep, remainingMs } = useSleepTimer();
  const arabicVoices = useMemo(() => sortArabicVoices(voices), [voices]);

  const sleepValue =
    sleep.mode === 'minutes'
      ? `m${sleep.minutes}`
      : sleep.mode === 'chapters'
        ? `c${sleep.chaptersLeft}`
        : 'off';

  const testVoice = () => {
    Speech.stop();
    const voice = tts?.voice ?? arabicVoices[0];
    Speech.speak(S.voiceSample, {
      language: voice?.language ?? 'ar',
      voice: voice?.identifier,
      rate: tts?.rate ?? 1,
      pitch: tts?.pitch ?? 1,
    });
  };

  return (
    <View>
      <List.SubHeader theme={theme}>{S.ratePresets}</List.SubHeader>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {RATE_PRESETS.map(r => (
          <SelectableChip
            key={r}
            label={`${r}x`}
            selected={Math.abs((tts?.rate ?? 1) - r) < 0.01}
            theme={theme}
            onPress={() => setTts({ rate: r })}
          />
        ))}
      </ScrollView>
      <List.Item
        title={S.resetRatePitch}
        icon="restore"
        onPress={() => setTts({ rate: 1, pitch: 1 })}
        theme={theme}
      />
      <List.Item title={S.testVoice} icon="account-voice" onPress={testVoice} theme={theme} />

      <ReaderSheetPreferenceItem
        label={S.preferArabicVoice}
        description={arabicVoices.length ? S.preferArabicVoiceDesc : S.noArabicVoices}
        value={sard.ttsPreferArabicVoice}
        onPress={() =>
          sard.setSardReaderSettings({ ttsPreferArabicVoice: !sard.ttsPreferArabicVoice })
        }
        theme={theme}
      />
      {arabicVoices.length ? (
        <>
          <List.SubHeader theme={theme}>{S.arabicVoices}</List.SubHeader>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {arabicVoices.slice(0, 16).map(v => (
              <SelectableChip
                key={v.identifier}
                label={`${v.name}${v.language ? ` · ${v.language}` : ''}`}
                selected={tts?.voice?.identifier === v.identifier}
                theme={theme}
                onPress={() => setTts({ voice: v })}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      <List.SubHeader theme={theme}>{S.sleepTimer}</List.SubHeader>
      {sleep.mode !== 'off' ? (
        <Text style={[styles.status, { color: theme.primary }]}>
          {sleep.mode === 'minutes'
            ? S.sleepRemaining(formatRemaining(remainingMs))
            : S.sleepAfterChapters(sleep.chaptersLeft)}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <SelectableChip
          label={S.sleepOff}
          selected={sleepValue === 'off'}
          theme={theme}
          onPress={cancelSleep}
        />
        {SLEEP_MINUTES.map(m => (
          <SelectableChip
            key={`m${m}`}
            label={S.sleepMinutes(m)}
            selected={sleepValue === `m${m}`}
            theme={theme}
            onPress={() => {
              startSleepMinutes(m, sard.ttsSleepFinishParagraph);
              sard.setSardReaderSettings({ ttsSleepDefaultMinutes: m });
            }}
          />
        ))}
        {SLEEP_CHAPTERS.map(c => (
          <SelectableChip
            key={`c${c}`}
            label={c === 1 ? S.sleepEndOfChapter : S.sleepChapters(c)}
            selected={sleepValue === `c${c}`}
            theme={theme}
            onPress={() => startSleepChapters(c)}
          />
        ))}
      </ScrollView>
      {sleep.mode !== 'off' ? (
        <View style={styles.actions}>
          <SelectableChip
            label={S.sleepExtend}
            selected={false}
            showCheckIcon={false}
            theme={theme}
            onPress={() => extendSleep(10)}
          />
          <SelectableChip
            label={S.sleepCancel}
            selected={false}
            showCheckIcon={false}
            theme={theme}
            onPress={cancelSleep}
          />
        </View>
      ) : null}
      <ReaderSheetPreferenceItem
        label={S.sleepFinishParagraph}
        value={sard.ttsSleepFinishParagraph}
        onPress={() =>
          sard.setSardReaderSettings({ ttsSleepFinishParagraph: !sard.ttsSleepFinishParagraph })
        }
        theme={theme}
      />
    </View>
  );
};

export default SardTtsExtras;

const styles = StyleSheet.create({
  row: {
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  status: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    paddingBottom: 4,
    paddingHorizontal: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
});
