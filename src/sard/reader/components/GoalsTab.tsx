import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { overlay } from 'react-native-paper';
import color from 'color';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';

import { LoadingScreenV2, SelectableChip } from '@components';
import type { ThemeColors } from '@theme/types';

import { SARD_READER_STRINGS as S } from '../strings';
import { useSardReaderSettings } from '../settings';
import {
  buildHeatmap,
  computeStreak,
  computeYearWrap,
  formatDurationAr,
  fromDayKey,
  toDayKey,
  weekOverWeek,
  type DayTotal,
} from '../streaks';
import {
  countHighlights,
  getReadingDays,
  getReadingYears,
  getTopNovelsForPeriod,
  type TopNovelOfPeriod,
} from '../db';

export const GOAL_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];

const cardBg = (theme: ThemeColors) =>
  theme.isDark ? overlay(2, theme.surface) : theme.secondaryContainer;

const Card: React.FC<{ theme: ThemeColors; title?: string; children: React.ReactNode }> = ({
  theme,
  title,
  children,
}) => (
  <View style={[styles.card, { backgroundColor: cardBg(theme) }]}>
    {title ? <Text style={[styles.cardTitle, { color: theme.onSurface }]}>{title}</Text> : null}
    {children}
  </View>
);

const ProgressBar: React.FC<{ theme: ThemeColors; value: number }> = ({ theme, value }) => (
  <View style={[styles.track, { backgroundColor: color(theme.primary).alpha(0.18).string() }]}>
    <View
      style={[
        styles.fill,
        { backgroundColor: theme.primary, width: `${Math.round(Math.min(1, value) * 100)}%` },
      ]}
    />
  </View>
);

/**
 * «الأهداف» tab of the stats screen: daily goal, streak, 15-week heatmap,
 * week-over-week and a shareable yearly wrap — all from the SardReadingDay log.
 */
