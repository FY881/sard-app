/** «دليل المميزات»: every feature by category with tier, lock state and a jump to its screen. */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { SearchbarV2 } from '@components';
import { useTheme } from '@hooks/persisted';
import { Row, Screen, SectionTitle, TierBadge } from '../../plus/ui';
import { CATEGORY_META, featuresByCategory, type FeatureKey } from '../features';
import { canUse, useMembership } from '../service';
import { openPaywall } from '../paywallStore';
import { t, tr } from '../../i18n';

const FeaturesScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const m = useMembership();
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    return featuresByCategory()
      .map(g => ({
        ...g,
        items: g.items.filter(
          f => !query || [f.title.ar, f.title.en, f.desc.ar, f.desc.en].some(s => s.toLowerCase().includes(query)),
        ),
      }))
      .filter(g => g.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, m.tier]);

  const open = (key: FeatureKey, route?: string) => {
    const gate = canUse(key);
    if (!gate.allowed) {
      openPaywall(key, gate);
      return;
    }
    if (route) navigation.navigate('MoreStack', { screen: route });
  };

  return (
    <Screen title={t('features.title')} testID="sard-features">
      <SearchbarV2
        searchText={q}
        placeholder={t('features.search')}
        onChangeText={setQ}
        leftIcon="magnify"
        theme={theme}
        clearSearchbar={() => setQ('')}
      />
      {groups.map(g => (
        <View key={g.category}>
          <SectionTitle theme={theme}>{`${tr(CATEGORY_META[g.category].title)} · ${g.items.length}`}</SectionTitle>
          {g.items.map(f => {
            const gate = canUse(f.key);
            return (
              <Row
                key={f.key}
                theme={theme}
                icon={f.icon as any}
                title={tr(f.title)}
                desc={tr(f.desc)}
                onPress={() => open(f.key, f.route)}
                right={
                  <View style={styles.right}>
                    {f.tier !== 'free' ? <TierBadge tier={f.tier} small /> : null}
                    <MaterialCommunityIcons
                      name={gate.allowed ? (f.route ? 'chevron-left' : 'check') : 'lock-outline'}
                      size={18}
                      color={gate.allowed ? theme.onSurfaceVariant : theme.primary}
                    />
                  </View>
                }
              />
            );
          })}
        </View>
      ))}
    </Screen>
  );
};

export default FeaturesScreen;

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
