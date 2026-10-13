/**
 * Small shared UI pieces for Sard AI/agents, styled with LNReader's theme
 * tokens (surface containers, primary accents, outline text) so they blend
 * with the existing look.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import type { ThemeColors } from '@theme/types';
import { Button } from '@components';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export const Card = ({
  theme,
  children,
  style,
  onPress,
  testID,
}: {
  theme: ThemeColors;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  testID?: string;
}) => {
  const body = (
    <View
      testID={onPress ? undefined : testID}
      style={[
        styles.card,
        { backgroundColor: theme.surfaceContainerHigh ?? theme.surfaceVariant },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      android_ripple={{ color: theme.rippleColor }}
      style={styles.pressCard}
    >
      {body}
    </Pressable>
  );
};

export const SectionTitle = ({
  theme,
  children,
}: {
  theme: ThemeColors;
  children: React.ReactNode;
}) => (
  <Text style={[styles.sectionTitle, { color: theme.primary }]}>{children}</Text>
);

export const Muted = ({
  theme,
  children,
  style,
  numberOfLines,
}: {
  theme: ThemeColors;
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) => (
  <Text
    numberOfLines={numberOfLines}
    style={[styles.muted, { color: theme.onSurfaceVariant }, style]}
  >
    {children}
  </Text>
);

export const Pill = ({
  theme,
  label,
  icon,
  active,
  onPress,
}: {
  theme: ThemeColors;
  label: string;
  icon?: IconName;
  active?: boolean;
  onPress?: () => void;
}) => (
  <Pressable
    onPress={onPress}
    android_ripple={{ color: theme.rippleColor, borderless: false }}
    style={[
      styles.pill,
      {
        backgroundColor: active ? theme.secondaryContainer : 'transparent',
        borderColor: active ? theme.secondaryContainer : theme.outline,
      },
    ]}
  >
    {icon ? (
      <MaterialCommunityIcons
        name={icon}
        size={16}
        color={active ? theme.onSecondaryContainer : theme.onSurfaceVariant}
        style={styles.pillIcon}
      />
    ) : null}
    <Text
      style={[
        styles.pillText,
        { color: active ? theme.onSecondaryContainer : theme.onSurfaceVariant },
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

/** Renders model output: headings (#), bullets (•, -, *), **bold**. */
export const MarkdownText = ({
  theme,
  text,
  selectable = true,
}: {
  theme: ThemeColors;
  text: string;
  selectable?: boolean;
}) => {
  const lines = text.replace(/\r/g, '').split('\n');
  const renderInline = (s: string, key: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**') ? (
        <Text key={`${key}-${i}`} style={styles.bold}>
          {p.slice(2, -2)}
        </Text>
      ) : (
        <Text key={`${key}-${i}`}>{p}</Text>
      ),
    );
  };
  return (
    <View>
      {lines.map((raw, idx) => {
        const line = raw.trim();
        if (!line) return <View key={idx} style={styles.gap} />;
        const heading = line.match(/^#{1,4}\s+(.*)$/);
        if (heading) {
          return (
            <Text
              key={idx}
              selectable={selectable}
              style={[styles.mdHeading, { color: theme.onSurface }]}
            >
              {renderInline(heading[1], `h${idx}`)}
            </Text>
          );
        }
        const bullet = line.match(/^(?:[•\-*]|\d+[.)])\s+(.*)$/);
        if (bullet) {
          return (
            <View key={idx} style={styles.bulletRow}>
              <Text style={[styles.bulletDot, { color: theme.primary }]}>•</Text>
              <Text
                selectable={selectable}
                style={[styles.mdText, styles.flex, { color: theme.onSurface }]}
              >
                {renderInline(bullet[1], `b${idx}`)}
              </Text>
            </View>
          );
        }
        return (
          <Text
            key={idx}
            selectable={selectable}
            style={[styles.mdText, { color: theme.onSurface }]}
          >
            {renderInline(line, `p${idx}`)}
          </Text>
        );
      })}
    </View>
  );
};

