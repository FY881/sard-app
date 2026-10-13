/**
 * «الخصوصية والأمان»: app lock (PIN + biometrics, relock timeout), hide in
 * recents (FLAG_SECURE), hidden shelf (Plus) and clearing traces.
 */
import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { deleteAllHistory } from '@database/queries/HistoryQueries';
import { useEntitlement } from '../../membership/service';
import { FEATURES } from '../../membership/features';
import { num, t, tr } from '../../i18n';
import { Card, Muted, Row, Screen, SectionTitle, SwitchRow, TierBadge } from '../ui';
import { ChoiceDialog } from '../components/dialogs';
import { useAsync } from '../hooks';
import { hiddenStore, lockStore, useMmkvState } from '../store';
import { LOCK_TIMEOUTS } from '../logic/lock';
import { PinPad } from '../lock/AppLockGate';
import { biometricAvailable, clearLock, requestUnlock, setHiddenRevealed, setPin, useLockSession } from '../lock/lockSession';
import { setHidden } from '../db';
import { novelNames } from '../data';
import { clearRecentPages } from '../../readermode/history';

const timeoutLabel = (ms: number) =>
  ms === 0 ? t('plus.privacy.always') : ms < 60_000 ? t('plus.privacy.seconds', { n: num(ms / 1000) }) : t('common.minutes', { n: num(ms / 60_000) });

const PrivacyScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [lock, setLock] = useMmkvState(lockStore);
  const [hidden] = useMmkvState(hiddenStore);
  const revealed = useLockSession(s => s.hiddenRevealed);
  const shelf = useEntitlement('privacy.hiddenShelf');
  const [pinStep, setPinStep] = useState<null | { first?: string }>(null);
  const [timeoutPick, setTimeoutPick] = useState(false);
  const { data: bio } = useAsync(() => biometricAvailable(), [], false);
  const { data: names, reload } = useAsync(() => novelNames(hidden), [hidden.join(',')]);

  const patch = (p: Partial<typeof lock>) => setLock({ ...lockStore.get(), ...p });

  const toggleLock = async (v: boolean) => {
    if (v) {
      if (!lock.pinHash) setPinStep({});
      else patch({ enabled: true });
      return;
    }
    if (await requestUnlock(t('plus.privacy.confirmOff'))) patch({ enabled: false });
  };

  const changePin = async () => {
    if (lock.pinHash && !(await requestUnlock(t('plus.privacy.confirmChange')))) return;
    setPinStep({});
  };

  return (
    <Screen title={t('plus.privacy.title')} testID="sard-privacy">
      <SectionTitle theme={theme}>{tr(FEATURES['privacy.appLock'].title)}</SectionTitle>
      <SwitchRow
        testID="sard-lock-toggle"
        icon="lock-outline"
        label={t('plus.privacy.lockOn')}
        desc={tr(FEATURES['privacy.appLock'].desc)}
        value={lock.enabled && !!lock.pinHash}
        feature="privacy.appLock"
        onChange={v => void toggleLock(v)}
      />
      <Row theme={theme} icon="dialpad" title={lock.pinHash ? t('plus.privacy.changePin') : t('plus.privacy.setPin')} desc={t('plus.privacy.pinHelp')} onPress={changePin} testID="sard-set-pin" />
      {lock.pinHash ? (
        <>
          <SwitchRow
            icon="fingerprint"
            label={t('plus.privacy.biometric')}
            desc={bio ? t('plus.privacy.biometricHelp') : t('plus.privacy.biometricNone')}
            value={lock.biometric}
            onChange={v => patch({ biometric: v })}
          />
          <Row theme={theme} icon="timer-lock-outline" title={t('plus.privacy.relock')} desc={timeoutLabel(lock.timeoutMs)} onPress={() => setTimeoutPick(true)} />
          <Row
            theme={theme}
            icon="lock-remove-outline"
            title={t('plus.privacy.removePin')}
            onPress={async () => {
              if (await requestUnlock(t('plus.privacy.confirmOff'))) {
                clearLock();
                showToast(t('plus.privacy.removed'));
              }
            }}
            testID="sard-remove-pin"
          />
        </>
      ) : null}

      <SectionTitle theme={theme}>{tr(FEATURES['privacy.hideRecents'].title)}</SectionTitle>
      <SwitchRow
        testID="sard-hide-recents"
        icon="eye-off-outline"
        label={tr(FEATURES['privacy.hideRecents'].title)}
        desc={tr(FEATURES['privacy.hideRecents'].desc)}
        value={lock.hideInRecents}
        feature="privacy.hideRecents"
        onChange={v => patch({ hideInRecents: v })}
      />

      <View style={styles.sectionHead}>
        <SectionTitle theme={theme}>{tr(FEATURES['privacy.hiddenShelf'].title)}</SectionTitle>
        {!shelf.allowed ? <TierBadge tier={shelf.requiredTier} small /> : null}
      </View>
      <Muted theme={theme} style={styles.pad}>{t('plus.privacy.shelfHelp', { n: num(hidden.length) })}</Muted>
      <SwitchRow
        icon="shield-key-outline"
        label={t('plus.privacy.shelfNeedsUnlock')}
        value={lock.lockHiddenShelf}
        onChange={v => patch({ lockHiddenShelf: v })}
      />
      <View style={[styles.pad, styles.row]}>
        <Button
          testID="sard-reveal-hidden"
          mode={revealed ? 'contained' : 'contained-tonal'}
          icon={revealed ? 'eye-outline' : 'eye-off-outline'}
          title={revealed ? t('plus.privacy.hideAgain') : t('plus.privacy.reveal')}
          onPress={async () => {
            if (!shelf.gate()) return;
            if (revealed) return setHiddenRevealed(false);
            if (!lock.lockHiddenShelf || (await requestUnlock(t('plus.privacy.revealReason')))) {
              setHiddenRevealed(true);
              showToast(t('plus.privacy.revealed'));
            }
          }}
        />
        <Button compact title={t('plus.privacy.manageInLibrary')} onPress={() => navigation.navigate('MoreStack', { screen: 'SardLibraryTools' })} />
      </View>
      {revealed || !lock.lockHiddenShelf
        ? hidden.map(id => (
            <Row
              key={id}
              theme={theme}
              icon="archive-lock-outline"
              title={names?.get(id) ?? `#${id}`}
              right={
                <Button
                  compact
                  title={t('plus.privacy.unhide')}
                  onPress={() => {
                    setHidden([id], false);
                    reload();
                  }}
                />
              }
            />
          ))
        : null}

      <SectionTitle theme={theme}>{tr(FEATURES['privacy.clearTraces'].title)}</SectionTitle>
      <Card theme={theme}>
        <Muted theme={theme}>{tr(FEATURES['privacy.clearTraces'].desc)}</Muted>
        <View style={[styles.row, styles.top]}>
          <Button
            testID="sard-clear-traces"
            mode="outlined"
            icon="eraser"
            title={t('plus.privacy.clearNow')}
            onPress={async () => {
              await deleteAllHistory().catch(() => {});
              clearRecentPages();
              showToast(t('plus.privacy.cleared'));
            }}
          />
        </View>
      </Card>

      <Modal visible={!!pinStep} animationType="slide" onRequestClose={() => setPinStep(null)}>
        <PinPad
          key={pinStep?.first ? 'confirm' : 'first'}
          testID="sard-pin-setup"
          title={pinStep?.first ? t('plus.privacy.confirmPin') : t('plus.privacy.newPin')}
          subtitle={t('plus.privacy.pinHelp')}
          onCancel={() => setPinStep(null)}
          onSubmit={pin => {
            if (!pinStep?.first) {
              setPinStep({ first: pin });
              return false;
            }
            if (pin !== pinStep.first) {
              showToast(t('plus.privacy.pinMismatch'));
              setPinStep({});
              return false;
            }
            setPin(pin);
            patch({ enabled: true });
            setPinStep(null);
            showToast(t('plus.privacy.pinSet'));
            return true;
          }}
        />
      </Modal>
      <ChoiceDialog
        visible={timeoutPick}
        title={t('plus.privacy.relock')}
        choices={LOCK_TIMEOUTS.map(ms => ({ value: ms, label: timeoutLabel(ms) }))}
        selected={lock.timeoutMs}
        onDismiss={() => setTimeoutPick(false)}
        onPick={v => {
          patch({ timeoutMs: Number(v) });
          setTimeoutPick(false);
        }}
      />
    </Screen>
  );
};

export default PrivacyScreen;

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingVertical: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  top: { marginTop: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingEnd: 12 },
});
