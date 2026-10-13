/** «التخصيص والمظهر»: premium & exclusive reader themes, paper textures, ornaments, drop cap, progress bar, member badge. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import { CHAPTER_READER_SETTINGS, initialChapterReaderSettings } from '@hooks/persisted/useSettings';
import { canUse, requireFeature, useMembership } from '../../membership/service';
import { FEATURES } from '../../membership/features';
import { t, tr } from '../../i18n';
import { Muted, Row, Screen, SectionTitle, SwitchRow, TierBadge } from '../ui';
import { plusReaderSettings } from '../store';
import { PAPER_TEXTURES, SARD_THEMES, type SardReaderTheme } from '../logic/themes';
import { MemberBadge } from '../../membership/components/MemberBadge';

const themeFeature = (th: SardReaderTheme) => (th.tier === 'legend' ? 'custom.exclusiveThemes' : 'custom.premiumThemes');

export const applySardTheme = (th: SardReaderTheme | null) => {
  const cur = { ...initialChapterReaderSettings, ...(getMMKVObject<Record<string, unknown>>(CHAPTER_READER_SETTINGS) ?? {}) };
  if (th) setMMKVObject(CHAPTER_READER_SETTINGS, { ...cur, theme: th.backgroundColor, textColor: th.textColor });
  plusReaderSettings.update(s => ({ ...s, look: { ...s.look, themeId: th?.id } }));
};

const LookFeelScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const m = useMembership();
  const [s] = plusReaderSettings.use();
  const look = s.look;
  const setLook = (p: Partial<typeof look>) => plusReaderSettings.update(x => ({ ...x, look: { ...x.look, ...p } }));

  const pickTheme = (th: SardReaderTheme | null) => {
    if (th && !requireFeature(themeFeature(th))) return;
    applySardTheme(th);
    showToast(th ? t('plus.look.themeApplied', { name: tr(th.name) }) : t('plus.look.themeCleared'));
  };

  const renderTheme = (th: SardReaderTheme) => {
    const allowed = canUse(themeFeature(th)).allowed;
    const active = look.themeId === th.id;
    const body = (
      <>
        <Text style={[styles.sample, { color: th.textColor }]}>أب</Text>
        <Text style={[styles.themeName, { color: th.textColor }]} numberOfLines={1}>{tr(th.name)}</Text>
        {!allowed ? <MaterialCommunityIcons name="lock" size={14} color={th.accent} style={styles.lock} /> : null}
        {active ? <MaterialCommunityIcons name="check-circle" size={18} color={th.accent} style={styles.lock} /> : null}
      </>
    );
    return (
      <Pressable key={th.id} onPress={() => pickTheme(th)} testID={`sard-theme-${th.id}`} style={[styles.themeTile, { borderColor: active ? th.accent : 'transparent' }]}>
        {th.backgroundCss ? (
          <LinearGradient colors={[th.backgroundColor, th.accent + '55', th.backgroundColor]} style={styles.themeInner}>
            {body}
          </LinearGradient>
        ) : (
          <View style={[styles.themeInner, { backgroundColor: th.backgroundColor }]}>{body}</View>
        )}
      </Pressable>
    );
  };

  const premium = SARD_THEMES.filter(x => x.tier !== 'legend');
  const exclusive = SARD_THEMES.filter(x => x.tier === 'legend');

  return (
    <Screen title={t('plus.look.title')} testID="sard-look">
      <View style={styles.sectionHead}>
        <SectionTitle theme={theme}>{tr(FEATURES['custom.premiumThemes'].title)}</SectionTitle>
        <TierBadge tier="plus" small />
      </View>
      <View style={styles.grid}>{premium.map(renderTheme)}</View>
      <View style={styles.sectionHead}>
        <SectionTitle theme={theme}>{tr(FEATURES['custom.exclusiveThemes'].title)}</SectionTitle>
        <TierBadge tier="legend" small />
      </View>
      <View style={styles.grid}>{exclusive.map(renderTheme)}</View>
      {look.themeId ? (
        <Row theme={theme} icon="palette-outline" title={t('plus.look.backToDefault')} onPress={() => pickTheme(null)} />
      ) : null}
      <Muted theme={theme} style={styles.pad}>{t('plus.look.themeHelp')}</Muted>

      <View style={styles.sectionHead}>
        <SectionTitle theme={theme}>{tr(FEATURES['custom.paperTextures'].title)}</SectionTitle>
        {!canUse('custom.paperTextures').allowed ? <TierBadge tier="plus" small /> : null}
      </View>
      <View style={styles.chips}>
        {PAPER_TEXTURES.map(x => (
          <Pressable
            key={x.id}
            onPress={() => (x.id === 'none' || requireFeature('custom.paperTextures')) && setLook({ texture: x.id })}
            style={[styles.chip, { borderColor: look.texture === x.id ? theme.primary : theme.outline, backgroundColor: look.texture === x.id ? theme.secondaryContainer : 'transparent' }]}
          >
            <Text style={{ color: theme.onSurface }}>{tr(x.name)}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle theme={theme}>{t('plus.look.typography')}</SectionTitle>
      <SwitchRow icon="flower-outline" label={tr(FEATURES['custom.sceneOrnaments'].title)} desc={tr(FEATURES['custom.sceneOrnaments'].desc)} value={look.ornaments} feature="custom.sceneOrnaments" onChange={v => setLook({ ornaments: v })} />
      <SwitchRow icon="format-letter-case" label={tr(FEATURES['custom.dropCap'].title)} desc={tr(FEATURES['custom.dropCap'].desc)} value={look.dropCap} feature="custom.dropCap" onChange={v => setLook({ dropCap: v })} testID="sard-dropcap" />
      <SwitchRow icon="progress-check" label={tr(FEATURES['custom.progressBar'].title)} desc={tr(FEATURES['custom.progressBar'].desc)} value={look.progressBar} feature="custom.progressBar" onChange={v => setLook({ progressBar: v })} />

      <SectionTitle theme={theme}>{tr(FEATURES['custom.memberBadge'].title)}</SectionTitle>
      <Row
        theme={theme}
        icon="shield-star-outline"
        title={tr(FEATURES['custom.memberBadge'].title)}
        desc={tr(FEATURES['custom.memberBadge'].desc)}
        onPress={() => navigation.navigate('MoreStack', { screen: 'SardMembership' })}
        right={m.tier !== 'free' ? <MemberBadge tier={m.tier} size={36} /> : <TierBadge tier="plus" small />}
      />
      <Row theme={theme} icon="palette-swatch-outline" title={t('plus.look.appTheme')} onPress={() => navigation.navigate('MoreStack', { screen: 'SettingsStack', params: { screen: 'AppearanceSettings' } })} />
      <Row theme={theme} icon="book-open-variant" title={t('plus.look.readerSettings')} onPress={() => navigation.navigate('MoreStack', { screen: 'SettingsStack', params: { screen: 'ReaderSettings' } })} />
    </Screen>
  );
};

export default LookFeelScreen;

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingVertical: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingEnd: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  themeTile: { width: '30.5%', borderRadius: 14, borderWidth: 2, overflow: 'hidden' },
  themeInner: { height: 84, padding: 10, justifyContent: 'flex-end' },
  sample: { fontSize: 26, fontWeight: '700' },
  themeName: { fontSize: 13, fontWeight: '600' },
  lock: { position: 'absolute', top: 8, end: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
});