export const Notice = ({
  theme,
  icon = 'information-outline',
  title,
  body,
  actionLabel,
  onAction,
  tone = 'neutral',
}: {
  theme: ThemeColors;
  icon?: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'error' | 'success';
}) => {
  const bg =
    tone === 'error'
      ? theme.errorContainer
      : tone === 'success'
      ? theme.tertiaryContainer
      : theme.secondaryContainer;
  const fg =
    tone === 'error'
      ? theme.onErrorContainer
      : tone === 'success'
      ? theme.onTertiaryContainer
      : theme.onSecondaryContainer;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <View style={styles.noticeHeader}>
        <MaterialCommunityIcons name={icon} size={20} color={fg} />
        <Text style={[styles.noticeTitle, { color: fg }]}>{title}</Text>
      </View>
      {body ? <Text style={[styles.noticeBody, { color: fg }]}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.noticeAction}>
          <Button mode="contained-tonal" title={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
};

export const ProgressBar = ({
  theme,
  value,
  style,
}: {
  theme: ThemeColors;
  value: number;
  style?: StyleProp<ViewStyle>;
}) => (
  <View
    style={[styles.progressTrack, { backgroundColor: theme.surfaceVariant }, style]}
  >
    <View
      style={[
        styles.progressFill,
        {
          backgroundColor: value >= 1 ? theme.error : theme.primary,
          width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`,
        },
      ]}
    />
  </View>
);

export const LoadingRow = ({
  theme,
  label,
  onCancel,
  cancelLabel,
}: {
  theme: ThemeColors;
  label: string;
  onCancel?: () => void;
  cancelLabel?: string;
}) => (
  <View style={styles.loadingRow}>
    <ActivityIndicator color={theme.primary} />
    <Muted theme={theme} style={styles.loadingText}>
      {label}
    </Muted>
    {onCancel ? (
      <Button mode="text" title={cancelLabel} onPress={onCancel} compact />
    ) : null}
  </View>
);

export const Stepper = ({
  theme,
  label,
  description,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  theme: ThemeColors;
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) => (
  <View style={styles.stepper}>
    <View style={styles.flex}>
      <Text style={[styles.stepperLabel, { color: theme.onSurface }]}>{label}</Text>
      {description ? <Muted theme={theme}>{description}</Muted> : null}
    </View>
    <Pressable
      accessibilityLabel="-"
      onPress={() => onChange(Math.max(min, value - step))}
      style={[styles.stepBtn, { borderColor: theme.outline }]}
    >
      <MaterialCommunityIcons name="minus" size={18} color={theme.onSurface} />
    </Pressable>
    <Text style={[styles.stepValue, { color: theme.onSurface }]}>
      {format ? format(value) : value}
    </Text>
    <Pressable
      accessibilityLabel="+"
      onPress={() => onChange(Math.min(max, value + step))}
      style={[styles.stepBtn, { borderColor: theme.outline }]}
    >
      <MaterialCommunityIcons name="plus" size={18} color={theme.onSurface} />
    </Pressable>
  </View>
);

export const formatRelativeAr = (ts?: number | null) => {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.round(h / 24);
  return `قبل ${d} يوم`;
};

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, marginHorizontal: 16, marginVertical: 6 },
  pressCard: { borderRadius: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 6,
  },
  muted: { fontSize: 13, lineHeight: 20 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginEnd: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  pillIcon: { marginEnd: 6 },
  pillText: { fontSize: 13, fontWeight: '500' },
  bold: { fontWeight: '700' },
  gap: { height: 8 },
  mdHeading: { fontSize: 16, fontWeight: '700', marginTop: 6, marginBottom: 4 },
  mdText: { fontSize: 15, lineHeight: 25 },
  bulletRow: { flexDirection: 'row', marginVertical: 2 },
  bulletDot: { fontSize: 15, lineHeight: 25, marginEnd: 8 },
  flex: { flex: 1 },
  notice: { borderRadius: 16, padding: 16, marginHorizontal: 16, marginVertical: 8 },
  noticeHeader: { flexDirection: 'row', alignItems: 'center' },
  noticeTitle: { fontSize: 15, fontWeight: '700', marginStart: 8, flex: 1 },
  noticeBody: { fontSize: 14, lineHeight: 22, marginTop: 6 },
  noticeAction: { marginTop: 12, alignItems: 'flex-start' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  loadingText: { marginStart: 12, flex: 1 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stepperLabel: { fontSize: 16 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { minWidth: 56, textAlign: 'center', fontSize: 15, fontWeight: '600' },
});
