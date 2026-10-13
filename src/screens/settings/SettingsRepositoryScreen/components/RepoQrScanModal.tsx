import React, { useCallback, useRef, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { IconButton } from 'react-native-paper';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';

import { repoStrings as S } from '../../../../sard/export/strings';
import { extractRepoUrl } from '../utils/repoUrl';

interface RepoQrScanModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called once with the repository URL found in a scanned QR code. */
  onScanned: (url: string) => void;
}

/**
 * Full-screen QR scanner (expo-camera). Only a code containing a
 * `…plugins.min.json` URL (or a lnreader:// / sard:// add-repo link) is
 * accepted; the URL then goes to the review dialog, never straight in.
 */
const RepoQrScanModal: React.FC<RepoQrScanModalProps> = ({
  visible,
  onClose,
  onScanned,
}) => {
  const theme = useTheme();
  const { top, bottom } = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const handled = useRef(false);
  const lastInvalid = useRef<string | undefined>(undefined);

  const onBarcode = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (handled.current) return;
      const url = extractRepoUrl(data);
      if (url) {
        handled.current = true;
        onScanned(url);
        return;
      }
      if (lastInvalid.current !== data) {
        lastInvalid.current = data;
        showToast(S.qrNoRepo);
      }
    },
    [onScanned],
  );

  const onShow = () => {
    handled.current = false;
    lastInvalid.current = undefined;
    if (!permission?.granted && permission?.canAskAgain !== false) {
      requestPermission();
    }
  };

  const denied = permission && !permission.granted && !permission.canAskAgain;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      onShow={onShow}
      statusBarTranslucent
    >
      <View style={[styles.root, { backgroundColor: '#000' }]}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={visible ? onBarcode : undefined}
          />
        ) : (
          <View style={[styles.permission, { backgroundColor: theme.surface }]}>
            <Text style={[styles.permissionText, { color: theme.onSurface }]}>
              {denied ? S.qrDenied : S.qrPermission}
            </Text>
            {denied ? (
              <Button
                title={S.qrGrant}
                mode="contained"
                onPress={() => Linking.openSettings()}
              />
            ) : (
              <Button
                title={S.qrGrant}
                mode="contained"
                onPress={() => requestPermission()}
              />
            )}
          </View>
        )}

        {permission?.granted ? (
          <View pointerEvents="none" style={styles.overlay}>
            <View style={styles.frame} />
            <Text style={styles.hint}>{S.qrTitle}</Text>
          </View>
        ) : null}

        <View style={[styles.topBar, { paddingTop: top + 8 }]}>
          <IconButton
            icon="close"
            iconColor="#fff"
            accessibilityLabel={S.qrClose}
            onPress={onClose}
          />
          {permission?.granted ? (
            <IconButton
              icon={torch ? 'flashlight-off' : 'flashlight'}
              iconColor="#fff"
              accessibilityLabel={S.qrTorch}
              onPress={() => setTorch(v => !v)}
            />
          ) : null}
        </View>
        <View style={{ height: bottom }} />
      </View>
    </Modal>
  );
};

export default RepoQrScanModal;

const FRAME = 240;

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: FRAME,
    height: FRAME,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  hint: {
    color: '#fff',
    fontSize: 15,
    marginTop: 24,
    textAlign: 'center',
    paddingHorizontal: 32,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  permissionText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