export const GoalsTab: React.FC<{ theme: ThemeColors }> = ({ theme }) => {
  const sard = useSardReaderSettings();
  const goal = sard.dailyGoalMinutes;
  const [days, setDays] = useState<DayTotal[] | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [top, setTop] = useState<TopNovelOfPeriod[]>([]);
  const [hlCount, setHlCount] = useState({ highlights: 0, notes: 0 });
  const wrapRef = useRef<View>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getReadingDays(), getReadingYears(), countHighlights()])
        .then(([d, y, c]) => {
          if (cancelled) return;
          setDays(d);
          setYears(y.length ? y : [new Date().getFullYear()]);
          setHlCount(c);
        })
        .catch(() => {
          if (!cancelled) setDays([]);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  useEffect(() => {
    let cancelled = false;
    getTopNovelsForPeriod(`${year}-01-01`, `${year}-12-31`, 5)
      .then(t => {
        if (!cancelled) setTop(t);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [year, days]);

  const today = useMemo(() => new Date(), []);
  const todayKey = toDayKey(today);
  const streak = useMemo(() => computeStreak(days ?? [], goal, today), [days, goal, today]);
  const heat = useMemo(
    () => buildHeatmap(days ?? [], goal, 15, today, sard.weekStartsOn),
    [days, goal, today, sard.weekStartsOn],
  );
  const wow = useMemo(() => weekOverWeek(days ?? [], today), [days, today]);
  const wrap = useMemo(() => computeYearWrap(days ?? [], year, goal), [days, year, goal]);

  if (days === null) return <LoadingScreenV2 theme={theme} />;

  const remainingMs = Math.max(0, streak.goalMs - streak.todayMs);
  const pct =
    wow.lastWeek > 0 ? Math.round(((wow.thisWeek - wow.lastWeek) / wow.lastWeek) * 100) : 0;
  const levelColor = (level: number) =>
    level === 0
      ? color(theme.onSurface).alpha(0.08).string()
      : color(theme.primary).alpha([0, 0.3, 0.55, 0.8, 1][level]).string();
  const maxMonth = Math.max(1, ...wrap.monthly);

  const wrapCells = [
    [S.wrapTotal, formatDurationAr(wrap.totalMs)],
    [S.wrapActiveDays, S.days(wrap.activeDays)],
    [S.wrapChapters, String(wrap.chaptersRead)],
    [S.wrapLongest, S.days(wrap.longestStreak)],
    [S.wrapGoalDays, S.days(wrap.goalDays)],
    [S.wrapAverage, formatDurationAr(wrap.averagePerActiveDayMs)],
    wrap.bestMonth ? [S.wrapBestMonth, S.months[wrap.bestMonth.month]] : null,
    wrap.favoriteWeekday !== undefined ? [S.wrapFavoriteDay, S.weekdays[wrap.favoriteWeekday]] : null,
    wrap.bestDay
      ? [S.wrapBestDay, `${wrap.bestDay.day} · ${formatDurationAr(wrap.bestDay.timeSpent)}`]
      : null,
    [S.highlights, `${hlCount.highlights} · ${S.note} ${hlCount.notes}`],
  ].filter((x): x is string[] => !!x);

  const shareWrap = async () => {
    try {
      const uri = await captureRef(wrapRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: S.shareWrap });
        return;
      }
    } catch {
      // fall back to text below
    }
    const text = [
      `${S.yearWrap(year)} 📚`,
      ...wrapCells.map(([l, v]) => `${l}: ${v}`),
      top[0]?.name ? `${S.wrapTopNovels}: ${top[0].name}` : '',
      S.quoteFooter,
    ]
      .filter(Boolean)
      .join('\n');
    await Share.share({ message: text });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card theme={theme} title={S.todayProgress}>
        <View style={styles.rowBetween}>
          <Text style={[styles.big, { color: theme.primary }]}>
            {formatDurationAr(streak.todayMs)}
          </Text>
          <Text style={{ color: theme.onSurfaceVariant }}>
            {S.dailyGoal}: {S.dailyGoalMinutes(goal)}
          </Text>
        </View>
        <ProgressBar theme={theme} value={streak.todayProgress} />
        <Text style={[styles.caption, { color: theme.onSurfaceVariant }]}>
          {streak.todayMet ? S.goalReached : S.goalRemaining(formatDurationAr(remainingMs))}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {GOAL_OPTIONS.map(g => (
            <SelectableChip
              key={g}
              label={S.dailyGoalMinutes(g)}
              selected={g === goal}
              theme={theme}
              onPress={() => sard.setSardReaderSettings({ dailyGoalMinutes: g })}
            />
          ))}
        </ScrollView>
      </Card>

      <Card theme={theme} title={S.streak}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.big, { color: theme.primary }]}>🔥 {streak.current}</Text>
            <Text style={{ color: theme.onSurfaceVariant }}>{S.currentStreak}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.big, { color: theme.onSurface }]}>🏆 {streak.longest}</Text>
            <Text style={{ color: theme.onSurfaceVariant }}>{S.longestStreak}</Text>
          </View>
        </View>
        {!streak.todayMet ? (
          <Text
            style={[
              styles.caption,
              { color: streak.atRisk ? theme.error : theme.onSurfaceVariant },
            ]}
          >
            {streak.atRisk ? S.streakAtRisk : S.streakStart}
          </Text>
        ) : null}
      </Card>

      <Card theme={theme} title={S.last15Weeks}>
        <View style={styles.heat}>
          <View style={styles.heatLabels}>
            {heat[0]?.map(c => (
              <Text key={c.day} style={[styles.heatLabel, { color: theme.onSurfaceVariant }]}>
                {S.weekdaysShort[fromDayKey(c.day).getDay()]}
              </Text>
            ))}
          </View>
          {heat.map((col, i) => (
            <View key={i} style={styles.heatCol}>
              {col.map(cell => (
                <View
                  key={cell.day}
                  accessibilityLabel={`${cell.day}: ${formatDurationAr(cell.timeSpent)}`}
                  style={[
                    styles.heatCell,
                    {
                      backgroundColor: cell.future ? 'transparent' : levelColor(cell.level),
                      borderColor: cell.day === todayKey ? theme.primary : 'transparent',
                    },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
        <View style={styles.legend}>
          <Text style={[styles.heatLabel, { color: theme.onSurfaceVariant }]}>{S.less}</Text>
          {[0, 1, 2, 3, 4].map(l => (
            <View key={l} style={[styles.heatCell, { backgroundColor: levelColor(l) }]} />
          ))}
          <Text style={[styles.heatLabel, { color: theme.onSurfaceVariant }]}>{S.more}</Text>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.mid, { color: theme.onSurface }]}>
              {formatDurationAr(wow.thisWeek)}
            </Text>
            <Text style={{ color: theme.onSurfaceVariant }}>{S.thisWeek}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.mid, { color: theme.onSurface }]}>
              {formatDurationAr(wow.lastWeek)}
            </Text>
            <Text style={{ color: theme.onSurfaceVariant }}>{S.lastWeek}</Text>
          </View>
        </View>
        {wow.lastWeek > 0 ? (
          <Text
            style={[
              styles.caption,
              styles.center,
              { color: pct >= 0 ? theme.primary : theme.onSurfaceVariant },
            ]}
          >
            {S.weekChange(pct)}
          </Text>
        ) : null}
      </Card>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {years.map(y => (
          <SelectableChip
            key={y}
            label={String(y)}
            selected={y === year}
            theme={theme}
            onPress={() => setYear(y)}
          />
        ))}
      </ScrollView>
      <View
        ref={wrapRef}
        collapsable={false}
        style={[styles.wrap, { backgroundColor: theme.primaryContainer }]}
      >
        <Text style={[styles.wrapTitle, { color: theme.onPrimaryContainer }]}>
          {S.yearWrap(year)}
        </Text>
        {wrap.activeDays === 0 ? (
          <Text style={[styles.caption, styles.center, { color: theme.onPrimaryContainer }]}>
            {S.wrapEmpty}
          </Text>
        ) : (
          <>
            <View style={styles.wrapGrid}>
              {wrapCells.map(([label, value]) => (
                <View key={label} style={styles.wrapCell}>
                  <Text style={[styles.mid, { color: theme.onPrimaryContainer }]}>{value}</Text>
                  <Text style={[styles.small, { color: theme.onPrimaryContainer }]}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.bars}>
              {wrap.monthly.map((ms, m) => (
                <View key={m} style={styles.barCol}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(2, Math.round((ms / maxMonth) * 64)),
                        backgroundColor: theme.primary,
                        opacity: ms > 0 ? 1 : 0.25,
                      },
                    ]}
                  />
                  <Text style={[styles.barLabel, { color: theme.onPrimaryContainer }]}>
                    {S.months[m].slice(0, 3)}
                  </Text>
                </View>
              ))}
            </View>
            {top.length ? (
              <View style={styles.topList}>
                <Text style={[styles.small, { color: theme.onPrimaryContainer }]}>
                  {S.wrapTopNovels}
                </Text>
                {top.map((n, i) => (
                  <Text
                    key={n.novelId}
                    numberOfLines={1}
                    style={[styles.topItem, { color: theme.onPrimaryContainer }]}
                  >
                    {i + 1}. {n.name ?? '—'} · {formatDurationAr(n.timeSpent)}
                  </Text>
                ))}
              </View>
            ) : null}
            <Text style={[styles.footer, { color: theme.onPrimaryContainer }]}>
              {S.quoteFooter}
            </Text>
          </>
        )}
      </View>
      {wrap.activeDays > 0 ? (
        <Pressable
          onPress={shareWrap}
          android_ripple={{ color: theme.rippleColor }}
          style={[styles.shareBtn, { borderColor: theme.outline }]}
        >
          <Text style={[styles.shareText, { color: theme.primary }]}>{S.shareWrap}</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.caption, styles.center, { color: theme.onSurfaceVariant }]}>
        {S.historyNote}
      </Text>
    </ScrollView>
  );
};

export default GoalsTab;

const styles = StyleSheet.create({
  container: { gap: 8, padding: 12, paddingBottom: 32 },
  card: {
    borderRadius: 12,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.25)',
    gap: 8,
    margin: 4,
    padding: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  rowBetween: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  big: { fontSize: 24, fontWeight: 'bold' },
  mid: { fontSize: 16, fontWeight: 'bold' },
  small: { fontSize: 12, opacity: 0.85 },
  caption: { fontSize: 13 },
  center: { textAlign: 'center' },
  track: { borderRadius: 5, height: 10, overflow: 'hidden' },
  fill: { borderRadius: 5, height: 10 },
  chips: { gap: 4, paddingVertical: 4 },
  statsRow: { flexDirection: 'row' },
  stat: { alignItems: 'center', flex: 1, gap: 2 },
  heat: { flexDirection: 'row', gap: 3, justifyContent: 'center' },
  heatLabels: { gap: 3 },
  heatLabel: { fontSize: 9, height: 14, lineHeight: 14 },
  heatCol: { gap: 3 },
  heatCell: { borderRadius: 3, borderWidth: 1, height: 14, width: 14 },
  legend: { alignItems: 'center', flexDirection: 'row', gap: 3, justifyContent: 'center' },
  wrap: { borderRadius: 16, gap: 12, margin: 4, padding: 16 },
  wrapTitle: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  wrapGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  wrapCell: { alignItems: 'center', paddingVertical: 6, width: '50%' },
  bars: { alignItems: 'flex-end', flexDirection: 'row', height: 84, justifyContent: 'space-between' },
  barCol: { alignItems: 'center', flex: 1, gap: 2, justifyContent: 'flex-end' },
  bar: { borderRadius: 4, width: 10 },
  barLabel: { fontSize: 8 },
  topList: { gap: 2 },
  topItem: { fontSize: 13 },
  footer: { fontSize: 11, opacity: 0.8, textAlign: 'center' },
  shareBtn: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  shareText: { fontWeight: '600' },
});
