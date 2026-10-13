/**
 * «الأدوات والنسخ الاحتياطي»: Sard data backup (export/import), encrypted
 * backup with a password (Plus), auto backup (Plus), notes as Markdown, and
 * links to diagnostics, what's new and the feature directory.
 */
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { useEntitlement } from '../../membership/service';
import { FEATURES } from '../../membership/features';
import { isArabicUi, num, t, tr } from '../../i18n';
import { Card, Muted, Row, Screen, SectionTitle, SwitchRow, TierBadge } from '../ui';
import { ChoiceDialog, Stepper, TextPromptDialog } from '../components/dialogs';
import { useAsync } from '../hooks';
import { autoBackupStore } from '../store';
import { exportNotesMarkdown, isEncryptedText, listBackupFiles, parseBackupText, pickBackupText, restoreBackup, runAutoBackupIfDue, shareFile, writeBackupFile } from '../backup';
import NativeFile from '@modules/native-file';

const errText = (e: unknown) => {
  const m = String((e as Error)?.message ?? e);
  if (m === 'wrong-password') return t('plus.backup.wrongPassword');
  if (m === 'weak-password') return t('plus.backup.weakPassword');
  if (m === 'bad-format') return t('plus.backup.badFormat');
  return t('common.error', { error: m });
};

const BackupToolsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const enc = useEntitlement('privacy.encryptedBackup');
  const auto = useEntitlement('tools.autoBackup');
  const [autoS, setAutoS] = autoBackupStore.use();
  const [busy, setBusy] = useState<string | null>(null);
  const [pwdFor, setPwdFor] = useState<null | { mode: 'export' } | { mode: 'import'; text: string }>(null);
  const [intervalPick, setIntervalPick] = useState(false);
  const files = useAsync(() => listBackupFiles(), []);

  const wrap = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      showToast(errText(e));
    } finally {
      setBusy(null);
      files.reload();
    }
  };

  const doRestore = async (text: string, password?: string) => {
    const b = await parseBackupText(text, password);
    const r = await restoreBackup(b);
    showToast(t('plus.backup.restored', { b: num(r.bookmarks), v: num(r.vocab), tg: num(r.tags), h: num(r.highlights) }));
  };

  const importFrom = (text: string | null) => {
    if (!text) return;
    if (isEncryptedText(text)) {
      setPwdFor({ mode: 'import', text });
      return;
    }
    return wrap('import', () => doRestore(text));
  };

  return (
    <Screen title={t('plus.backup.title')} testID="sard-backup-tools">
      <SectionTitle theme={theme}>{tr(FEATURES['tools.sardBackup'].title)}</SectionTitle>
      <Muted theme={theme} style={styles.pad}>{tr(FEATURES['tools.sardBackup'].desc)}</Muted>
      <View style={[styles.pad, styles.row]}>
        <Button testID="sard-backup-export" mode="contained" icon="export" loading={busy === 'export'} title={t('plus.backup.export')}
          onPress={() => wrap('export', async () => {
            const path = await writeBackupFile();
            showToast(t('plus.backup.saved'));
            await shareFile(path);
          })}
        />
        <Button testID="sard-backup-import" mode="outlined" icon="import" loading={busy === 'import'} title={t('plus.backup.import')} onPress={async () => importFrom(await pickBackupText().catch(() => null))} />
      </View>

      <View style={styles.sectionHead}>
        <SectionTitle theme={theme}>{tr(FEATURES['privacy.encryptedBackup'].title)}</SectionTitle>
        {!enc.allowed ? <TierBadge tier={enc.requiredTier} small /> : null}
      </View>
      <Muted theme={theme} style={styles.pad}>{tr(FEATURES['privacy.encryptedBackup'].desc)}</Muted>
      <View style={[styles.pad, styles.row]}>
        <Button testID="sard-backup-encrypted" mode="contained-tonal" icon="file-lock-outline" loading={busy === 'enc'} title={t('plus.backup.exportEncrypted')} onPress={() => enc.gate() && setPwdFor({ mode: 'export' })} />
      </View>

      <View style={styles.sectionHead}>
        <SectionTitle theme={theme}>{tr(FEATURES['tools.autoBackup'].title)}</SectionTitle>
        {!auto.allowed ? <TierBadge tier={auto.requiredTier} small /> : null}
      </View>
      <SwitchRow icon="cloud-sync-outline" label={t('plus.backup.autoOn')} desc={tr(FEATURES['tools.autoBackup'].desc)} value={autoS.enabled} feature="tools.autoBackup" onChange={v => setAutoS({ ...autoS, enabled: v })} />
      {autoS.enabled && auto.allowed ? (
        <>
          <Row theme={theme} icon="calendar-sync" title={t('plus.backup.interval')} desc={t(`plus.backup.${autoS.interval}` as any)} onPress={() => setIntervalPick(true)} />
          <Row theme={theme} icon="layers-outline" title={t('plus.backup.keep')}
            right={<Stepper value={autoS.keep} min={1} max={30} onChange={v => setAutoS({ ...autoS, keep: v })} format={v => num(v)} />}
          />
          <Row theme={theme} icon="clock-check-outline" title={t('plus.backup.last')} desc={autoS.lastAt ? dayjs(autoS.lastAt).format('LLL') : t('plus.backup.never')}
            right={<Button compact title={t('plus.backup.runNow')} onPress={() => wrap('auto', async () => {
              autoBackupStore.set({ ...autoBackupStore.get(), lastAt: undefined });
              await runAutoBackupIfDue();
              showToast(t('plus.backup.saved'));
            })} />}
          />
        </>
      ) : null}

      {files.data?.length ? (
        <>
          <SectionTitle theme={theme}>{t('plus.backup.files', { n: num(files.data.length) })}</SectionTitle>
          {files.data.slice(0, 10).map(f => (
            <Row
              key={f.path}
              theme={theme}
              icon={f.name.includes('.locked') ? 'file-lock-outline' : 'file-outline'}
              title={f.name}
              right={
                <View style={styles.row}>
                  <Button compact title={t('common.share')} onPress={() => shareFile(f.path)} />
                  <Button compact title={t('plus.backup.restore')} onPress={async () => importFrom(await NativeFile.readFile(f.path).catch(() => null))} />
                </View>
              }
            />
          ))}
        </>
      ) : null}

      <SectionTitle theme={theme}>{tr(FEATURES['tools.exportNotes'].title)}</SectionTitle>
      <Row
        theme={theme}
        icon="file-document-outline"
        title={t('plus.backup.notesMd')}
        desc={tr(FEATURES['tools.exportNotes'].desc)}
        onPress={() => wrap('md', async () => {
          await Share.share({ message: await exportNotesMarkdown(isArabicUi()) });
        })}
        testID="sard-export-notes"
      />
      <Row theme={theme} icon="backup-restore" title={t('plus.backup.fullBackup')} desc={t('plus.backup.fullBackupDesc')} onPress={() => navigation.navigate('MoreStack', { screen: 'SettingsStack', params: { screen: 'BackupSettings' } })} />

      <SectionTitle theme={theme}>{t('plus.backup.more')}</SectionTitle>
      <Card theme={theme}>
        <Row theme={theme} icon="stethoscope" title={tr(FEATURES['tools.diagnostics'].title)} desc={tr(FEATURES['tools.diagnostics'].desc)} onPress={() => navigation.navigate('MoreStack', { screen: 'SardDiagnostics' })} testID="sard-open-diagnostics" />
        <Row theme={theme} icon="newspaper-variant-outline" title={tr(FEATURES['tools.changelog'].title)} desc={tr(FEATURES['tools.changelog'].desc)} onPress={() => navigation.navigate('MoreStack', { screen: 'SardChangelog' })} testID="sard-open-changelog" />
        <Row theme={theme} icon="view-grid-plus-outline" title={tr(FEATURES['tools.featureDirectory'].title)} desc={tr(FEATURES['tools.featureDirectory'].desc)} onPress={() => navigation.navigate('MoreStack', { screen: 'SardFeatures' })} />
      </Card>

      <TextPromptDialog
        visible={!!pwdFor}
        title={pwdFor?.mode === 'import' ? t('plus.backup.enterPassword') : t('plus.backup.choosePassword')}
        help={pwdFor?.mode === 'export' ? t('plus.backup.passwordHelp') : undefined}
        label={t('plus.backup.password')}
        secure
        testID="sard-backup-password"
        onDismiss={() => setPwdFor(null)}
        onSubmit={pwd => {
          const p = pwdFor;
          setPwdFor(null);
          if (!p) return;
          if (p.mode === 'export') {
            void wrap('enc', async () => {
              const path = await writeBackupFile(pwd);
              showToast(t('plus.backup.saved'));
              await shareFile(path);
            });
          } else {
            void wrap('import', () => doRestore(p.text, pwd));
          }
        }}
      />
      <ChoiceDialog
        visible={intervalPick}
        title={t('plus.backup.interval')}
        choices={[{ value: 'daily', label: t('plus.backup.daily') }, { value: 'weekly', label: t('plus.backup.weekly') }]}
        selected={autoS.interval}
        onDismiss={() => setIntervalPick(false)}
        onPick={v => {
          setAutoS({ ...autoS, interval: v as 'daily' | 'weekly' });
          setIntervalPick(false);
        }}
      />
    </Screen>
  );
};

export default BackupToolsScreen;

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingVertical: 6 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingEnd: 12 },
});
