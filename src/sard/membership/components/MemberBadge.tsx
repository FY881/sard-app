/** Membership badge / profile frame: silver (Plus), gold (Pro), animated legend. */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { TIER_META, type Tier } from '../tiers';
import { tr } from '../../i18n';
import { sardFlags } from '../service';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export const MemberBadge = ({ tier, size = 44 }: { tier: Tier; size?: number }) => {
  const meta = TIER_META[tier];
  const spin = useSharedValue(0);
  const animated = meta.animatedBadge;
  useEffect(() => {
    if (animated) spin.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1);
  }, [animated, spin]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  if (tier === 'free' || !sardFlags.isEnabled('custom.memberBadge')) return null;
  const c =
    tier === 'legend' ? ['#9B4DCA', '#E0B15C', '#47C49A', '#5FA8D3'] : [meta.color, meta.color, meta.color, meta.color];
  return (
    <View style={[styles.wrap, { width: size, height: size }]} accessibilityLabel={tr(meta.badge ?? meta.name)}>
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderTopColor: c[0],
            borderRightColor: c[1],
            borderBottomColor: c[2],
            borderLeftColor: c[3],
          },
          animated ? ring : null,
        ]}
      />
      <MaterialCommunityIcons name={meta.icon as IconName} size={size * 0.5} color={meta.color} />
    </View>
  );
};

export const MemberBadgeLabel = ({ tier }: { tier: Tier }) => {
  const meta = TIER_META[tier];
  if (!meta.badge) return null;
  return <Text style={[styles.label, { color: meta.color }]}>{tr(meta.badge)}</Text>;
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 3 },
  label: { fontSize: 12, fontWeight: '700' },
});
