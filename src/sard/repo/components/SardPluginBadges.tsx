/** «مستودع سَرد» badges under a plugin row: health, category, license, Arabic description, tags. */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import type { ThemeColors } from '@theme/types';
import { HEALTH_LABELS, isCompatible, type SardPluginMeta } from '../sardMeta';
import { isArabicUi, t } from '../../i18n';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export const SardPluginBadges = ({ meta, theme }: { meta?: SardPluginMeta; theme: ThemeColors }) => {
  if (!meta) return null;
  const health = meta.health ? HEALTH_LABELS[meta.health.status] : undefined;
  const compatible = isCompatible(meta);
  return (
    <View style={styles.wrap}>
      {meta.description_ar ? (
        <Text numberOfLines={2} style={[styles.desc, { color: theme.onSurfaceVariant }]}>
          {meta.description_ar}
        </Text>
      ) : null}
      <View style={styles.row}>
        {health ? (
          <View
            style={[styles.badge, { borderColor: health.color }]}
            accessibilityLabel={`${t('repo.health')}: ${isArabicUi() ? health.ar : health.en}`}
          >
            <MaterialCommunityIcons name={health.icon as IconName} size={12} color={health.color} />
            <Text style={[styles.badgeText, { color: health.color }]}>{isArabicUi() ? health.ar : health.en}</Text>
          </View>
        ) : null}
        {meta.category ? (
          <View style={[styles.badge, { backgroundColor: theme.secondaryContainer, borderColor: theme.secondaryContainer }]}>
            <Text style={[styles.badgeText, { color: theme.onSecondaryContainer }]}>{meta.category}</Text>
          </View>
        ) : null}
        {meta.license ? (
          <View style={[styles.badge, { borderColor: theme.outline }]}>
            <MaterialCommunityIcons name="scale-balance" size={12} color={theme.onSurfaceVariant} />
            <Text numberOfLines={1} style={[styles.badgeText, styles.license, { color: theme.onSurfaceVariant }]}>
              {meta.license}
            </Text>
          </View>
        ) : null}
        {meta.sha256 ? (
          <View style={[styles.badge, { borderColor: theme.outline }]} accessibilityLabel={t('repo.verified')}>
            <MaterialCommunityIcons name="shield-check-outline" size={12} color={theme.primary} />
            <Text style={[styles.badgeText, { color: theme.primary }]}>{t('repo.sha')}</Text>
          </View>
        ) : null}
        {!compatible ? (
          <View style={[styles.badge, { borderColor: theme.error }]}>
            <Text style={[styles.badgeText, { color: theme.error }]}>
              {t('repo.needsUpdate', { version: meta.minAppVersion })}
            </Text>
          </View>
        ) : null}
      </View>
      {meta.tags.length ? (
        <Text numberOfLines={1} style={[styles.tags, { color: theme.onSurfaceVariant }]}>
          {meta.tags.map(x => `#${x}`).join('  ')}
        </Text>
      ) : null}
    </View>
  );
};

export const CategoryFilterChips = ({
  categories,
  value,
  onChange,
  theme,
}: {
  categories: string[];
  value: string | null;
  onChange: (c: string | null) => void;
  theme: ThemeColors;
}) => {
  if (!categories.length) return null;
  const chip = (key: string, label: string, active: boolean, onPress: () => void) => (
    <Text
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        {
          color: active ? theme.onSecondaryContainer : theme.onSurfaceVariant,
          backgroundColor: active ? theme.secondaryContainer : 'transparent',
          borderColor: active ? theme.secondaryContainer : theme.outline,
        },
      ]}
    >
      {label}
    </Text>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {chip('__all', t('repo.allCategories'), value === null, () => onChange(null))}
      {categories.map(c => chip(c, c, value === c, () => onChange(value === c ? null : c)))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: 4, gap: 4 },
  desc: { fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 11, lineHeight: 16 },
  license: { maxWidth: 160 },
  tags: { fontSize: 11 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4, fontSize: 13, overflow: 'hidden' },
});
