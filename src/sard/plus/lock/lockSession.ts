/**
 * Runtime state of the app lock: whether the lock screen is up, whether the
 * hidden shelf is revealed this session, and one-off unlock prompts.
 */
import { create } from 'zustand';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { lockStore } from '../store';
import { hashPin, isValidPin, verifyPin, type LockSettings } from '../logic/lock';

type Prompt = { reason: string; resolve: (ok: boolean) => void };

interface LockSessionState {
  locked: boolean;
  hiddenRevealed: boolean;
  prompt: Prompt | null;
  failures: number;
  blockedUntil: number;
}

export const useLockSession = create<LockSessionState>(() => ({
  locked: false,
  hiddenRevealed: false,
  prompt: null,
  failures: 0,
  blockedUntil: 0,
}));

/** A lock is only real when it can be opened (a PIN is set). */
export const lockUsable = (s: LockSettings = lockStore.get()) => !!s.pinHash;

export const lockNow = () => {
  if (lockStore.get().enabled && lockUsable()) useLockSession.setState({ locked: true, hiddenRevealed: false });
};

export const unlockSession = () => useLockSession.setState({ locked: false, failures: 0, blockedUntil: 0 });

export const setHiddenRevealed = (v: boolean) => useLockSession.setState({ hiddenRevealed: v });

/** Asks for PIN / biometrics without the full app lock (hidden shelf, settings). */
export const requestUnlock = (reason: string): Promise<boolean> => {
  if (!lockUsable()) return Promise.resolve(true);
  return new Promise(resolve => {
    const prev = useLockSession.getState().prompt;
    prev?.resolve(false);
    useLockSession.setState({ prompt: { reason, resolve } });
  });
};

export const finishPrompt = (ok: boolean) => {
  const p = useLockSession.getState().prompt;
  useLockSession.setState({ prompt: null });
  p?.resolve(ok);
};

export const biometricAvailable = async () => {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
};

export const authenticateBiometric = async (prompt: string, cancelLabel: string) => {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel,
      disableDeviceFallback: true,
    });
    return r.success;
  } catch {
    return false;
  }
};

export const checkPin = (pin: string) => verifyPin(pin, lockStore.get());

export const setPin = (pin: string) => {
  if (!isValidPin(pin)) return false;
  const salt = Array.from(Crypto.getRandomBytes(16), b => b.toString(16).padStart(2, '0')).join('');
  lockStore.update(s => ({ ...s, pinHash: hashPin(pin, salt), pinSalt: salt }));
  return true;
};

/** Turns the lock off and forgets the PIN. */
export const clearLock = () => {
  lockStore.update(s => ({ ...s, enabled: false, pinHash: '', pinSalt: '' }));
  unlockSession();
};
