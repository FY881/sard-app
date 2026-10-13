/**
 * «وكلاء سَرد» hub (route `SardAgents`): one card per agent with status and
 * quick actions, plus AI settings and the activity log.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useTheme } from '@hooks/persisted';
import { Appbar, Button, List, SafeAreaView } from '@components';
import { getQuota, useAISettings, useHasApiKey } from '@services/ai';
import { showToast } from '@utils/showToast';
import { AGENT_STRINGS, AI_STRINGS } from '../../ai/strings';
import { Card, formatRelativeAr, Muted, Notice, ProgressBar } from '../../ai/components/ui';
import { listNovelAgents } from '../../ai/db';
import { SARD_ROUTES, sardNavigate } from '../navigation';
import { useWatcherState } from '../settings';
import { checkForNewChapters, runChapterWatcher } from '../watcher';
import { requireFeature, useEntitlement } from '../../membership/service';
import { TierBadge } from '../../plus/ui';
import { AgentsPlusSection } from '../../plus/components/AgentsPlusSection';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const AgentCard = ({
  icon,
  title,
  desc,
  status,
  onPress,
  children,
}: {
  icon: IconName;
  title: string;
  desc: string;
  status?: string;
  onPress: () => void;
  children?: React.ReactNode;
}) => {
  const theme = useTheme();
  return (
    <Card theme={theme} onPress={onPress}>
      <View style={styles.cardHead}>
        <View style={[styles.iconWrap, { backgroundColor: theme.primaryContainer }]}>
          <MaterialCommunityIcons name={icon} size={22} color={theme.onPrimaryContainer} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.cardTitle, { color: theme.onSurface }]}>{title}</Text>
          <Muted theme={theme}>{desc}</Muted>
        </View>
        <MaterialCommunityIcons name="chevron-left" size={22} color={theme.onSurfaceVariant} />
      </View>
      {status ? (
        <Text style={[styles.status, { color: theme.primary }]}>{status}</Text>
      ) : null}
      {children}
    </Card>
  );
};

const AgentsHubScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { settings } = useAISettings();
  const hasKey = useHasApiKey(settings.provider);
  const watcher = useWatcherState();
  const [autoCount, setAutoCount] = useState(0);
  const [usage, setUsage] = useState({ used: 0, limit: 0 });
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listNovelAgents()
        .then(rows => setAutoCount(rows.filter(r => r.autoDownload).length))
        .catch(() => {});
      const q = getQuota();
      setUsage({ used: q.usedTotal(), limit: q.getLimits().dailyTotal });
    }, []),
  );

  const go = (screen: string) => sardNavigate(navigation, screen);
  // Sard 1.1: smart shelves + recommendations are free; chat and the
  // chapter watcher need Plus («كل الوكلاء»).
  const all = useEntitlement('agents.all');
  const goAll = (screen: string) => requireFeature('agents.all') && go(screen);

  return (
    <SafeAreaView excludeTop>
      <Appbar title={AGENT_STRINGS.hubTitle} handleGoBack={navigation.goBack} theme={theme} />
      <ScrollView contentContainerStyle={styles.content}>
        <Muted theme={theme} style={styles.subtitle}>
          {AGENT_STRINGS.hubSubtitle}
        </Muted>
        {!hasKey ? (
          <Notice
            theme={theme}
            icon="key-variant"
            title={AI_STRINGS.noKey.title}
            body={AGENT_STRINGS.chat.offlineHint}
            actionLabel={AI_STRINGS.noKey.action}
            onAction={() => go(SARD_ROUTES.aiSettings)}
          />
        ) : null}

        <AgentCard
          icon="robot-happy-outline"
          title={AGENT_STRINGS.chat.title}
          desc={AGENT_STRINGS.chat.welcome}
          onPress={() => goAll(SARD_ROUTES.agentChat)}
        >
          {!all.allowed ? <TierBadge tier={all.requiredTier} small style={styles.badge} /> : null}
        </AgentCard>

        <AgentCard
          icon="bell-ring-outline"
          title={AGENT_STRINGS.watcher.title}
          desc={AGENT_STRINGS.watcher.desc}
          status={`${AGENT_STRINGS.watcher.enabledNovels(autoCount)} · ${
            watcher.lastRunAt
              ? AGENT_STRINGS.lastRun(formatRelativeAr(watcher.lastRunAt))
              : AGENT_STRINGS.never
          }`}
          onPress={() => goAll(SARD_ROUTES.watcher)}
        >
          {!all.allowed ? <TierBadge tier={all.requiredTier} small style={styles.badge} /> : null}
          <View style={styles.actions}>
            <Button
              mode="contained-tonal"
              compact
              icon="update"
              title={AGENT_STRINGS.watcher.checkUpdates}
              onPress={() => {
                if (!requireFeature('agents.all')) return;
                checkForNewChapters();
                showToast(AGENT_STRINGS.watcher.checkUpdatesStarted);
              }}
            />
            <Button
              mode="text"
              compact
              loading={busy}
              disabled={busy}
              title={AGENT_STRINGS.runNow}
              onPress={async () => {
                if (!requireFeature('agents.all')) return;
                setBusy(true);
                try {
                  const r = await runChapterWatcher();
                  showToast(
                    AGENT_STRINGS.watcher.summary(
                      r.queued,
                      r.novels.filter(n => n.queued).length,
                    ),
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        </AgentCard>

        <AgentCard
          icon="bookshelf"
          title={AGENT_STRINGS.librarian.title}
          desc={AGENT_STRINGS.librarian.desc}
          onPress={() => go(SARD_ROUTES.smartShelves)}
        />

        <AgentCard
          icon="star-shooting-outline"
          title={AGENT_STRINGS.recommender.title}
          desc={AGENT_STRINGS.recommender.desc}
          onPress={() => go(SARD_ROUTES.recommendations)}
        />

        <AgentsPlusSection onOpenChat={() => go(SARD_ROUTES.agentChat)} />

        <Card theme={theme} onPress={() => go(SARD_ROUTES.aiSettings)}>
          <View style={styles.usageHead}>
            <Text style={[styles.cardTitle, { color: theme.onSurface }]}>
              {AI_STRINGS.settings.title}
            </Text>
            <Muted theme={theme}>
              {AI_STRINGS.settings.quotaUsedToday(usage.used, usage.limit)}
            </Muted>
          </View>
          <ProgressBar
            theme={theme}
            value={usage.limit > 0 ? usage.used / usage.limit : 0}
          />
        </Card>

        <List.Item
          title={AGENT_STRINGS.activity}
          icon="timeline-text-outline"
          onPress={() => go(SARD_ROUTES.agentLog)}
          theme={theme}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

export default AgentsHubScreen;

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  subtitle: { marginHorizontal: 16, marginBottom: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  flex: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  status: { marginTop: 10, fontSize: 13, fontWeight: '500' },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  badge: { marginTop: 8 },
  usageHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
});
