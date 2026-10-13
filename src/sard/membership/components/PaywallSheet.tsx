/**
 * Paywall sheet shown when a gated feature is tapped: what the feature is,
 * which tier unlocks it (or which limit was reached) and how to get it
 * (owner code / 7-day Plus trial). Mounted once inside NavigationContainer.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { navigationRef } from '@navigators/ShareIntentHandler';
import { usePaywallStore } from '../paywallStore';
import { FEATURES, FEATURE_KEYS } from '../features';
import { TIER_META, tierRank, type Tier } from '../tiers';
import { membership, useMembership } from '../service';
import { TRIAL_DAYS, TRIAL_TIER } from '../entitlementStore';
import { num, t, tr } from '../../i18n';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const highlightsFor = (tier: Tier) => FEATURE_KEYS.filter(k => FEATURES[k].tier === tier).slice(0, 5);

export const PaywallSheet = () => {
  const theme = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { featureKey, result, close } = usePaywallStore();
  const m = useMembership();
  if (!featureKey) return null;
  const def = FEATURES[featureKey];
  const required = result?.requiredTier ?? def.tier;
  const meta = TIER_META[required];
  const reason = result?.reason ?? 'tier';
  const reasonText =
    reason === 'disabled'
      ? t('paywall.disabled')
      : reason === 'limit'
        ? t('paywall.limit', { limit: num(result?.limit ?? 0), tier: tr(TIER_META[m.tier].name) })
        : t('paywall.needs', { tier: tr(meta.name) });

  const go = (params?: object) => {
    close();
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('MoreStack', { screen: 'SardMembership', params });
    }
  };
  const canTrial = m.canStartTrial && tierRank(required) <= tierRank(TRIAL_TIER) && reason !== 'disabled';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('common.close')} />
      <View testID="sard-paywall" style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: bottom + 16 }]}>
        <View style={[styles.handle, { backgroundColor: theme.outlineVariant }]} />
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.iconWrap, { backgroundColor: meta.color }]}>
            <MaterialCommunityIcons name={def.icon as IconName} size={30} color={meta.onColor} />
          </View>
          <Text style={[styles.title, { color: theme.onSurface }]}>{tr(def.title)}</Text>
          <Text style={[styles.desc, { color: theme.onSurfaceVariant }]}>{tr(def.desc)}</Text>
          <View style={[styles.reason, { backgroundColor: theme.secondaryContainer }]}>
            <MaterialCommunityIcons
              name={reason === 'disabled' ? 'power-plug-off-outline' : 'lock-outline'}
              size={18}
              color={theme.onSecondaryContainer}
            />
            <Text style={[styles.reasonText, { color: theme.onSecondaryContainer }]}>{reasonText}</Text>
          </View>
          {reason !== 'disabled' ? (
            <>
              <Text style={[styles.section, { color: theme.primary }]}>{t('paywall.alsoIn', { tier: tr(meta.name) })}</Text>
              {highlightsFor(required).map(k => (
                <View key={k} style={styles.bullet}>
                  <MaterialCommunityIcons name="check" size={16} color={meta.color} />
                  <Text style={[styles.bulletText, { color: theme.onSurface }]}>{tr(FEATURES[k].title)}</Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
        <View style={styles.actions}>
          {reason !== 'disabled' ? (
            <>
              {canTrial ? (
                <Button
                  testID="sard-paywall-trial"
                  mode="contained"
                  icon="gift-outline"
                  title={t('paywall.trial', { days: num(TRIAL_DAYS) })}
                  onPress={() => {
                    const r = membership.startTrial();
                    showToast(r.ok ? t('membership.trialStarted') : t('membership.trialUsed'));
                    close();
                  }}
                />
              ) : null}
              <Button
                testID="sard-paywall-activate"
                mode={canTrial ? 'contained-tonal' : 'contained'}
                icon="ticket-confirmation-outline"
                title={t('paywall.haveCode')}
                onPress={() => go({ activate: true })}
              />
              <Button mode="text" title={t('paywall.compare')} onPress={() => go()} />
            </>
          ) : (
            <Button mode="contained-tonal" title={t('common.close')} onPress={close} />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '82%' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginVertical: 10 },
  body: { paddingHorizontal: 24, paddingBottom: 8 },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  desc: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 6 },
  reason: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, padding: 12, marginTop: 16 },
  reasonText: { flex: 1, fontSize: 14, lineHeight: 20 },
  section: { fontSize: 14, fontWeight: '600', marginTop: 18, marginBottom: 6 },
  bullet: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 3 },
  bulletText: { fontSize: 14 },
  actions: { paddingHorizontal: 24, gap: 8, paddingTop: 8 },
});
