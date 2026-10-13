/** «سَرد+» hub: membership + level summary, today's challenge, the 8 feature categories and quick actions. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useTheme } from '@hooks/persisted';
import { CATEGORY_META, FEATURES, FEATURE_KEYS, type FeatureCategory } from '../../membership/features';
import { canUse, useMembership } from '../../membership/service';
import { MemberBadge } from '../../membership/components/MemberBadge';
import { num, t, tr } from '../../i18n';
import { Card, Muted, ProgressBar, Row, Screen, SectionTitle, TierBadge, type IconName } from '../ui';
import { useAsync } from '../hooks';
import { loadMotivation } from '../motivationState';

export const CATEGORY_ROUTES: Record<Exclude<FeatureCategory, 'premium'>, string> = {
  reading: 'SardReadingTools',
  library: 'SardLibraryTools',
  offline: 'SardStorage',
  motivation: 'SardAchievements',
  custom: 'SardLookFeel',
  localAi: 'SardLocalAi',
  privacy: 'SardPrivacy',
  tools: 'SardBackupTools',
};

const CATS = Object.keys(CATEGORY_ROUTES) as (keyof typeof CATEGORY_ROUTES)[];

const PlusHubScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const m = useMembership();
  const { data } = useAsync(() => loadMotivation({ toast: true }), []);
  const go = (screen: string, params?: object) => navigation.navigate('MoreStack', { screen, params });

  return (
    <Screen title={t('plus.hub.title')} testID="sard-plus-hub">
      <Card theme={theme} onPress={() => go('SardMembership')}>
        <View style={styles.head}>
          <MemberBadge tier={m.tier} size={48} />
          <View style={styles.flex}>
            <View style={styles.headRow}>
              <TierBadge tier={m.tier} />
              {data ? (
                <Text style={[styles.level, { color: theme.onSurface }]}>
                  {t('plus.hub.level', { n: num(data.level.level), title: data.level.title })}
                </Text>
              ) : null}
            </View>
            {data ? (
              <>
                <ProgressBar theme={theme} value={data.level.into / Math.max(1, data.level.span)} />
                <Muted theme={theme}>
                  {t('plus.hub.xp', { xp: num(data.xp), next: num(data.level.toNext) })}
                </Muted>
              </>
            ) : (
              <Muted theme={theme}>{t('common.loading')}</Muted>
            )}
          </View>
        </View>
      </Card>

      {data ? (
        <Card theme={theme} onPress={() => go('SardAchievements')}>
          <View style={styles.headRow}>
            <MaterialCommunityIcons
              name={data.challengeDone ? 'check-decagram' : 'flag-checkered'}
              size={20}
              color={data.challengeDone ? theme.primary : theme.onSurfaceVariant}
            />
            <Text style={[styles.cardTitle, { color: theme.onSurface }]}>{t('plus.hub.today')}</Text>
            <Text style={{ color: theme.primary }}>
              {t('plus.hub.streak', { n: num(data.streak.current) })}
            </Text>
          </View>
          <Text style={[styles.challenge, { color: theme.onSurface }]}>{tr(data.challenge.title)}</Text>
          <ProgressBar theme={theme} value={data.challengeRatio} />
          <Muted theme={theme}>
            {t('plus.hub.badges', { n: num(data.unlockedCount), total: num(data.achievements.length) })}
          </Muted>
        </Card>
      ) : null}

      <SectionTitle theme={theme}>{t('plus.hub.categories')}</SectionTitle>
      <View style={styles.grid}>
        {CATS.map(cat => {
          const keys = FEATURE_KEYS.filter(k => FEATURES[k].category === cat);
          const open = keys.filter(k => canUse(k).allowed).length;
          const meta = CATEGORY_META[cat];
          return (
            <Pressable
              key={cat}
              testID={`sard-plus-cat-${cat}`}
              accessibilityRole="button"
              onPress={() => go(CATEGORY_ROUTES[cat])}
              android_ripple={{ color: theme.rippleColor }}
              style={[styles.tile, { backgroundColor: theme.surfaceContainerHigh ?? theme.surfaceVariant }]}
            >
              <MaterialCommunityIcons name={meta.icon as IconName} size={28} color={theme.primary} />
              <Text style={[styles.tileTitle, { color: theme.onSurface }]} numberOfLines={2}>
                {tr(meta.title)}
              </Text>
              <Text style={[styles.tileSub, { color: theme.onSurfaceVariant }]}>
                {t('plus.hub.openOf', { open: num(open), total: num(keys.length) })}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle theme={theme}>{t('plus.hub.quick')}</SectionTitle>
      <Row theme={theme} icon="dice-5-outline" title={tr(FEATURES['library.surpriseMe'].title)} desc={tr(FEATURES['library.surpriseMe'].desc)} onPress={() => go('SardLibraryTools', { surprise: true })} testID="sard-plus-surprise" />
      <Row theme={theme} icon="bookmark-multiple-outline" title={tr(FEATURES['reading.bookmarks'].title)} onPress={() => go('SardBookmarks')} testID="sard-plus-bookmarks" />
      <Row theme={theme} icon="alphabetical-variant" title={tr(FEATURES['reading.vocabulary'].title)} onPress={() => go('SardVocabulary')} testID="sard-plus-vocab" />
      <Row theme={theme} icon="calendar-month-outline" title={tr(FEATURES['motivation.monthlyWrap'].title)} onPress={() => go('SardWrap')} testID="sard-plus-wrap" />
      <Row theme={theme} icon="view-grid-plus-outline" title={tr(FEATURES['tools.featureDirectory'].title)} desc={tr(FEATURES['tools.featureDirectory'].desc)} onPress={() => go('SardFeatures')} />
      <Row theme={theme} icon="newspaper-variant-outline" title={tr(FEATURES['tools.changelog'].title)} onPress={() => go('SardChangelog')} />
    </Screen>
  );
};

export default PlusHubScreen;

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  level: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  challenge: { fontSize: 15, marginVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  tile: { width: '47.5%', borderRadius: 16, padding: 14, gap: 6, minHeight: 112 },
  tileTitle: { fontSize: 15, fontWeight: '700' },
  tileSub: { fontSize: 12 },
});
