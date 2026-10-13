/** «ما الجديد»: in-app release notes, generated from the feature registry for 1.1. */
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { CATEGORY_META, CATEGORY_ORDER, FEATURES, FEATURE_KEYS } from '../../membership/features';
import { num, t, tr } from '../../i18n';
import { Card, Muted, Screen, SectionTitle, TierBadge, type IconName } from '../ui';
import { APP_VERSION } from './DiagnosticsScreen';

const ChangelogScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  return (
    <Screen title={tr(FEATURES['tools.changelog'].title)} testID="sard-changelog">
      <Card theme={theme}>
        <Text style={[styles.version, { color: theme.primary }]}>{t('plus.changelog.version', { v: APP_VERSION })}</Text>
        <Text style={[styles.body, { color: theme.onSurface }]}>{t('plus.changelog.intro', { n: num(FEATURE_KEYS.length) })}</Text>
        <View style={styles.row}>
          <Button compact mode="contained" title={t('plus.hub.title')} onPress={() => navigation.navigate('MoreStack', { screen: 'SardPlus' })} />
          <Button compact title={t('membership.title')} onPress={() => navigation.navigate('MoreStack', { screen: 'SardMembership' })} />
        </View>
      </Card>
      {CATEGORY_ORDER.map(cat => (
        <View key={cat}>
          <SectionTitle theme={theme}>{tr(CATEGORY_META[cat].title)}</SectionTitle>
          {FEATURE_KEYS.filter(k => FEATURES[k].category === cat).map(k => (
            <View key={k} style={styles.item}>
              <MaterialCommunityIcons name={FEATURES[k].icon as IconName} size={18} color={theme.onSurfaceVariant} />
              <View style={styles.flex}>
                <Text style={{ color: theme.onSurface, fontSize: 14 }}>{tr(FEATURES[k].title)}</Text>
                <Muted theme={theme}>{tr(FEATURES[k].desc)}</Muted>
              </View>
              {FEATURES[k].tier !== 'free' ? <TierBadge tier={FEATURES[k].tier} small /> : null}
            </View>
          ))}
        </View>
      ))}
    </Screen>
  );
};

export default ChangelogScreen;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  version: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 22, marginTop: 6 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  item: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 8 },
});
