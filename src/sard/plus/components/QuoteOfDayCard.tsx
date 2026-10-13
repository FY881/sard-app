/** «اقتباس اليوم»: one of your highlights per day at the top of the library; dismiss for today. */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useTheme } from '@hooks/persisted';
import { canUse } from '../../membership/service';
import { t } from '../../i18n';
import { listHighlights, type SardHighlightRow } from '../../reader/db';
import { toDayKey } from '../../reader/streaks';
import { quoteStore } from '../store';

const hash = (s: string) => {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};

export const pickQuote = (list: Pick<SardHighlightRow, 'id' | 'text'>[], day: string, keepId?: number) => {
  const usable = list.filter(h => h.text && h.text.length >= 20 && h.text.length <= 400);
  if (!usable.length) return undefined;
  const kept = keepId !== undefined ? usable.find(h => h.id === keepId) : undefined;
  return kept ?? usable[hash(day) % usable.length];
};

export const QuoteOfDayCard = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [q, setQ] = quoteStore.use();
  const [quote, setQuote] = useState<SardHighlightRow | undefined>();
  const today = toDayKey(new Date());
  const hidden = q.hiddenDay === today || q.hiddenDay === 'never' || !canUse('motivation.quoteOfDay').allowed;

  useEffect(() => {
    if (hidden) return;
    let alive = true;
    listHighlights({ sort: 'newest' })
      .then(list => {
        if (!alive) return;
        const pick = pickQuote(list, today, q.day === today ? q.highlightId : undefined) as SardHighlightRow | undefined;
        setQuote(pick);
        if (pick && (q.day !== today || q.highlightId !== pick.id)) quoteStore.set({ ...quoteStore.get(), day: today, highlightId: pick.id });
      })
      .catch(() => setQuote(undefined));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, today]);

  if (hidden || !quote) return null;
  return (
    <Pressable
      testID="sard-quote-of-day"
      onPress={() => navigation.navigate('SardHighlights', { novelId: quote.novelId })}
      style={[styles.card, { backgroundColor: theme.surfaceContainerHigh ?? theme.surfaceVariant }]}
    >
      <View style={styles.head}>
        <MaterialCommunityIcons name="format-quote-open" size={18} color={theme.primary} />
        <Text style={[styles.label, { color: theme.primary }]}>{t('plus.quote.title')}</Text>
        <Pressable hitSlop={10} onPress={() => setQ({ ...q, hiddenDay: today })} accessibilityLabel={t('common.close')}>
          <MaterialCommunityIcons name="close" size={18} color={theme.onSurfaceVariant} />
        </Pressable>
      </View>
      <Text style={[styles.text, { color: theme.onSurface }]} numberOfLines={4}>
        {quote.text}
      </Text>
      <Text style={[styles.src, { color: theme.onSurfaceVariant }]} numberOfLines={1}>
        {[quote.novelName, quote.chapterName].filter(Boolean).join(' · ')}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, marginTop: 6, marginBottom: 2, borderRadius: 14, padding: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { flex: 1, fontSize: 12, fontWeight: '700' },
  text: { fontSize: 15, lineHeight: 25, marginTop: 6 },
  src: { fontSize: 12, marginTop: 4 },
});
