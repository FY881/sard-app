/**
 * «التنزيل والأوفلاين»: storage per novel, delete read downloads, offline cap
 * (300 for free), download scheduler (Plus), smart cleanup (Plus),
 * integrity check, download by tag (Plus).
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { currentLimit, useEntitlement } from '../../membership/service';
import { FEATURES } from '../../membership/features';
import { isArabicUi, num, t, tr } from '../../i18n';
import { Card, Gated, Muted, ProgressBar, Row, Screen, SectionTitle, StatTile, SwitchRow, TierBadge, TileRow } from '../ui';
import { ChoiceDialog, Stepper, TextPromptDialog } from '../components/dialogs';
import { useAsync } from '../hooks';
import { checkDownloadIntegrity, deleteAllDownloadsOfNovel, deleteReadDownloads, downloadByTag, downloadedCount, getStorageByNovel, runSmartCleanup } from '../data';
import { listTags } from '../db';
import { cleanupStore, schedulerStore } from '../store';
import { formatBytes } from '../logic/offline';
import { parseHm } from '../logic/nightSchedule';

const StorageScreen = () => {
  const theme = useTheme();
  const ar = isArabicUi();
  const { data, loading, reload } = useAsync(async () => {
    const [storage, count, tags] = await Promise.all([getStorageByNovel(), downloadedCount(), listTags()]);
    return { ...storage, count, tags };
  }, []);
  const [sched, setSched] = schedulerStore.use();
  const [clean, setClean] = cleanupStore.use();
  const schedGate = useEntitlement('offline.scheduler');
  const byTagGate = useEntitlement('offline.bulkByTag');
  const [busy, setBusy] = useState<string | null>(null);
  const [tagPick, setTagPick] = useState(false);
  const [windowDialog, setWindowDialog] = useState<null | 'windowStart' | 'windowEnd'>(null);

  const cap = currentLimit('offlineChapters');
  const count = data?.count ?? 0;

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      showToast(await fn());
    } catch (e) {
      showToast(t('common.error', { error: String((e as Error)?.message ?? e) }));
    } finally {
      setBusy(null);
      reload();
    }
  };

  return (
    <Screen title={t('plus.offline.title')} testID="sard-storage">
      <TileRow>
        <StatTile theme={theme} icon="download-circle-outline" label={t('plus.offline.downloaded')} value={num(count)} />
        <StatTile theme={theme} icon="harddisk" label={t('plus.offline.used')} value={data ? formatBytes(data.totalBytes, ar) : '…'} />
        <StatTile theme={theme} icon="sd" label={t('plus.offline.free')} value={data?.freeBytes != null ? formatBytes(data.freeBytes, ar) : '—'} />
      </TileRow>

      <Card theme={theme}>
        <View style={styles.head}>
          <Text style={[styles.cardTitle, { color: theme.onSurface }]}>{tr(FEATURES['offline.unlimited'].title)}</Text>
          {cap !== Infinity ? <TierBadge tier="plus" small /> : null}
        </View>
        <Text style={{ color: theme.onSurface }} testID="sard-offline-cap">
          {cap === Infinity ? t('plus.offline.capUnlimited', { n: num(count) }) : t('plus.offline.cap', { n: num(count), cap: num(cap) })}
        </Text>
        {cap !== Infinity ? <ProgressBar theme={theme} value={count / cap} color={count >= cap ? theme.error : undefined} /> : null}
        <Muted theme={theme}>{tr(FEATURES['offline.unlimited'].desc)}</Muted>
      </Card>

      <SectionTitle theme={theme}>{tr(FEATURES['offline.storageManager'].title)}</SectionTitle>
      <View style={styles.pad}>
        <Button
          testID="sard-delete-read"
          mode="contained-tonal"
          icon="delete-sweep-outline"
          loading={busy === 'read'}
          title={t('plus.offline.deleteReadAll')}
          onPress={() => run('read', async () => t('plus.offline.deleted', { n: num(await deleteReadDownloads()) }))}
        />
      </View>
      {loading && !data ? <Muted theme={theme} style={styles.pad}>{t('common.loading')}</Muted> : null}
      {data && !data.novels.length ? <Muted theme={theme} style={styles.pad}>{t('plus.offline.none')}</Muted> : null}
      {data?.novels.map(n => (
        <Row
          key={n.novelId}
          theme={theme}
          icon="book-outline"
          title={n.name}
          desc={t('plus.offline.novelLine', {
            n: num(n.chapters),
            read: num(n.readChapters),
            size: n.bytes != null ? formatBytes(n.bytes, ar) : '—',
          })}
          right={
            <View style={styles.rowBtns}>
              {n.readChapters ? (
                <Button compact title={t('plus.offline.deleteRead')} onPress={() => run(`r${n.novelId}`, async () => t('plus.offline.deleted', { n: num(await deleteReadDownloads(n.novelId)) }))} />
              ) : null}
              <Button compact textColor={theme.error} title={t('plus.offline.deleteAll')} onPress={() => run(`a${n.novelId}`, async () => t('plus.offline.deleted', { n: num(await deleteAllDownloadsOfNovel(n.novelId)) }))} />
            </View>
          }
        />
      ))}

      <SectionTitle theme={theme}>{tr(FEATURES['offline.integrityCheck'].title)}</SectionTitle>
      <Muted theme={theme} style={styles.pad}>{tr(FEATURES['offline.integrityCheck'].desc)}</Muted>
      <View style={[styles.pad, styles.rowBtns]}>
        <Button
          testID="sard-integrity-check"
          mode="outlined"
          icon="file-check-outline"
          loading={busy === 'check'}
          title={t('plus.offline.check')}
          onPress={() => run('check', async () => {
            const r = await checkDownloadIntegrity(false);
            return t('plus.offline.checked', { n: num(r.checked), broken: num(r.broken) });
          })}
        />
        <Button
          mode="outlined"
          icon="wrench-outline"
          loading={busy === 'fix'}
          title={t('plus.offline.fix')}
          onPress={() => run('fix', async () => {
            const r = await checkDownloadIntegrity(true);
            return t('plus.offline.fixed', { n: num(r.broken) });
          })}
        />
      </View>

      <SectionTitle theme={theme}>{tr(FEATURES['offline.scheduler'].title)}</SectionTitle>
      <SwitchRow
        icon="calendar-clock"
        label={t('plus.offline.schedOn')}
        desc={tr(FEATURES['offline.scheduler'].desc)}
        value={sched.enabled}
        feature="offline.scheduler"
        onChange={v => setSched({ ...sched, enabled: v })}
        testID="sard-sched-toggle"
      />
      {sched.enabled && schedGate.allowed ? (
        <>
          <SwitchRow icon="wifi" label={t('plus.offline.wifiOnly')} value={sched.wifiOnly} onChange={v => setSched({ ...sched, wifiOnly: v })} />
          <SwitchRow icon="battery-charging" label={t('plus.offline.chargingOnly')} value={sched.chargingOnly} onChange={v => setSched({ ...sched, chargingOnly: v })} />
          <Row theme={theme} icon="clock-start" title={t('plus.offline.windowStart')} desc={sched.windowStart ?? t('plus.offline.anyTime')} onPress={() => setWindowDialog('windowStart')} />
          <Row theme={theme} icon="clock-end" title={t('plus.offline.windowEnd')} desc={sched.windowEnd ?? t('plus.offline.anyTime')} onPress={() => setWindowDialog('windowEnd')} />
          {sched.windowStart || sched.windowEnd ? (
            <View style={styles.pad}>
              <Button compact title={t('plus.offline.clearWindow')} onPress={() => setSched({ ...sched, windowStart: undefined, windowEnd: undefined })} />
            </View>
          ) : null}
          <Muted theme={theme} style={styles.pad}>{t('plus.offline.schedHelp')}</Muted>
        </>
      ) : null}

      <SectionTitle theme={theme}>{tr(FEATURES['offline.smartCleanup'].title)}</SectionTitle>
      <SwitchRow
        icon="broom"
        label={t('plus.offline.cleanOn')}
        desc={tr(FEATURES['offline.smartCleanup'].desc)}
        value={clean.enabled}
        feature="offline.smartCleanup"
        onChange={v => setClean({ ...clean, enabled: v })}
      />
      <Gated feature="offline.smartCleanup" compact>
        <Row theme={theme} icon="calendar-range" title={t('plus.offline.cleanDays')}
          right={<Stepper value={clean.days} min={1} max={180} step={1} format={v => t('common.days', { n: num(v) })} onChange={v => setClean({ ...clean, days: v })} />}
        />
        <SwitchRow icon="bookmark-outline" label={t('plus.offline.keepBookmarked')} value={clean.keepBookmarked} onChange={v => setClean({ ...clean, keepBookmarked: v })} />
        <View style={[styles.pad, styles.rowBtns]}>
          <Button mode="outlined" title={t('plus.offline.preview')} onPress={() => run('prev', async () => t('plus.offline.wouldDelete', { n: num(await runSmartCleanup(clean, true)) }))} />
          <Button mode="contained-tonal" loading={busy === 'clean'} title={t('plus.offline.cleanNow')} onPress={() => run('clean', async () => {
            const n = await runSmartCleanup(clean);
            setClean({ ...cleanupStore.get(), lastRunAt: Date.now() });
            return t('plus.offline.deleted', { n: num(n) });
          })} />
        </View>
      </Gated>

      <SectionTitle theme={theme}>{tr(FEATURES['offline.bulkByTag'].title)}</SectionTitle>
      <Row
        theme={theme}
        icon="tag-arrow-down-outline"
        title={t('plus.offline.byTag')}
        desc={tr(FEATURES['offline.bulkByTag'].desc)}
        onPress={() => byTagGate.gate() && setTagPick(true)}
        right={!byTagGate.allowed ? <TierBadge tier={byTagGate.requiredTier} small /> : undefined}
      />

      <ChoiceDialog
        visible={tagPick}
        title={t('plus.offline.byTag')}
        choices={(data?.tags ?? []).map(x => ({ value: x.name, label: `#${x.name}`, desc: t('plus.offline.tagNovels', { n: num(x.count) }) }))}
        onDismiss={() => setTagPick(false)}
        onPick={v => {
          setTagPick(false);
          run('tag', async () => t('plus.offline.queued', { n: num(await downloadByTag(String(v), cap)) }));
        }}
      />
      <TextPromptDialog
        visible={!!windowDialog}
        title={windowDialog === 'windowEnd' ? t('plus.offline.windowEnd') : t('plus.offline.windowStart')}
        label="HH:MM"
        initial={windowDialog ? sched[windowDialog] ?? '' : ''}
        onDismiss={() => setWindowDialog(null)}
        onSubmit={v => {
          const clean2 = v.trim().replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
          if (parseHm(clean2) === null) {
            showToast(t('plus.reading.badTime'));
            return;
          }
          if (windowDialog) setSched({ ...sched, [windowDialog]: clean2 });
          setWindowDialog(null);
        }}
      />
    </Screen>
  );
};

export default StorageScreen;

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingVertical: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  rowBtns: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
});
