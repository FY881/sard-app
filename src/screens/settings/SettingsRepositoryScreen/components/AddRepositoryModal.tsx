import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';

import { Checkbox, Dialog } from '@components/index';
import { Repository } from '@database/types';
import { useTheme } from '@hooks/persisted';

import { repoStrings as S, fmt } from '../../../../sard/export/strings';
import {
  extractRepoUrl,
  isRepoUrl,
  summarizeRepository,
  type RepositorySummary,
} from '../utils/repoUrl';

interface AddRepositoryModalProps {
  repository?: Repository;
  visible: boolean;
  closeModal: () => void;
  upsertRepository: (
    repositoryUrl: string,
    repository?: Repository,
  ) => void | Promise<unknown>;
  /** Prefill (deep link, clipboard suggestion, QR scan). */
  initialUrl?: string;
  /** Shows a "scan QR" action when provided. */
  onScanQr?: () => void;
}

type Check =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; summary: RepositorySummary }
  | { status: 'error'; message: string };

const CHECK_TIMEOUT_MS = 15000;

const inspectRepository = async (
  url: string,
  signal: AbortSignal,
): Promise<RepositorySummary> => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const json = await response.json();
  return summarizeRepository(json);
};

/**
 * Add / edit a plugin repository. Arabic help + a mandatory trust
 * confirmation; the repository is fetched once to show what it contains
 * before the user commits. Nothing is ever pre-filled by the app itself.
 */
const AddRepositoryModal: React.FC<AddRepositoryModalProps> = ({
  repository,
  closeModal,
  visible,
  upsertRepository,
  initialUrl,
  onScanQr,
}) => {
  const theme = useTheme();
  const [url, setUrl] = useState(repository?.url || initialUrl || '');
  const [trusted, setTrusted] = useState(Boolean(repository));
  const [check, setCheck] = useState<Check>({ status: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (visible) {
      setUrl(repository?.url || initialUrl || '');
      setTrusted(Boolean(repository));
      setCheck({ status: 'idle' });
    }
  }, [visible, initialUrl, repository]);

  const trimmed = url.trim();
  const valid = isRepoUrl(trimmed);

  // Inspect the repository (debounced) once the URL looks right.
  useEffect(() => {
    controller.current?.abort();
    if (!visible || !valid) {
      setCheck({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    controller.current = ctrl;
    const timer = setTimeout(async () => {
      setCheck({ status: 'checking' });
      const timeout = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
      try {
        const summary = await inspectRepository(trimmed, ctrl.signal);
        if (!ctrl.signal.aborted) setCheck({ status: 'ok', summary });
      } catch (error) {
        if (ctrl.signal.aborted && controller.current !== ctrl) return;
        const message =
          error instanceof Error && error.message === 'not-a-repository'
            ? S.checkNotRepo
            : fmt(S.checkFailed, {
                error: error instanceof Error ? error.message : String(error),
              });
        setCheck({ status: 'error', message });
      } finally {
        clearTimeout(timeout);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [trimmed, valid, visible]);

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    setUrl(extractRepoUrl(text) ?? text.trim());
  };

  const submit = async () => {
    if (!valid || !trusted) return;
    setSubmitting(true);
    try {
      await upsertRepository(trimmed, repository);
      closeModal();
    } finally {
      setSubmitting(false);
    }
  };

  const muted = { color: theme.onSurfaceVariant };
  const showFormatError = trimmed.length > 0 && !valid;

  return (
    <Dialog.Root visible={visible} onDismiss={closeModal}>
      <Dialog.Header>
        <Dialog.Title>{repository ? S.editTitle : S.addTitle}</Dialog.Title>
        <Dialog.Description>{S.help}</Dialog.Description>
      </Dialog.Header>
      <Dialog.Content>
        <TextInput
          autoFocus={!initialUrl && !repository}
          value={url}
          label={S.urlLabel}
          placeholder={S.urlPlaceholder}
          onChangeText={setUrl}
          mode="outlined"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          error={showFormatError}
          underlineColor={theme.outline}
          theme={{ colors: { ...theme } }}
          right={
            <TextInput.Icon
              icon="content-paste"
              accessibilityLabel={S.pasteFromClipboard}
              onPress={paste}
            />
          }
        />
        <HelperText type={showFormatError ? 'error' : 'info'} visible>
          {showFormatError ? S.invalidUrl : S.helpFormat}
        </HelperText>

        {check.status === 'checking' ? (
          <View style={styles.row}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.checkText, muted]}>{S.checking}</Text>
          </View>
        ) : null}
        {check.status === 'ok' ? (
          <View
            style={[styles.summary, { backgroundColor: theme.surfaceVariant }]}
          >
            <Text style={[styles.summaryTitle, { color: theme.onSurface }]}>
              {fmt(S.checkOk, { count: check.summary.count })}
              {check.summary.arabicCount
                ? ` · ${fmt(S.checkArabic, {
                    count: check.summary.arabicCount,
                  })}`
                : ''}
            </Text>
            {check.summary.languages.length ? (
              <Text style={[styles.checkText, muted]} numberOfLines={2}>
                {fmt(S.checkLangs, {
                  langs: check.summary.languages
                    .slice(0, 6)
                    .map(l => `${l.lang} (${l.count})`)
                    .join('، '),
                })}
              </Text>
            ) : null}
          </View>
        ) : null}
        {check.status === 'error' ? (
          <HelperText type="error" visible>
            {check.message}
          </HelperText>
        ) : null}

        <View style={[styles.warning, { borderColor: theme.error }]}>
          <Text style={[styles.warningTitle, { color: theme.error }]}>
            {S.trustTitle}
          </Text>
          <Text style={[styles.warningText, muted]}>{S.trustWarning}</Text>
        </View>
        <Checkbox
          label={S.trustAccept}
          status={trusted}
          onPress={() => setTrusted(v => !v)}
          theme={theme}
        />
      </Dialog.Content>
      <Dialog.Actions>
        {onScanQr && !repository ? (
          <Dialog.Action icon="qrcode-scan" onPress={onScanQr}>
            {S.scanQr}
          </Dialog.Action>
        ) : null}
        <Dialog.Action onPress={closeModal}>{S.cancel}</Dialog.Action>
        <Dialog.Action
          disabled={!valid || !trusted || submitting}
          loading={submitting}
          onPress={submit}
        >
          {repository ? S.save : S.add}
        </Dialog.Action>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export default AddRepositoryModal;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  checkText: { fontSize: 12, marginTop: 2 },
  summary: { borderRadius: 12, padding: 10, marginTop: 6 },
  summaryTitle: { fontSize: 13, fontWeight: '600' },
  warning: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 12 },
  warningTitle: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  warningText: { fontSize: 12, lineHeight: 18 },
});
