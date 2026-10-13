import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import type { ThemeColors } from '@theme/types';

/** List row with a cover, title and one or two subtitle lines (LNReader list style). */
const NovelRow = ({
  theme,
  title,
  subtitle,
  caption,
  cover,
  onPress,
  onLongPress,
  right,
}: {
  theme: ThemeColors;
  title: string;
  subtitle?: string;
  caption?: string;
  cover?: string | null;
  onPress?: () => void;
  onLongPress?: () => void;
  right?: React.ReactNode;
}) => (
  <Pressable
    onPress={onPress}
    onLongPress={onLongPress}
    android_ripple={{ color: theme.rippleColor }}
    style={styles.row}
  >
    {cover ? (
      <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
    ) : (
      <View style={[styles.cover, styles.placeholder, { backgroundColor: theme.surfaceVariant }]}>
        <MaterialCommunityIcons name="book-outline" size={22} color={theme.onSurfaceVariant} />
      </View>
    )}
    <View style={styles.body}>
      <Text numberOfLines={2} style={[styles.title, { color: theme.onSurface }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={3} style={[styles.subtitle, { color: theme.onSurfaceVariant }]}>
          {subtitle}
        </Text>
      ) : null}
      {caption ? (
        <Text numberOfLines={1} style={[styles.caption, { color: theme.primary }]}>
          {caption}
        </Text>
      ) : null}
    </View>
    {right}
  </Pressable>
);

export default NovelRow;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  cover: { width: 46, height: 66, borderRadius: 6 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, marginStart: 12 },
  title: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  caption: { fontSize: 12, marginTop: 2 },
});
