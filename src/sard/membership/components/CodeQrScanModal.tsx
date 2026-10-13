/** Full-screen QR scanner for membership codes (expo-camera). */
import { useCallback, useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@components';
import { showToast } from '@utils/showToast';
import { decodeCode } from '../code';
import { t } from '../../i18n';

export const CodeQrScanModal = ({
  visible,
  onClose,
  onScanned,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
}) => {
  const { top, bottom } = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  const lastBad = useRef<string | undefined>(undefined);

  const onBarcode = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (handled.current) return;
      if (decodeCode(data)) {
        handled.current = true;
        onScanned(data);
        return;
      }
      if (lastBad.current !== data) {
        lastBad.current = data;
        showToast(t('membership.qrNotCode'));
      }
    },
    [onScanned],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      onShow={() => {
        handled.current = false;
        if (!permission?.granted && permission?.canAskAgain !== false) requestPermission();
      }}
    >
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onBarcode}
          />
        ) : (
          <Text style={styles.msg}>{t('membership.cameraNeeded')}</Text>
        )}
        <View style={[styles.frame, { marginTop: top + 120 }]} pointerEvents="none" />
        <Text style={[styles.hint, { top: top + 60 }]}>{t('membership.qrHint')}</Text>
        <View style={[styles.bottom, { paddingBottom: bottom + 24 }]}>
          {!permission?.granted ? (
            <Button mode="contained" title={t('membership.allowCamera')} onPress={requestPermission} />
          ) : null}
          <Button mode="contained-tonal" title={t('common.close')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  msg: { color: '#fff', textAlign: 'center', marginTop: 200, paddingHorizontal: 32, fontSize: 16 },
  frame: { alignSelf: 'center', width: 260, height: 260, borderWidth: 3, borderColor: '#fff', borderRadius: 24 },
  hint: { position: 'absolute', alignSelf: 'center', color: '#fff', fontSize: 15, paddingHorizontal: 24, textAlign: 'center' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, gap: 12, paddingHorizontal: 24 },
});
