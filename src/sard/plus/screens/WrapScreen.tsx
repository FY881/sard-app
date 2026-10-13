/**
 * «ملخص الشهر»: minutes, chapters, active days, best day, longest run, top
 * novels and a daily bar chart for a month; yearly wrap (Plus), image share
 * card (Pro) and the archive of every past month (Legend).
 */
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import dayjs from 'dayjs';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { useEntitlement } from '../../membership/service';
import { FEATURES } from '../../membership/features';
import { num, t, tr } from '../../i18n';
import { computeYearWrap, formatDurationAr } from '../../reader/streaks';
import { getSardReaderSettings } from '../../reader/settings';
import { Card, ChipsRow, Gated, Muted, Screen, SectionTitle, StatTile, TierBadge, TileRow } from '../ui';
import { useAsync } from '../hooks';
import { getNovelDayRows, novelNames } from '../data';
import { computeMonthWrap, monthsWithReading } from '../logic/motivation';

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const monthName = (m: number) => tr({ ar: MONTHS_AR[m], en: dayjs().month(m).format('MMMM') });

const Bars = ({ values, color, track }: { values: number[]; color: string; track: string }) => {
  const max = Math.max(1, ...values);
  return (
    <View style={styles.bars}>
      {values.map((v, i) => (
        <View key={i} style={[styles.barTrack, { backgroundColor: track }]}>
          <View style={[styles.bar, { height: `${Math.round((v / max) * 100)}%`, backgroundColor: color }]} />
        </View>
      ))}
    </View>
  );
};

