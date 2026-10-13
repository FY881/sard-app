/** «العضوية» hub: current plan, expiry, activate/scan/restore, trial, compare table, benefits. */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import * as Clipboard from 'expo-clipboard';
import { Dialog, Portal, TextInput } from 'react-native-paper';
import dayjs from 'dayjs';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { Card, ChipsRow, Muted, Row, Screen, SectionTitle, TierBadge } from '../../plus/ui';
import { ActivateCodeDialog } from '../components/ActivateCodeDialog';
import { MemberBadge, MemberBadgeLabel } from '../components/MemberBadge';
import { membership, useMembership } from '../service';
import { TIER_MATRIX } from '../matrix';
import { FEATURES, FEATURE_KEYS } from '../features';
import { TIERS, TIER_META, type Tier } from '../tiers';
import { TRIAL_DAYS, type EntitlementSource } from '../entitlementStore';
import { num, t, tr } from '../../i18n';

const sourceLabel = (s: EntitlementSource) =>
  s === 'trial' ? t('membership.source.trial') : s === 'admin' ? t('membership.source.admin') : t('membership.source.code');

const MembershipHubScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const m = useMembership();
  const [activateOpen, setActivateOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreText, setRestoreText] = useState('');
  const [selectedTier, setSelectedTier] = useState<Tier>(m.tier === 'free' ? 'plus' : m.tier);

  useEffect(() => {
    if (route.params?.activate) setActivateOpen(true);
  }, [route.params?.activate]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const codes = useMemo(() => membership.getState().entitlements, [m]);
  const meta = TIER_META[m.tier];

  const statusLine = () => {
    if (m.status === 'free') return t('membership.statusFree');
    if (m.status === 'grace') return t('membership.statusGrace', { days: num(m.daysLeft ?? 0) });
    if (m.expiresAt === null) return t('membership.lifetime');
    return t('membership.expires', { date: dayjs(m.expiresAt).format('LL'), days: num(m.daysLeft ?? 0) });
  };

  const benefits = FEATURE_KEYS.filter(k => FEATURES[k].tier === selectedTier);

  return (
    <Screen title={t('membership.title')} testID="sard-membership">
      <Card theme={theme} style={[styles.planCard, { borderColor: meta.color }]}>
        <View style={styles.planHead}>
          <MemberBadge tier={m.tier} size={52} />
          <View style={styles.flex}>
            <Muted theme={theme}>{t('membership.current')}</Muted>
            <View style={styles.planTitleRow}>
              <TierBadge tier={m.tier} />
              {m.entitlement ? <Muted theme={theme}>{sourceLabel(m.entitlement.source)}</Muted> : null}
            </View>
            <MemberBadgeLabel tier={m.tier} />
          </View>
        </View>
        <Text style={[styles.status, { color: m.status === 'grace' ? theme.error : theme.onSurface }]}>{statusLine()}</Text>
        {m.devOverride ? <Text style={{ color: theme.error }}>{t('membership.devOverride')}</Text> : null}
        <Text style={[styles.tagline, { color: theme.onSurfaceVariant }]}>{tr(meta.tagline)}</Text>
      </Card>

      <View style={styles.actions}>
        <Button
          testID="sard-open-activate"
          mode="contained"
          icon="ticket-confirmation-outline"
          title={t('membership.activateCode')}
          onPress={() => setActivateOpen(true)}
        />
        {m.canStartTrial ? (
          <>
            <Button
              testID="sard-start-trial"
              mode="contained-tonal"
              icon="gift-outline"
              title={t('membership.trial', { days: num(TRIAL_DAYS) })}
              onPress={() => {
                const r = membership.startTrial();
                showToast(r.ok ? t('membership.trialStarted') : t('membership.trialUsed'));
              }}
            />
            <Muted theme={theme} style={styles.center}>
              {t('membership.trialHelp')}
            </Muted>
          </>
        ) : null}
      </View>

      <Row
        theme={theme}
        icon="cellphone-key"
        title={`${t('membership.deviceId')}: ${m.deviceId}`}
        desc={t('membership.deviceIdHelp')}
        onPress={() => Clipboard.setStringAsync(m.deviceId).then(() => showToast(t('common.copied')))}
        right={<MaterialCommunityIcons name="content-copy" size={20} color={theme.onSurfaceVariant} />}
      />
      <Row theme={theme} icon="backup-restore" title={t('membership.restore')} desc={t('membership.restoreHelp')} onPress={() => setRestoreOpen(true)} />
      <Row
        theme={theme}
        icon="view-grid-plus-outline"
        title={t('membership.allFeatures')}
        onPress={() => navigation.navigate('MoreStack', { screen: 'SardFeatures' })}
      />

      <SectionTitle theme={theme}>{t('membership.compare')}</SectionTitle>
      <View style={[styles.table, { borderColor: theme.outlineVariant }]} testID="sard-tier-table">
        <View style={styles.cellsRow}>
          {TIERS.map(tier => (
            <View key={tier} style={styles.cell}>
              <TierBadge tier={tier} small />
            </View>
          ))}
        </View>
        {TIER_MATRIX.map((row, i) => (
          <View key={i} style={[styles.tableRow, { borderTopColor: theme.outlineVariant }]}>
            <Text style={[styles.rowLabel, { color: theme.onSurface }]}>{tr(row.label)}</Text>
            <View style={styles.cellsRow}>
              {TIERS.map(tier => {
                const c = row.cells[tier];
                return (
                  <View key={tier} style={[styles.cell, m.tier === tier && { backgroundColor: theme.secondaryContainer }]}>
                    {c === true ? (
                      <MaterialCommunityIcons name="check-bold" size={16} color={TIER_META[tier].color} />
                    ) : c === false ? (
                      <MaterialCommunityIcons name="minus" size={16} color={theme.outline} />
                    ) : (
                      <Text style={[styles.cellText, { color: theme.onSurface }]}>{tr(c)}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      <SectionTitle theme={theme}>{t('membership.benefits', { tier: tr(TIER_META[selectedTier].name) })}</SectionTitle>
      <ChipsRow>
        {TIERS.map(tier => (
          <Button
            key={tier}
            compact
            mode={tier === selectedTier ? 'contained' : 'outlined'}
            title={`${tr(TIER_META[tier].name)} · ${num(FEATURE_KEYS.filter(k => FEATURES[k].tier === tier).length)}`}
            onPress={() => setSelectedTier(tier)}
          />
        ))}
      </ChipsRow>
      {benefits.map(k => (
        <Row key={k} theme={theme} icon={FEATURES[k].icon as any} title={tr(FEATURES[k].title)} desc={tr(FEATURES[k].desc)} />
      ))}

      {codes.length ? (
        <>
          <SectionTitle theme={theme}>{t('membership.codes')}</SectionTitle>
          {codes.map(e => (
            <Row
              key={e.codeId}
              theme={theme}
              icon={e.source === 'trial' ? 'gift-outline' : 'ticket-confirmation-outline'}
              title={`${tr(TIER_META[e.tier].name)} · ${e.codeId}`}
              desc={`${sourceLabel(e.source)} · ${e.expiresAt ? dayjs(e.expiresAt).format('LL') : t('membership.lifetime')}`}
              right={
                e.source !== 'trial' ? (
                  <Button compact title={t('membership.removeCode')} onPress={() => membership.remove(e.codeId)} />
                ) : undefined
              }
            />
          ))}
        </>
      ) : null}

      <Card theme={theme}>
        <Text style={[styles.howTitle, { color: theme.onSurface }]}>{t('membership.howToGet')}</Text>
        <Muted theme={theme}>{t('membership.howToGetBody')}</Muted>
      </Card>

      {__DEV__ ? (
        <Card theme={theme}>
          <Text style={[styles.howTitle, { color: theme.error }]}>{t('membership.devOverride')}</Text>
          <View style={styles.wrapRow}>
            {TIERS.map(tier => (
              <Button key={tier} compact mode="outlined" title={tr(TIER_META[tier].name)} onPress={() => membership.setDevTier(tier)} />
            ))}
            <Button compact title="×" onPress={() => membership.setDevTier(undefined)} />
          </View>
        </Card>
      ) : null}

      <ActivateCodeDialog visible={activateOpen} onDismiss={() => setActivateOpen(false)} />
      <Portal>
        <Dialog visible={restoreOpen} onDismiss={() => setRestoreOpen(false)} style={{ backgroundColor: theme.overlay3 }}>
          <Dialog.Title style={{ color: theme.onSurface }}>{t('membership.restore')}</Dialog.Title>
          <Dialog.Content>
            <Muted theme={theme}>{t('membership.restoreHelp')}</Muted>
            <TextInput
              mode="outlined"
              multiline
              numberOfLines={6}
              value={restoreText}
              onChangeText={setRestoreText}
              theme={{ colors: { ...theme } }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button title={t('common.cancel')} onPress={() => setRestoreOpen(false)} />
            <Button
              mode="contained"
              title={t('membership.restore')}
              onPress={() => {
                const lines = restoreText.split(/\n+/).map(s => s.trim()).filter(Boolean);
                const r = membership.restore(lines);
                showToast(t('membership.restored', { n: num(r.restored), failed: num(r.failed) }));
                setRestoreOpen(false);
                setRestoreText('');
              }}
            />
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
};

export default MembershipHubScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  planCard: { borderWidth: 2 },
  planHead: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  status: { fontSize: 15, fontWeight: '600', marginTop: 10 },
  tagline: { fontSize: 13, lineHeight: 20, marginTop: 4 },
  actions: { paddingHorizontal: 16, gap: 8, marginVertical: 8 },
  center: { textAlign: 'center' },
  table: { marginHorizontal: 12, borderWidth: 1, borderRadius: 12, overflow: 'hidden', paddingTop: 8 },
  tableRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6, marginTop: 6 },
  rowLabel: { fontSize: 13, paddingHorizontal: 10, paddingBottom: 4, fontWeight: '600' },
  cellsRow: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, paddingHorizontal: 2, borderRadius: 6 },
  cellText: { fontSize: 12, textAlign: 'center' },
  wrapRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  howTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
});
