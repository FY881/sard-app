/** «العضوية» entry on the More screen: member badge frame, tier, expiry, plus the «سَرد+» hub entry. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useTheme } from '@hooks/persisted';
import { MemberBadge } from './MemberBadge';
import { useMembership } from '../service';
import { TIER_META } from '../tiers';
import { num, t, tr } from '../../i18n';
import { TierBadge } from '../../plus/ui';

export const MoreMembershipRows = ({ onMembership, onPlus }: { onMembership: () => void; onPlus: () => void }) => {
  const theme = useTheme();
  const m = useMembership();
  const status =
    m.status === 'free'
      ? t('membership.statusFree')
      : m.status === 'grace'
        ? t('membership.statusGrace', { days: num(m.daysLeft ?? 0) })
        : m.expiresAt === null
          ? t('membership.lifetime')
          : t('plus.more.daysLeft', { n: num(m.daysLeft ?? 0) });
  return (
    <View>
      <Pressable testID="more-membership" onPress={onMembership} android_ripple={{ color: theme.rippleColor }} style={styles.row}>
        {m.tier === 'free' ? (
          <MaterialCommunityIcons name="crown-outline" size={24} color={theme.primary} style={styles.icon} />
        ) : (
          <MemberBadge tier={m.tier} size={36} />
        )}
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.onSurface }]}>{t('membership.title')}</Text>
          <Text style={[styles.desc, { color: theme.onSurfaceVariant }]}>{`${tr(TIER_META[m.tier].name)} · ${status}`}</Text>
        </View>
        <TierBadge tier={m.tier} small />
      </Pressable>
      <Pressable testID="more-sard-plus" onPress={onPlus} android_ripple={{ color: theme.rippleColor }} style={styles.row}>
        <MaterialCommunityIcons name="star-four-points-outline" size={24} color={theme.primary} style={styles.icon} />
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.onSurface }]}>{t('plus.hub.title')}</Text>
          <Text style={[styles.desc, { color: theme.onSurfaceVariant }]}>{t('plus.more.plusDesc')}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-left" size={22} color={theme.onSurfaceVariant} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  icon: { width: 36, textAlign: 'center' },
  flex: { flex: 1 },
  title: { fontSize: 16 },
  desc: { fontSize: 12, lineHeight: 18, marginTop: 2 },
});
