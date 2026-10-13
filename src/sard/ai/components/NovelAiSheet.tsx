/**
 * Bottom-sheet variant of the novel AI panel, for the reader (keeps the
 * reading position; no navigation needed).
 *
 * Usage:
 *   const ref = useRef<BottomSheetModalMethods>(null);
 *   <NovelAiSheet bottomSheetRef={ref} novel={novel} chapterId={chapter.id} />
 *   ref.current?.present();
 */
import { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetModalMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import BottomSheet from '@components/BottomSheet/BottomSheet';
import { useTheme } from '@hooks/persisted';
import NovelAiPanel, { type NovelAiTab } from './NovelAiPanel';

const NovelAiSheet = ({
  bottomSheetRef,
  novel,
  chapterId,
  initialTab = 'recap',
  onOpenSettings,
}: {
  bottomSheetRef: RefObject<BottomSheetModalMethods | null>;
  novel: { id: number; name: string; pluginId: string };
  chapterId?: number;
  initialTab?: NovelAiTab;
  onOpenSettings?: () => void;
}) => {
  const theme = useTheme();
  return (
    <BottomSheet bottomSheetRef={bottomSheetRef} snapPoints={[560, 900]}>
      <BottomSheetView style={styles.container}>
        <View style={[styles.handle, { backgroundColor: theme.outline }]} />
        <NovelAiPanel
          theme={theme}
          novel={novel}
          currentChapterId={chapterId}
          initialTab={initialTab}
          onOpenSettings={() => {
            bottomSheetRef.current?.close();
            onOpenSettings?.();
          }}
        />
      </BottomSheetView>
    </BottomSheet>
  );
};

export default NovelAiSheet;

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 8 },
  handle: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
    opacity: 0.6,
  },
});
