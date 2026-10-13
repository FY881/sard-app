/** «التشخيص الذاتي»: database / storage / plugins / membership checks with a copyable report, plus selective reset. */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import * as Clipboard from 'expo-clipboard';
import * as LegacyFS from 'expo-file-system/legacy';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { getMMKVObject } from '@utils/mmkv/mmkv';
import { db } from '@database/db';
import { INSTALLED_PLUGINS_KEY } from '@plugins/pluginManager';
import { MMKVStorage } from '@utils/mmkv/mmkv';
import { useMembership } from '../../membership/service';
import { FEATURES } from '../../membership/features';
import { num, t, tr } from '../../i18n';
import { Card, Muted, Row, Screen, SectionTitle } from '../ui';
import { ChoiceDialog } from '../components/dialogs';
import { useAsync } from '../hooks';
import { ensureSardPlusTables } from '../db';
import { ensureSardReaderTables } from '../../reader/db';
import { formatBytes } from '../logic/offline';
import {
  achievementsStore,
  agentScheduleStore,
  autoBackupStore,
  challengesStore,
  cleanupStore,
  freezeStore,
  plusReaderSettings,
  quoteStore,
  schedulerStore,
  smartFiltersStore,
  upNextStore,
  wpmStore,
} from '../store';
import appJson from '../../../../app.json';

export const APP_VERSION: string = (appJson as any)?.expo?.version ?? '';

interface Check {
  id: string;
  ok: boolean;
  label: string;
  detail: string;
}

const count = async (table: string) => {
  try {
    const r: any = await db.execute(`SELECT COUNT(*) AS n FROM ${table}`);
    return Number(r?.rows?.[0]?.n ?? 0);
  } catch {
    return -1;
  }
};

const runChecks = async (tierName: string): Promise<Check[]> => {
  ensureSardPlusTables();
  ensureSardReaderTables();
  const out: Check[] = [];
  let integrity = 'unknown';
  try {
    const r: any = await db.execute('PRAGMA quick_check');
    integrity = String(Object.values(r?.rows?.[0] ?? {})[0] ?? 'unknown');
  } catch (e) {
    integrity = String((e as Error)?.message ?? e);
  }
  out.push({ id: 'db', ok: integrity === 'ok', label: t('plus.diag.db'), detail: integrity });
  const [novels, chapters, downloaded, hl, bm, vocab, tags] = await Promise.all([
    count('Novel WHERE inLibrary = 1'),
    count('Chapter'),
    count('Chapter WHERE isDownloaded = 1'),
    count('SardHighlight'),
    count('SardBookmark'),
    count('SardVocab'),
    count('SardTag'),
  ]);
  out.push({ id: 'library', ok: novels >= 0 && chapters >= 0, label: t('plus.diag.library'), detail: t('plus.diag.libraryDetail', { n: num(novels), c: num(chapters), d: num(downloaded) }) });
  out.push({ id: 'sard', ok: hl >= 0 && bm >= 0 && vocab >= 0 && tags >= 0, label: t('plus.diag.sardTables'), detail: t('plus.diag.sardDetail', { h: num(hl), b: num(bm), v: num(vocab), tg: num(tags) }) });
  let free = -1;
  try {
    free = await LegacyFS.getFreeDiskStorageAsync();
  } catch {
    free = -1;
  }
  out.push({ id: 'storage', ok: free < 0 || free > 200 * 1024 * 1024, label: t('plus.diag.storage'), detail: free >= 0 ? t('plus.diag.free', { s: formatBytes(free) }) : '—' });
  const plugins = getMMKVObject<{ id: string; version: string }[]>(INSTALLED_PLUGINS_KEY) ?? [];
  out.push({ id: 'plugins', ok: true, label: t('plus.diag.plugins'), detail: t('plus.diag.pluginsDetail', { n: num(plugins.length) }) });
  out.push({ id: 'membership', ok: true, label: t('plus.diag.membership'), detail: tierName });
  const keys = MMKVStorage.getAllKeys().filter(k => k.startsWith('SARD_')).length;
  out.push({ id: 'settings', ok: true, label: t('plus.diag.settings'), detail: t('plus.diag.keys', { n: num(keys) }) });
  out.push({ id: 'version', ok: true, label: t('plus.diag.version'), detail: APP_VERSION });
  return out;
};

const RESETS = {
  reader: [plusReaderSettings, wpmStore],
  library: [smartFiltersStore, upNextStore, quoteStore],
  motivation: [achievementsStore, challengesStore, freezeStore],
  offline: [schedulerStore, cleanupStore],
  tools: [autoBackupStore, agentScheduleStore],
} as const;
type ResetArea = keyof typeof RESETS;

const DiagnosticsScreen = () => {
  const theme = useTheme();
  const m = useMembership();
  const { data, loading, reload } = useAsync(() => runChecks(m.tier), []);
  const [resetPick, setResetPick] = useState(false);

  const report = () =>
    [`سَرد ${APP_VERSION} — ${new Date().toISOString()}`, ...(data ?? []).map(c => `${c.ok ? '✓' : '✗'} ${c.label}: ${c.detail}`)].join('\n');

  return (
    <Screen title={tr(FEATURES['tools.diagnostics'].title)} testID="sard-diagnostics">
      {loading && !data ? <Muted theme={theme} style={styles.pad}>{t('common.loading')}</Muted> : null}
      <Card theme={theme}>
        {(data ?? []).map(c => (
          <View key={c.id} style={styles.row}>
            <MaterialCommunityIcons name={c.ok ? 'check-circle-outline' : 'alert-circle-outline'} size={20} color={c.ok ? theme.primary : theme.error} />
            <View style={styles.flex}>
              <Text style={{ color: theme.onSurface, fontSize: 15 }}>{c.label}</Text>
              <Text style={{ color: theme.onSurfaceVariant, fontSize: 12 }}>{c.detail}</Text>
            </View>
          </View>
        ))}
      </Card>
      <View style={[styles.pad, styles.btns]}>
        <Button mode="contained-tonal" icon="refresh" title={t('plus.diag.rerun')} onPress={reload} />
        <Button mode="outlined" icon="content-copy" title={t('plus.diag.copy')} onPress={() => Clipboard.setStringAsync(report()).then(() => showToast(t('common.copied')))} testID="sard-diag-copy" />
      </View>

      <SectionTitle theme={theme}>{tr(FEATURES['tools.resetSettings'].title)}</SectionTitle>
      <Row theme={theme} icon="restore" title={t('plus.diag.reset')} desc={tr(FEATURES['tools.resetSettings'].desc)} onPress={() => setResetPick(true)} />
      <ChoiceDialog<ResetArea>
        visible={resetPick}
        title={t('plus.diag.reset')}
        choices={(Object.keys(RESETS) as ResetArea[]).map(a => ({ value: a, label: t(`plus.diag.area.${a}` as any) }))}
        onDismiss={() => setResetPick(false)}
        onPick={a => {
          for (const s of RESETS[a]) MMKVStorage.remove(s.key);
          setResetPick(false);
          showToast(t('plus.diag.resetDone'));
        }}
      />
    </Screen>
  );
};

export default DiagnosticsScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: 16, paddingVertical: 8 },
  btns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
});
