import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { navigationRef } from '@navigators/ShareIntentHandler';

import { List } from '@components';
import {
  useChapterGeneralSettings,
  useChapterReaderSettings,
  useTheme,
} from '@hooks/persisted';
import ReaderSheetPreferenceItem from '@screens/reader/components/ReaderBottomSheet/ReaderSheetPreferenceItem';

import { SARD_READER_STRINGS as S } from '../strings';
import { useSardReaderSettings, type HighlightColor } from '../settings';
import { availableWeights, findArabicFont } from '../fonts';
import { ChipRow, SectionNote, SliderRow } from './SettingRows';
import { ColorDots } from './HighlightEditorDialog';

/**
 * Sard reader preference sections, shared by the reader bottom sheet and the
 * reader settings screen. Every change is live (pushed into the WebView).
 */

export const ArabicTextSection: React.FC = () => {
  const theme = useTheme();
  const s = useSardReaderSettings();
  const { textAlign, setChapterReaderSettings } = useChapterReaderSettings();
  return (
    <View>
      <List.SubHeader theme={theme}>{S.arabicSection}</List.SubHeader>
      <ChipRow
        label={S.tashkeel}
        value={s.tashkeel}
        onChange={tashkeel => s.setSardReaderSettings({ tashkeel })}
        description={S.tashkeelDesc}
        options={[
          { value: 'show', label: S.tashkeelShow },
          { value: 'hide', label: S.tashkeelHide },
          { value: 'keepShadda', label: S.tashkeelKeepShadda },
        ]}
      />
      <ReaderSheetPreferenceItem
        label={S.stripTatweel}
        description={S.stripTatweelDesc}
        value={s.stripTatweel}
        onPress={() => s.setSardReaderSettings({ stripTatweel: !s.stripTatweel })}
        theme={theme}
      />
      <ChipRow
        label={S.direction}
        value={s.direction}
        onChange={direction => s.setSardReaderSettings({ direction })}
        description={S.directionDesc}
        options={[
          { value: 'auto', label: S.directionAuto },
          { value: 'rtl', label: S.directionRtl },
          { value: 'ltr', label: S.directionLtr },
          { value: 'source', label: S.directionSource },
        ]}
      />
      <ChipRow
        label={S.digits}
        value={s.digits}
        onChange={digits => s.setSardReaderSettings({ digits })}
        options={[
          { value: 'default', label: S.digitsDefault },
          { value: 'arabicIndic', label: S.digitsArabic },
          { value: 'western', label: S.digitsWestern },
        ]}
      />
      <ReaderSheetPreferenceItem
        label={S.kashida}
        description={S.kashidaDesc}
        value={s.kashida}
        onPress={() => {
          const next = !s.kashida;
          s.setSardReaderSettings({ kashida: next });
          // Turning the Arabic justification on implies justified text.
          if (next && textAlign !== 'justify') {
            setChapterReaderSettings({ textAlign: 'justify' });
          }
        }}
        theme={theme}
      />
    </View>
  );
};

export const TypographySection: React.FC = () => {
  const theme = useTheme();
  const s = useSardReaderSettings();
  const { fontFamily } = useChapterReaderSettings();
  const weights = availableWeights(fontFamily);
  const font = findArabicFont(fontFamily);
  return (
    <View>
      <List.SubHeader theme={theme}>{S.typographySection}</List.SubHeader>
      <ChipRow
        label={S.fontWeight}
        value={weights.includes(s.fontWeight) ? s.fontWeight : 0}
        onChange={fontWeight => s.setSardReaderSettings({ fontWeight })}
        options={[
          { value: 0, label: S.fontWeightDefault },
          ...weights.map(w => ({
            value: w,
            label: S.weightNames[w] ?? String(w),
            fontFamily: font ? fontFamily : undefined,
          })),
        ]}
      />
      <ReaderSheetPreferenceItem
        label={S.autoLineHeight}
        description={S.autoLineHeightDesc}
        value={s.autoLineHeight}
        onPress={() => s.setSardReaderSettings({ autoLineHeight: !s.autoLineHeight })}
        theme={theme}
      />
      <SliderRow
        label={S.wordSpacing}
        value={s.wordSpacing}
        min={0}
        max={0.6}
        step={0.05}
        format={v => (v === 0 ? S.defaultValue : `${v.toFixed(2)}em`)}
        onChange={wordSpacing => s.setSardReaderSettings({ wordSpacing })}
      />
      <SliderRow
        label={S.paragraphSpacing}
        value={s.paragraphSpacing ?? -0.25}
        min={-0.25}
        max={3}
        step={0.25}
        format={v => (v < 0 ? S.defaultValue : `${v.toFixed(2)}em`)}
        onChange={v => s.setSardReaderSettings({ paragraphSpacing: v < 0 ? null : v })}
      />
      <SliderRow
        label={S.textIndent}
        value={s.textIndent}
        min={0}
        max={4}
        step={0.5}
        format={v => (v === 0 ? S.defaultValue : `${v.toFixed(1)}em`)}
        onChange={textIndent => s.setSardReaderSettings({ textIndent })}
      />
    </View>
  );
};

