/**
 * «الإحصاءات والتحفيز»: level & XP, today's challenge, streak + freezes
 * (Pro), personal challenges (Plus), all achievements, quote of the day,
 * link to the monthly wrap.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { Dialog, Portal, TextInput } from 'react-native-paper';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { useEntitlement } from '../../membership/service';
import { FEATURES } from '../../membership/features';
import { num, t, tr } from '../../i18n';
import { addDays, toDayKey } from '../../reader/streaks';
import { Card, Muted, ProgressBar, Row, Screen, SectionTitle, StatTile, SwitchRow, TierBadge, TileRow, type IconName } from '../ui';
import { useAsync } from '../hooks';
import { loadMotivation } from '../motivationState';
import { challengesStore, quoteStore, useMmkvState } from '../store';
import type { CustomGoalKind } from '../logic/motivation';

const KINDS: CustomGoalKind[] = ['chapters', 'minutes', 'novels'];

const AchievementsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { data, reload } = useAsync(() => loadMotivation({ toast: true }), []);
  const customGate = useEntitlement('motivation.customChallenges', data?.custom.filter(c => !c.p.done && !c.p.expired).length ?? 0);
  const freezeGate = useEntitlement('motivation.streakFreeze');
  const [quote, setQuote] = useMmkvState(quoteStore);
  const [creating, setCreating] = useState(false);

  if (!data) {
    return (
      <Screen title={t('plus.motivation.title')} testID="sard-achievements">
        <Muted theme={theme} style={styles.pad}>{t('common.loading')}</Muted>
      </Screen>
    );
  }
  const unlocked = data.achievements.filter(a => a.unlocked);
  const locked = data.achievements.filter(a => !a.unlocked).sort((a, b) => b.ratio - a.ratio);

  return (
    <Screen title={t('plus.motivation.title')} testID="sard-achievements">
      <Card theme={theme}>
        <View style={styles.head}>
          <MaterialCommunityIcons name="chevron-triple-up" size={24} color={theme.primary} />
          <Text style={[styles.big, { color: theme.onSurface }]}>{t('plus.hub.level', { n: num(data.level.level), title: data.level.title })}</Text>
        </View>
        <ProgressBar theme={theme} value={data.level.into / Math.max(1, data.level.span)} />
        <Muted theme={theme}>{t('plus.hub.xp', { xp: num(data.xp), next: num(data.level.toNext) })}</Muted>
      </Card>

      <TileRow>
        <StatTile theme={theme} icon="fire" label={t('plus.motivation.streak')} value={num(data.streak.current)} />
        <StatTile theme={theme} icon="trophy-outline" label={t('plus.motivation.longest')} value={num(data.streak.longest)} />
        <StatTile theme={theme} icon="medal-outline" label={t('plus.motivation.badges')} value={`${num(unlocked.length)}/${num(data.achievements.length)}`} />
      </TileRow>

      <SectionTitle theme={theme}>{tr(FEATURES['motivation.dailyChallenge'].title)}</SectionTitle>
      <Card theme={theme} testID="sard-daily-challenge">
        <View style={styles.head}>
          <MaterialCommunityIcons name={data.challengeDone ? 'check-decagram' : 'flag-checkered'} size={22} color={data.challengeDone ? theme.primary : theme.onSurfaceVariant} />
          <Text style={[styles.title, { color: theme.onSurface }]}>{tr(data.challenge.title)}</Text>
        </View>
        <ProgressBar theme={theme} value={data.challengeRatio} />
        <Muted theme={theme}>
          {data.challengeDone ? t('plus.motivation.challengeDone') : t('plus.motivation.challengeHint', { n: num(data.stats.challengesDone) })}
        </Muted>
      </Card>

      <SectionTitle theme={theme}>{tr(FEATURES['motivation.streakFreeze'].title)}</SectionTitle>
      <Row
        theme={theme}
        icon="snowflake"
        title={freezeGate.allowed ? t('plus.motivation.freezes', { n: num(data.freezes.available), cap: num(data.freezes.cap) }) : tr(FEATURES['motivation.streakFreeze'].title)}
        desc={tr(FEATURES['motivation.streakFreeze'].desc) + (data.freezes.used.length ? ' · ' + t('plus.motivation.freezeUsed', { n: num(data.freezes.used.length) }) : '')}
        onPress={freezeGate.allowed ? undefined : () => freezeGate.gate()}
        right={!freezeGate.allowed ? <TierBadge tier={freezeGate.requiredTier} small /> : undefined}
      />

      <View style={styles.sectionHead}>
        <SectionTitle theme={theme}>{tr(FEATURES['motivation.customChallenges'].title)}</SectionTitle>
        {!customGate.allowed && customGate.reason === 'tier' ? <TierBadge tier={customGate.requiredTier} small /> : null}
      </View>
      {data.custom.map(({ c, p }) => (
        <Card key={c.id} theme={theme}>
          <View style={styles.head}>
            <MaterialCommunityIcons name={p.done ? 'check-circle' : p.expired ? 'timer-off-outline' : 'target'} size={20} color={p.done ? theme.primary : theme.onSurfaceVariant} />
            <Text style={[styles.title, { color: theme.onSurface }]}>{c.title}</Text>
            <Button compact title={t('common.delete')} onPress={() => {
              challengesStore.update(s => ({ ...s, custom: s.custom.filter(x => x.id !== c.id) }));
              reload();
            }} />
          </View>
          <ProgressBar theme={theme} value={p.ratio} />
          <Muted theme={theme}>
            {t(`plus.motivation.goal.${c.kind}` as any, { v: num(p.value), target: num(c.target) })}
            {' · '}
            {p.done ? t('plus.motivation.goalDone') : p.expired ? t('plus.motivation.goalExpired') : t('plus.motivation.daysLeft', { n: num(p.daysLeft) })}
          </Muted>
        </Card>
      ))}
      <View style={styles.pad}>
        <Button testID="sard-new-challenge" mode="contained-tonal" icon="target" title={t('plus.motivation.newChallenge')} onPress={() => customGate.gate() && setCreating(true)} />
      </View>

      <SectionTitle theme={theme}>{t('plus.motivation.unlocked', { n: num(unlocked.length) })}</SectionTitle>
      <View style={styles.grid}>
        {unlocked.map(a => (
          <View key={a.def.id} style={[styles.badge, { backgroundColor: theme.secondaryContainer }]} testID={`sard-ach-${a.def.id}`}>
            <MaterialCommunityIcons name={a.def.icon as IconName} size={28} color={theme.onSecondaryContainer} />
            <Text style={[styles.badgeTitle, { color: theme.onSecondaryContainer }]} numberOfLines={2}>{tr(a.def.title)}</Text>
            <Text style={[styles.badgeXp, { color: theme.onSecondaryContainer }]}>{`+${num(a.def.xp)}`}</Text>
          </View>
        ))}
        {!unlocked.length ? <Muted theme={theme} style={styles.pad}>{t('plus.motivation.noneYet')}</Muted> : null}
      </View>

      <SectionTitle theme={theme}>{t('plus.motivation.next')}</SectionTitle>
      {locked.map(a => (
        <View key={a.def.id} style={styles.lockedRow}>
          <MaterialCommunityIcons name={a.def.icon as IconName} size={22} color={theme.onSurfaceVariant} />
          <View style={styles.flex}>
            <Text style={{ color: theme.onSurface, fontSize: 15 }}>{tr(a.def.title)}</Text>
            <Text style={{ color: theme.onSurfaceVariant, fontSize: 12 }}>{`${tr(a.def.desc)} · ${num(Math.min(a.value, a.target))}/${num(a.target)}`}</Text>
            <ProgressBar theme={theme} value={a.ratio} />
          </View>
        </View>
      ))}

      <SectionTitle theme={theme}>{t('plus.motivation.more')}</SectionTitle>
      <SwitchRow
        icon="format-quote-open"
        label={tr(FEATURES['motivation.quoteOfDay'].title)}
        desc={tr(FEATURES['motivation.quoteOfDay'].desc)}
        value={quote.hiddenDay !== 'never'}
        feature="motivation.quoteOfDay"
        onChange={v => setQuote({ ...quote, hiddenDay: v ? undefined : 'never' })}
      />
      <Row theme={theme} icon="calendar-month-outline" title={tr(FEATURES['motivation.monthlyWrap'].title)} desc={tr(FEATURES['motivation.monthlyWrap'].desc)} onPress={() => navigation.navigate('MoreStack', { screen: 'SardWrap' })} testID="sard-open-wrap" />
      <Row theme={theme} icon="chart-line" title={t('plus.motivation.stats')} onPress={() => navigation.navigate('MoreStack', { screen: 'Statistics' })} />

      <NewChallengeDialog
        visible={creating}
        onDismiss={() => setCreating(false)}
        onCreate={c => {
          challengesStore.update(s => ({ ...s, custom: [...s.custom, c] }));
          setCreating(false);
          showToast(t('plus.common.saved'));
          reload();
        }}
      />
    </Screen>
  );
};

const NewChallengeDialog = ({ visible, onDismiss, onCreate }: { visible: boolean; onDismiss: () => void; onCreate: (c: any) => void }) => {
  const theme = useTheme();
  const [kind, setKind] = useState<CustomGoalKind>('chapters');
  const [target, setTarget] = useState('50');
  const [days, setDays] = useState('30');
  const [title, setTitle] = useState('');
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ backgroundColor: theme.overlay3 }}>
        <Dialog.Title style={{ color: theme.onSurface }}>{t('plus.motivation.newChallenge')}</Dialog.Title>
        <Dialog.Content style={styles.dialog}>
          <View style={styles.wrap}>
            {KINDS.map(k => (
              <Button key={k} compact mode={kind === k ? 'contained' : 'outlined'} title={t(`plus.motivation.kind.${k}` as any)} onPress={() => setKind(k)} />
            ))}
          </View>
          <TextInput mode="outlined" label={t('plus.motivation.target')} keyboardType="number-pad" value={target} onChangeText={setTarget} theme={{ colors: { ...theme } }} />
          <TextInput mode="outlined" label={t('plus.motivation.duration')} keyboardType="number-pad" value={days} onChangeText={setDays} theme={{ colors: { ...theme } }} />
          <TextInput mode="outlined" label={t('plus.motivation.challengeName')} value={title} onChangeText={setTitle} theme={{ colors: { ...theme } }} />
        </Dialog.Content>
        <Dialog.Actions>
          <Button title={t('common.cancel')} onPress={onDismiss} />
          <Button
            mode="contained"
            testID="sard-challenge-save"
            title={t('common.save')}
            onPress={() => {
              const tg = Math.max(1, parseInt(target.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))), 10) || 1);
              const d = Math.max(1, parseInt(days.replace(/[٠-٩]/g, x => String('٠١٢٣٤٥٦٧٨٩'.indexOf(x))), 10) || 30);
              const start = toDayKey(new Date());
              onCreate({
                id: `c${Date.now().toString(36)}`,
                title: title.trim() || `${t(`plus.motivation.kind.${kind}` as any)} · ${num(tg)}`,
                kind,
                target: tg,
                startDay: start,
                endDay: addDays(start, d - 1),
                createdAt: Date.now(),
              });
            }}
          />
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

export default AchievementsScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: 16, paddingVertical: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  big: { fontSize: 17, fontWeight: '700', flex: 1 },
  title: { fontSize: 15, fontWeight: '600', flex: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingEnd: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  badge: { width: '31%', borderRadius: 14, padding: 10, alignItems: 'center', gap: 4, minHeight: 104 },
  badgeTitle: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  badgeXp: { fontSize: 11 },
  lockedRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
  dialog: { gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
