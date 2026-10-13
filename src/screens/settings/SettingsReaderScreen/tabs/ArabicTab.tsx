import React from 'react';
import { StyleSheet } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import {
  ArabicTextSection,
  AutoScrollSection,
  FocusSection,
  HighlightsSection,
  ResetSardReaderItem,
  TypographySection,
} from '../../../../sard/reader/components/SardReaderSections';

/** Sard: Arabic-first reader settings (same sections as the reader sheet). */
const ArabicTab: React.FC = () => (
  <BottomSheetScrollView
    style={styles.container}
    showsVerticalScrollIndicator={false}
    contentContainerStyle={styles.contentContainer}
  >
    <ArabicTextSection />
    <TypographySection />
    <FocusSection />
    <AutoScrollSection />
    <HighlightsSection />
    <ResetSardReaderItem />
  </BottomSheetScrollView>
);

export default ArabicTab;

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { paddingBottom: 24 },
});