export const FocusSection: React.FC = () => {
  const theme = useTheme();
  const s = useSardReaderSettings();
  return (
    <View>
      <List.SubHeader theme={theme}>{S.focusSection}</List.SubHeader>
      <ChipRow
        label={S.focusMode}
        value={s.focusMode}
        onChange={focusMode => s.setSardReaderSettings({ focusMode })}
        description={S.focusDesc}
        options={[
          { value: 'off', label: S.focusOff },
          { value: 'ruler', label: S.focusRuler },
          { value: 'line', label: S.focusLine },
          { value: 'paragraph', label: S.focusParagraph },
        ]}
      />
      {s.focusMode !== 'off' ? (
        <>
          {s.focusMode !== 'paragraph' ? (
            <SliderRow
              label={S.focusLines}
              value={s.focusLines}
              min={1}
              max={8}
              step={1}
              showStops
              format={v => String(Math.round(v))}
              onChange={focusLines => s.setSardReaderSettings({ focusLines })}
            />
          ) : null}
          {s.focusMode !== 'line' ? (
            <SliderRow
              label={S.focusDim}
              value={s.focusDim}
              min={0.1}
              max={0.9}
              step={0.05}
              format={v => `${Math.round(v * 100)}%`}
              onChange={focusDim => s.setSardReaderSettings({ focusDim })}
            />
          ) : null}
          <SliderRow
            label={S.focusPosition}
            value={s.focusPosition}
            min={0.08}
            max={0.92}
            step={0.01}
            format={v => `${Math.round(v * 100)}%`}
            onChange={focusPosition => s.setSardReaderSettings({ focusPosition })}
          />
        </>
      ) : null}
    </View>
  );
};

export const AutoScrollSection: React.FC = () => {
  const theme = useTheme();
  const s = useSardReaderSettings();
  const { autoScroll, pageReader, setChapterGeneralSettings } =
    useChapterGeneralSettings();
  return (
    <View>
      <List.SubHeader theme={theme}>{S.autoScrollSection}</List.SubHeader>
      <ReaderSheetPreferenceItem
        label={S.autoScrollSection}
        value={autoScroll}
        onPress={() => setChapterGeneralSettings({ autoScroll: !autoScroll })}
        theme={theme}
      />
      <ChipRow
        label={S.autoScrollMode}
        value={s.autoScrollMode}
        onChange={autoScrollMode => s.setSardReaderSettings({ autoScrollMode })}
        options={[
          { value: 'smooth', label: S.autoScrollSmooth },
          { value: 'page', label: S.autoScrollPage },
        ]}
      />
      {s.autoScrollMode === 'smooth' ? (
        <>
          {pageReader ? <SectionNote>{S.autoScrollPageOnlyNote}</SectionNote> : null}
          <SliderRow
            label={S.autoScrollSpeed}
            value={s.autoScrollSpeed}
            min={5}
            max={200}
            step={5}
            format={v => `${Math.round(v)} ${S.autoScrollSpeedUnit}`}
            onChange={autoScrollSpeed => s.setSardReaderSettings({ autoScrollSpeed })}
          />
          <ReaderSheetPreferenceItem
            label={S.autoScrollNext}
            value={s.autoScrollNextChapter}
            onPress={() =>
              s.setSardReaderSettings({ autoScrollNextChapter: !s.autoScrollNextChapter })
            }
            theme={theme}
          />
          <ReaderSheetPreferenceItem
            label={S.autoScrollPauseOnTouch}
            value={s.autoScrollPauseOnTouch}
            onPress={() =>
              s.setSardReaderSettings({ autoScrollPauseOnTouch: !s.autoScrollPauseOnTouch })
            }
            theme={theme}
          />
        </>
      ) : null}
    </View>
  );
};

export const HighlightsSection: React.FC<{ novelId?: number }> = ({ novelId }) => {
  const theme = useTheme();
  const s = useSardReaderSettings();
  // The reader bottom sheet renders through a portal outside the
  // NavigationContainer, so useNavigation() throws there. Fall back to
  // the global container ref.
  const ctxNavigation = React.useContext(NavigationContext) as any;
  const openHighlights = () => {
    const params = novelId ? { novelId } : undefined;
    if (ctxNavigation) {
      ctxNavigation.navigate('SardHighlights', params);
    } else if (navigationRef.isReady()) {
      (navigationRef as any).navigate('SardHighlights', params);
    }
  };
  return (
    <View>
      <List.SubHeader theme={theme}>{S.highlightsSection}</List.SubHeader>
      <ReaderSheetPreferenceItem
        label={S.highlightsEnabled}
        value={s.highlightsEnabled}
        onPress={() => s.setSardReaderSettings({ highlightsEnabled: !s.highlightsEnabled })}
        theme={theme}
      />
      <View style={styles.colorBlock}>
        <Text style={{ color: theme.onSurfaceVariant }}>{S.defaultColor}</Text>
        <ColorDots
          value={s.defaultHighlightColor}
          onChange={(defaultHighlightColor: HighlightColor) =>
            s.setSardReaderSettings({ defaultHighlightColor })
          }
          dark={!!theme.isDark}
          size={30}
        />
      </View>
      <List.Item
        title={S.highlights}
        description={novelId ? S.thisNovel : S.allNovels}
        right="chevron-right"
        onPress={openHighlights}
        theme={theme}
      />
    </View>
  );
};

export const ResetSardReaderItem: React.FC = () => {
  const theme = useTheme();
  const s = useSardReaderSettings();
  return <List.Item title={S.resetArabic} icon="restore" onPress={s.reset} theme={theme} />;
};

const styles = StyleSheet.create({
  colorBlock: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