const WrapScreen = () => {
  const theme = useTheme();
  const now = new Date();
  const [sel, setSel] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [yearMode, setYearMode] = useState(false);
  const archive = useEntitlement('motivation.wrapArchive');
  const yearly = useEntitlement('motivation.yearlyWrap');
  const card = useEntitlement('motivation.wrapShareCard');
  const shotRef = useRef<View>(null);

  const { data } = useAsync(async () => {
    const rows = await getNovelDayRows();
    const ids = [...new Set(rows.map(r => r.novelId))];
    return { rows, names: await novelNames(ids) };
  }, []);
  const rows = data?.rows ?? [];

  const months = useMemo(() => {
    const list = monthsWithReading(rows);
    const cur = { year: now.getFullYear(), month: now.getMonth() };
    const prev = cur.month === 0 ? { year: cur.year - 1, month: 11 } : { year: cur.year, month: cur.month - 1 };
    const key = (x: { year: number; month: number }) => x.year * 12 + x.month;
    const all = [cur, prev, ...list].filter((x, i, a) => a.findIndex(y => key(y) === key(x)) === i);
    return all.sort((a, b) => key(b) - key(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  const freeMonths = 2; // current + previous

  const wrap = useMemo(() => computeMonthWrap(rows, sel.year, sel.month), [rows, sel]);
  const year = useMemo(() => computeYearWrap(rows, sel.year, getSardReaderSettings().dailyGoalMinutes || 20), [rows, sel.year]);

  const share = async () => {
    if (!card.gate()) return;
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    } catch (e) {
      showToast(t('common.error', { error: String((e as Error)?.message ?? e) }));
    }
  };

  const title = yearMode ? t('plus.wrap.yearTitle', { year: num(sel.year) }) : t('plus.wrap.monthTitle', { month: monthName(sel.month), year: num(sel.year) });

  return (
    <Screen title={tr(FEATURES['motivation.monthlyWrap'].title)} testID="sard-wrap">
      <ChipsRow>
        <Button compact mode={!yearMode ? 'contained' : 'outlined'} title={t('plus.wrap.month')} onPress={() => setYearMode(false)} />
        <Button
          compact
          mode={yearMode ? 'contained' : 'outlined'}
          icon={yearly.allowed ? undefined : 'lock-outline'}
          title={t('plus.wrap.year')}
          onPress={() => yearly.gate() && setYearMode(true)}
          testID="sard-wrap-year"
        />
      </ChipsRow>
      {!yearMode ? (
        <ChipsRow>
          {months.map((m, i) => {
            const locked = i >= freeMonths && !archive.allowed;
            const active = m.year === sel.year && m.month === sel.month;
            return (
              <Pressable
                key={`${m.year}-${m.month}`}
                onPress={() => (locked ? archive.gate() : setSel(m))}
                style={[styles.monthChip, { borderColor: active ? theme.primary : theme.outline, backgroundColor: active ? theme.secondaryContainer : 'transparent' }]}
              >
                {locked ? <MaterialCommunityIcons name="lock-outline" size={12} color={theme.onSurfaceVariant} /> : null}
                <Text style={{ color: theme.onSurface, fontSize: 13 }}>{`${monthName(m.month)} ${num(m.year)}`}</Text>
              </Pressable>
            );
          })}
        </ChipsRow>
      ) : null}

      <View ref={shotRef} collapsable={false} style={{ backgroundColor: theme.background }}>
        <Card theme={theme}>
          <View style={styles.head}>
            <MaterialCommunityIcons name="calendar-star" size={22} color={theme.primary} />
            <Text style={[styles.title, { color: theme.onSurface }]}>{title}</Text>
          </View>
          {yearMode ? (
            <>
              <TileRow>
                <StatTile theme={theme} label={t('plus.wrap.time')} value={formatDurationAr(year.totalMs)} />
                <StatTile theme={theme} label={t('plus.wrap.chapters')} value={num(year.chaptersRead)} />
                <StatTile theme={theme} label={t('plus.wrap.activeDays')} value={num(year.activeDays)} />
              </TileRow>
              <TileRow>
                <StatTile theme={theme} label={t('plus.wrap.longestRun')} value={t('common.days', { n: num(year.longestStreak) })} />
                <StatTile theme={theme} label={t('plus.wrap.bestMonth')} value={year.bestMonth ? monthName(year.bestMonth.month) : '—'} />
                <StatTile theme={theme} label={t('plus.wrap.goalDays')} value={num(year.goalDays)} />
              </TileRow>
              <Bars values={year.monthly} color={theme.primary} track={theme.surfaceVariant} />
              <Muted theme={theme}>{t('plus.wrap.monthlyChart')}</Muted>
            </>
          ) : (
            <>
              <TileRow>
                <StatTile theme={theme} label={t('plus.wrap.time')} value={formatDurationAr(wrap.totalMs)} />
                <StatTile theme={theme} label={t('plus.wrap.chapters')} value={num(wrap.chapters)} />
                <StatTile theme={theme} label={t('plus.wrap.activeDays')} value={`${num(wrap.activeDays)}/${num(wrap.daysInMonth)}`} />
              </TileRow>
              <TileRow>
                <StatTile theme={theme} label={t('plus.wrap.longestRun')} value={t('common.days', { n: num(wrap.longestRun) })} />
                <StatTile theme={theme} label={t('plus.wrap.bestDay')} value={wrap.bestDay ? `${num(Number(wrap.bestDay.day.slice(8)))} · ${formatDurationAr(wrap.bestDay.ms)}` : '—'} />
              </TileRow>
              <Bars values={wrap.perDay} color={theme.primary} track={theme.surfaceVariant} />
              <Muted theme={theme}>
                {wrap.vsPreviousMs >= 0
                  ? t('plus.wrap.more', { d: formatDurationAr(wrap.vsPreviousMs) })
                  : t('plus.wrap.less', { d: formatDurationAr(-wrap.vsPreviousMs) })}
              </Muted>
              {wrap.topNovelIds.length ? (
                <>
                  <SectionTitle theme={theme}>{t('plus.wrap.top')}</SectionTitle>
                  {wrap.topNovelIds.map((n, i) => (
                    <Text key={n.novelId} style={[styles.top, { color: theme.onSurface }]} numberOfLines={1}>
                      {`${num(i + 1)}. ${data?.names.get(n.novelId) ?? '#' + n.novelId} — ${formatDurationAr(n.ms)}`}
                    </Text>
                  ))}
                </>
              ) : (
                <Muted theme={theme}>{t('plus.wrap.empty')}</Muted>
              )}
            </>
          )}
          <Text style={[styles.brand, { color: theme.onSurfaceVariant }]}>سَرد</Text>
        </Card>
      </View>

      <View style={styles.pad}>
        <View style={styles.row}>
          <Button testID="sard-wrap-share" mode="contained-tonal" icon="share-variant-outline" title={tr(FEATURES['motivation.wrapShareCard'].title)} onPress={share} />
          {!card.allowed ? <TierBadge tier={card.requiredTier} small /> : null}
        </View>
      </View>
      <Gated feature="motivation.wrapArchive" compact>
        <Muted theme={theme} style={styles.pad}>{t('plus.wrap.archiveOpen', { n: num(months.length) })}</Muted>
      </Gated>
    </Screen>
  );
};

export default WrapScreen;

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 17, fontWeight: '700', flex: 1 },
  monthChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 2, marginTop: 8, direction: 'ltr' },
  barTrack: { flex: 1, height: '100%', borderRadius: 2, justifyContent: 'flex-end', overflow: 'hidden' },
  bar: { width: '100%', borderRadius: 2 },
  top: { fontSize: 14, paddingVertical: 2 },
  brand: { textAlign: 'center', marginTop: 10, fontSize: 12, letterSpacing: 2 },
});
