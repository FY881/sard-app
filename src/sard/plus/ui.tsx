/**
 * Shared UI for Sard 1.1 screens, built on LNReader components and theme
 * tokens (Appbar, Switch, SafeAreaView) so new screens look native.
 */
import React from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useNavigation } from '@react-navigation/native';
import { Appbar, SafeAreaView } from '@components';
import Switch from '@components/Switch/Switch';
import { useTheme } from '@hooks/persisted';
import type { ThemeColors } from '@theme/types';
import { Card, Muted, SectionTitle } from '../ai/components/ui';
import { FEATURES, type FeatureKey } from '../membership/features';
import { TIER_META, type Tier } from '../membership/tiers';
import { useEntitlement } from '../membership/service';
import { openPaywall } from '../membership/paywallStore';
import { t, tr } from '../i18n';

export { Card, Muted, SectionTitle };

/** Progress track in the primary colour (completion is not an error here). */
export const ProgressBar = ({ theme, value, style, color }: { theme: ThemeColors; value: number; style?: StyleProp<ViewStyle>; color?: string }) => (
  <View style={[styles.track, { backgroundColor: theme.surfaceVariant }, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.max(0, Math.min(1, value)) * 100) }}>
    <View style={[styles.fill, { backgroundColor: color ?? theme.primary, width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }]} />
  </View>
);
export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export const Screen = ({
  title,
  children,
  scroll = true,
  right,
  testID,
}: {
  title: string;
  children: React.ReactNode;
  scroll?: boolean;
  right?: React.ReactNode;
  testID?: string;
}) => {
  const theme = useTheme();
  const navigation = useNavigation();
  return (
    <SafeAreaView excludeTop>
      <Appbar title={title} handleGoBack={navigation.goBack} theme={theme}>
        {right}
      </Appbar>
      {scroll ? (
        <ScrollView testID={testID} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View testID={testID} style={styles.flex}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
};

export const TierBadge = ({ tier, small, style }: { tier: Tier; small?: boolean; style?: StyleProp<ViewStyle> }) => {
  const meta = TIER_META[tier];
  return (
    <View
      style={[styles.tierBadge, small && styles.tierBadgeSmall, { backgroundColor: meta.color }, style]}
      accessibilityLabel={tr(meta.name)}
    >
      <MaterialCommunityIcons name={meta.icon as IconName} size={small ? 11 : 14} color={meta.onColor} />
      <Text style={[styles.tierText, small && styles.tierTextSmall, { color: meta.onColor }]}>{tr(meta.name)}</Text>
    </View>
  );
};

export const Row = ({
  icon,
  title,
  desc,
  onPress,
  onLongPress,
  right,
  theme,
  testID,
  titleStyle,
}: {
  icon?: IconName;
  title: string;
  desc?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  right?: React.ReactNode;
  theme: ThemeColors;
  testID?: string;
  titleStyle?: StyleProp<TextStyle>;
}) => (
  <Pressable
    testID={testID}
    onPress={onPress}
    onLongPress={onLongPress}
    disabled={!onPress && !onLongPress}
    android_ripple={{ color: theme.rippleColor }}
    style={styles.row}
    accessibilityRole={onPress ? 'button' : undefined}
  >
    {icon ? <MaterialCommunityIcons name={icon} size={22} color={theme.onSurfaceVariant} style={styles.rowIcon} /> : null}
    <View style={styles.flex}>
      <Text style={[styles.rowTitle, { color: theme.onSurface }, titleStyle]}>{title}</Text>
      {desc ? <Text style={[styles.rowDesc, { color: theme.onSurfaceVariant }]}>{desc}</Text> : null}
    </View>
    {right}
  </Pressable>
);

/** A switch row; when `feature` is locked, turning it on opens the paywall. */
export const SwitchRow = ({
  label,
  desc,
  value,
  onChange,
  feature,
  icon,
  testID,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  feature?: FeatureKey;
  icon?: IconName;
  testID?: string;
}) => {
  const theme = useTheme();
  const gate = useEntitlement(feature ?? 'tools.featureDirectory');
  const locked = !!feature && !gate.allowed;
  const toggle = () => {
    if (locked && !value) {
      gate.gate();
      return;
    }
    onChange(!value);
  };
  return (
    <Row
      testID={testID}
      theme={theme}
      icon={icon}
      title={label}
      desc={desc}
      onPress={toggle}
      right={
        <View style={styles.rowRight}>
          {locked ? <TierBadge tier={gate.requiredTier} small /> : null}
          <Switch value={locked ? false : value} onValueChange={toggle} accessibilityLabel={label} />
        </View>
      }
    />
  );
};

/** Shown in place of locked content: explains and opens the paywall. */
export const GateCard = ({ feature, compact }: { feature: FeatureKey; compact?: boolean }) => {
  const theme = useTheme();
  const gate = useEntitlement(feature);
  if (gate.allowed) return null;
  const def = FEATURES[feature];
  return (
    <Card theme={theme} onPress={() => openPaywall(feature, gate)}>
      <View style={styles.gateHead}>
        <MaterialCommunityIcons
          name={gate.reason === 'disabled' ? 'power-plug-off-outline' : 'lock-outline'}
          size={20}
          color={theme.primary}
        />
        <Text style={[styles.gateTitle, { color: theme.onSurface }]}>{tr(def.title)}</Text>
        {gate.reason !== 'disabled' ? <TierBadge tier={gate.requiredTier} small /> : null}
      </View>
      {!compact ? <Muted theme={theme}>{tr(def.desc)}</Muted> : null}
      <Text style={[styles.gateAction, { color: theme.primary }]}>
        {gate.reason === 'disabled'
          ? t('gate.disabled')
          : t('gate.unlockWith', { tier: tr(TIER_META[gate.requiredTier].name) })}
      </Text>
    </Card>
  );
};

/** Renders children only when the feature is allowed, else a GateCard. */
export const Gated = ({ feature, children, compact }: { feature: FeatureKey; children: React.ReactNode; compact?: boolean }) => {
  const gate = useEntitlement(feature);
  return gate.allowed ? <>{children}</> : <GateCard feature={feature} compact={compact} />;
};

export const StatTile = ({ label, value, theme, icon }: { label: string; value: string; theme: ThemeColors; icon?: IconName }) => (
  <View style={[styles.tile, { backgroundColor: theme.surfaceContainerHigh ?? theme.surfaceVariant }]}>
    {icon ? <MaterialCommunityIcons name={icon} size={18} color={theme.primary} /> : null}
    <Text style={[styles.tileValue, { color: theme.onSurface }]}>{value}</Text>
    <Text style={[styles.tileLabel, { color: theme.onSurfaceVariant }]} numberOfLines={2}>
      {label}
    </Text>
  </View>
);

export const TileRow = ({ children }: { children: React.ReactNode }) => <View style={styles.tiles}>{children}</View>;

export const Empty = ({ icon, text, theme }: { icon: IconName; text: string; theme: ThemeColors }) => (
  <View style={styles.empty}>
    <MaterialCommunityIcons name={icon} size={48} color={theme.onSurfaceVariant} />
    <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>{text}</Text>
  </View>
);

export const ChipsRow = ({ children }: { children: React.ReactNode }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
    {children}
  </ScrollView>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginVertical: 4 },
  fill: { height: 6, borderRadius: 3 },
  content: { paddingBottom: 40, paddingTop: 4 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  tierBadgeSmall: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  tierText: { fontSize: 13, fontWeight: '700' },
  tierTextSmall: { fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 16 },
  rowIcon: { width: 24 },
  rowTitle: { fontSize: 16 },
  rowDesc: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gateHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  gateTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  gateAction: { marginTop: 8, fontWeight: '600' },
  tile: { flex: 1, minWidth: 96, borderRadius: 12, padding: 12, gap: 2, alignItems: 'flex-start' },
  tileValue: { fontSize: 20, fontWeight: '700' },
  tileLabel: { fontSize: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginVertical: 8 },
  empty: { alignItems: 'center', padding: 32, gap: 12 },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 22 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
});

/** Wraps a whole screen: shows a GateCard (with app bar) instead when the feature is locked. */
export const withGate = <P extends object>(Component: React.ComponentType<P>, feature: FeatureKey) => {
  const GatedScreen = (props: P) => {
    const gate = useEntitlement(feature);
    if (gate.allowed) return <Component {...props} />;
    return (
      <Screen title={tr(FEATURES[feature].title)} testID="sard-gated-screen">
        <GateCard feature={feature} />
      </Screen>
    );
  };
  GatedScreen.displayName = `Gated(${Component.displayName ?? Component.name ?? 'Screen'})`;
  return GatedScreen;
};
