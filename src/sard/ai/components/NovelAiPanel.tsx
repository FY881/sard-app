/**
 * The per-novel AI panel: ما سبق · ملخص · الشخصيات والأماكن · اسأل الرواية.
 * Used by NovelAiScreen (full screen) and NovelAiSheet (bottom sheet).
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { ThemeColors } from '@theme/types';
import { SegmentedControl } from '@components';
import { useAISettings, useHasApiKey } from '@services/ai';
import type { NovelRef } from '../features';
import { AI_STRINGS } from '../strings';
import AskView from './AskView';
import GlossaryView from './GlossaryView';
import RecapView from './RecapView';
import SummaryView from './SummaryView';
import { Notice } from './ui';

export type NovelAiTab = 'recap' | 'summary' | 'glossary' | 'ask';

const NovelAiPanel = ({
  theme,
  novel,
  currentChapterId,
  initialTab = 'recap',
  onOpenSettings,
  scrollable = true,
  autoRecap,
}: {
  theme: ThemeColors;
  novel: NovelRef;
  currentChapterId?: number;
  initialTab?: NovelAiTab;
  onOpenSettings?: () => void;
  /** Bottom sheets supply their own scroll container. */
  scrollable?: boolean;
  autoRecap?: boolean;
}) => {
  const [tab, setTab] = useState<NovelAiTab>(initialTab);
  const { settings } = useAISettings();
  const hasKey = useHasApiKey(settings.provider);
  const props = { theme, novel, currentChapterId, onOpenSettings };

  const gate = !settings.enabled ? (
    <Notice
      theme={theme}
      icon="robot-off-outline"
      title={AI_STRINGS.disabled.title}
      body={AI_STRINGS.disabled.body}
      actionLabel={onOpenSettings ? AI_STRINGS.common.settings : undefined}
      onAction={onOpenSettings}
    />
  ) : !hasKey ? (
    <Notice
      theme={theme}
      icon="key-variant"
      title={AI_STRINGS.noKey.title}
      body={AI_STRINGS.noKey.body}
      actionLabel={onOpenSettings ? AI_STRINGS.noKey.action : undefined}
      onAction={onOpenSettings}
    />
  ) : null;

  const content =
    tab === 'recap' ? (
      <RecapView {...props} autoGenerate={autoRecap} />
    ) : tab === 'summary' ? (
      <SummaryView {...props} />
    ) : tab === 'glossary' ? (
      <GlossaryView {...props} />
    ) : null;

  return (
    <View style={styles.flex}>
      <View style={styles.tabs}>
        <SegmentedControl<NovelAiTab>
          options={[
            { value: 'recap', label: AI_STRINGS.features.recap, icon: 'history' },
            { value: 'summary', label: 'ملخص', icon: 'text-box-outline' },
            { value: 'glossary', label: 'الدليل', icon: 'account-group-outline' },
            { value: 'ask', label: 'اسأل', icon: 'chat-question-outline' },
          ]}
          value={tab}
          onChange={v => setTab(v)}
          theme={theme}
        />
      </View>
      {gate}
      {tab === 'ask' ? (
        <AskView {...props} />
      ) : scrollable ? (
        <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView>
      ) : (
        content
      )}
    </View>
  );
};

export default NovelAiPanel;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: { marginHorizontal: 16, marginVertical: 8 },
  scroll: { paddingBottom: 32 },
});
