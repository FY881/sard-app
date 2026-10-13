/** «تفعيل كود» dialog: paste / type / scan an owner-signed code. */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Dialog, Portal, TextInput } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { membership } from '../service';
import { TIER_META } from '../tiers';
import { CodeQrScanModal } from './CodeQrScanModal';
import { t, tr } from '../../i18n';

export const codeErrorText = (error: string) => {
  switch (error) {
    case 'signature':
      return t('membership.err.signature');
    case 'device':
      return t('membership.err.device');
    case 'expired':
      return t('membership.err.expired');
    case 'revoked':
      return t('membership.err.revoked');
    case 'already':
      return t('membership.err.already');
    case 'future':
      return t('membership.err.future');
    default:
      return t('membership.err.format');
  }
};

export const ActivateCodeDialog = ({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) => {
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [scan, setScan] = useState(false);

  const activate = (value = code) => {
    const res = membership.activate(value);
    if (res.ok) {
      showToast(t('membership.activated', { tier: tr(TIER_META[res.entitlement.tier].name) }));
      setCode('');
      setError('');
      onDismiss();
    } else {
      setError(codeErrorText(res.error));
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ backgroundColor: theme.overlay3 }}>
        <Dialog.Title style={{ color: theme.onSurface }}>{t('membership.activateTitle')}</Dialog.Title>
        <Dialog.Content>
          <Text style={[styles.help, { color: theme.onSurfaceVariant }]}>{t('membership.activateHelp')}</Text>
          <TextInput
            testID="sard-code-input"
            mode="outlined"
            multiline
            numberOfLines={4}
            value={code}
            onChangeText={v => {
              setCode(v);
              setError('');
            }}
            placeholder="SARD-XXXX-XXXX-…"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
            theme={{ colors: { ...theme } }}
          />
          {error ? <Text style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
          <View style={styles.row}>
            <Button
              mode="outlined"
              icon="content-paste"
              title={t('membership.paste')}
              onPress={async () => setCode((await Clipboard.getStringAsync()) || '')}
            />
            <Button mode="outlined" icon="qrcode-scan" title={t('membership.scan')} onPress={() => setScan(true)} />
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button title={t('common.cancel')} onPress={onDismiss} />
          <Button
            testID="sard-code-activate"
            mode="contained"
            title={t('membership.activate')}
            disabled={!code.trim()}
            onPress={() => activate()}
          />
        </Dialog.Actions>
      </Dialog>
      <CodeQrScanModal
        visible={scan}
        onClose={() => setScan(false)}
        onScanned={c => {
          setScan(false);
          setCode(c);
          activate(c);
        }}
      />
    </Portal>
  );
};

const styles = StyleSheet.create({
  help: { fontSize: 13, lineHeight: 20, marginBottom: 8 },
  input: { fontSize: 13, minHeight: 96 },
  error: { marginTop: 8, fontSize: 13 },
  row: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
});
