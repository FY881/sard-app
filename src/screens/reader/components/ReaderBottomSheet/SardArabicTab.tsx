import React, { Suspense } from 'react';
import { StyleSheet } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { useChapterContext } from '../../ChapterContext';
import {
  ArabicTextSection,
  AutoScrollSection,
  FocusSection,
  HighlightsSection,
  ResetSardReaderItem,
  TypographySection,
} from '../../../../sard/reader/components/SardReaderSections';

/** Sard «العربية» tab of the reader bottom sheet. */
const SardArabicTab: React.FC = () => {
  const { novel } = useChapterContext();
  return (
    <Suspense fallback={<></>}>
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <ArabicTextSection />
        <TypographySection />
        <FocusSection />
        <AutoScrollSection />
        <HighlightsSection novelId={novel?.id} />
        <ResetSardReaderItem />
      </BottomSheetScrollView>
    </Suspense>
  );
};

export default React.memo(SardArabicTab);

const styles = StyleSheet.create({
  content: {
    paddingBottom: 24,
  },
});
