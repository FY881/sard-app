/**
 * App lock: full-screen PIN / biometric gate shown at startup and after the
 * app stayed in the background longer than the chosen timeout, plus one-off
 * unlock prompts (hidden shelf). Also applies «إخفاء من التطبيقات الأخيرة»
 * (FLAG_SECURE) through expo-screen-capture.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import * as ScreenCapture from 'expo-screen-capture';
import { useTheme } from '@hooks/persisted';
import { lockStore } from '../store';
import { lockoutMs, shouldLockOnResume } from '../logic/lock';
import {
  authenticateBiometric,
  biometricAvailable,
  checkPin,
  finishPrompt,
  lockNow,
  lockUsable,
  unlockSession,
  useLockSession,
} from './lockSession';
import { num, t } from '../../i18n';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'];

export const PinPad = ({
  title,
  subtitle,
  onSubmit,
  onBiometric,
  onCancel,
  error,
  disabled,
  testID = 'sard-pin-pad',
}: {
  title: string;
  subtitle?: string;
  onSubmit: (pin: string) => boolean | void;
  onBiometric?: () => void;
  onCancel?: () => void;
  error?: string;
  disabled?: boolean;
  testID?: string;
}) => {
  const theme = useTheme();
  const [pin, setPin] = useState('');
  const press = (k: string) => {
    if (disabled) return;
    if (k === 'del') return setPin(p => p.slice(0, -1));
    if (k === 'bio') return onBiometric?.();
    setPin(p => (p.length >= 8 ? p : p + k));
  };
  const submit = () => {
    if (pin.length < 4) return;
    const ok = onSubmit(pin);
    if (ok === false) setPin('');
  };
  return (
    <View style={[styles.pad, { backgroundColor: theme.background }]} testID={testID}>
      <MaterialCommunityIcons name="lock-outline" size={44} color={theme.primary} />
      <Text style={[styles.title, { color: theme.onSurface }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: theme.onSurfaceVariant }]}>{subtitle}</Text> : null}
      <View style={styles.dots} accessibilityLabel={t('plus.lock.pinLength', { n: num(pin.length) })}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, { borderColor: theme.primary }, i < pin.length && { backgroundColor: theme.primary }]}
          />
        ))}
      </View>
      <Text style={[styles.error, { color: theme.error }]}>{error ?? ' '}</Text>
      <View style={styles.grid}>
        {KEYS.map(k => {
          if (k === 'bio' && !onBiometric) return <View key={k} style={styles.key} />;
          return (
            <Pressable
              key={k}
              testID={`sard-pin-${k}`}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? t('plus.lock.delete') : k === 'bio' ? t('plus.lock.biometric') : k}
              onPress={() => press(k)}
              android_ripple={{ color: theme.rippleColor, borderless: true }}
              style={[styles.key, { backgroundColor: theme.surfaceVariant }]}
            >
              {k === 'del' ? (
                <MaterialCommunityIcons name="backspace-outline" size={24} color={theme.onSurface} />
              ) : k === 'bio' ? (
                <MaterialCommunityIcons name="fingerprint" size={28} color={theme.primary} />
              ) : (
                <Text style={[styles.keyText, { color: theme.onSurface }]}>{k}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.actions}>
        {onCancel ? (
          <Pressable testID="sard-pin-cancel" onPress={onCancel} style={styles.action}>
            <Text style={[styles.actionText, { color: theme.onSurfaceVariant }]}>{t('common.cancel')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          testID="sard-pin-ok"
          onPress={submit}
          disabled={pin.length < 4 || disabled}
          style={[styles.action, styles.okBtn, { backgroundColor: pin.length >= 4 ? theme.primary : theme.surfaceVariant }]}
        >
          <Text style={[styles.actionText, { color: pin.length >= 4 ? theme.onPrimary : theme.onSurfaceVariant }]}>
            {t('plus.lock.unlock')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

/** PIN + biometric unlock with the wrong-PIN backoff. */
const UnlockPad = ({ subtitle, onSuccess, onCancel, testID }: { subtitle?: string; onSuccess: () => void; onCancel?: () => void; testID?: string }) => {
  const settings = lockStore.get();
  const { failures, blockedUntil } = useLockSession();
  const [now, setNow] = useState(Date.now());
  const [bio, setBio] = useState(false);
  const triedBio = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const runBio = useCallback(async () => {
    if (await authenticateBiometric(t('plus.lock.bioPrompt'), t('plus.lock.usePin'))) onSuccess();
  }, [onSuccess]);

  useEffect(() => {
    if (!settings.biometric) return;
    biometricAvailable().then(ok => {
      setBio(ok);
      if (ok && !triedBio.current) {
        triedBio.current = true;
        void runBio();
      }
    });
  }, [runBio, settings.biometric]);

  const blocked = blockedUntil > now;
  return (
    <PinPad
      testID={testID}
      title={t('plus.lock.title')}
      subtitle={subtitle}
      disabled={blocked}
      error={
        blocked
          ? t('plus.lock.blocked', { s: num(Math.ceil((blockedUntil - now) / 1000)) })
          : failures
            ? t('plus.lock.wrong')
            : undefined
      }
      onBiometric={bio ? runBio : undefined}
      onCancel={onCancel}
      onSubmit={pin => {
        if (checkPin(pin)) {
          useLockSession.setState({ failures: 0, blockedUntil: 0 });
          onSuccess();
          return true;
        }
        const f = failures + 1;
        useLockSession.setState({ failures: f, blockedUntil: Date.now() + lockoutMs(f) });
        return false;
      }}
    />
  );
};

export const AppLockGate = () => {
  const { locked, prompt } = useLockSession();
  const [lock] = lockStore.use();
  const backgroundAt = useRef<number | null>(null);

  // Lock at startup.
  useEffect(() => {
    lockNow();
  }, []);

  // Hide content in recents / block screenshots.
  useEffect(() => {
    const apply = async () => {
      try {
        if (lock.hideInRecents) await ScreenCapture.preventScreenCaptureAsync('sard-privacy');
        else await ScreenCapture.allowScreenCaptureAsync('sard-privacy');
      } catch {
        // not available on this platform
      }
    };
    void apply();
  }, [lock.hideInRecents]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') {
        backgroundAt.current = Date.now();
      } else if (state === 'active') {
        const s = lockStore.get();
        if (backgroundAt.current !== null && lockUsable(s) && shouldLockOnResume(s, backgroundAt.current)) lockNow();
        backgroundAt.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  if (locked && lock.enabled && lockUsable(lock)) {
    return (
      <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <UnlockPad testID="sard-app-lock" onSuccess={unlockSession} />
      </Modal>
    );
  }
  if (prompt) {
    return (
      <Modal visible animationType="slide" statusBarTranslucent onRequestClose={() => finishPrompt(false)}>
        <UnlockPad
          testID="sard-unlock-prompt"
          subtitle={prompt.reason}
          onSuccess={() => finishPrompt(true)}
          onCancel={() => finishPrompt(false)}
        />
      </Modal>
    );
  }
  return null;
};

const styles = StyleSheet.create({
  pad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  dots: { flexDirection: 'row', gap: 12, marginTop: 16, direction: 'ltr' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  error: { fontSize: 13, minHeight: 20, textAlign: 'center' },
  grid: { width: 264, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', direction: 'ltr' },
  key: { width: 76, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 26, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  action: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 },
  okBtn: { minWidth: 120, alignItems: 'center' },
  actionText: { fontSize: 16, fontWeight: '600' },
});
