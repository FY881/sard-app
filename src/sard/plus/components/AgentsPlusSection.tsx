/**
 * Membership parts of «وكلاء سَرد»: agent scheduling (Pro) and custom agents
 * built from saved commands (Legend), plus the scheduled run used at startup.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@components';
import { useTheme } from '@hooks/persisted';
import { showToast } from '@utils/showToast';
import { canUse, useEntitlement } from '../../membership/service';
import { FEATURES } from '../../membership/features';
import { num, t, tr } from '../../i18n';
import { Card, Muted, Row, SectionTitle, SwitchRow, TierBadge } from '../ui';
import { ChoiceDialog, TextPromptDialog } from './dialogs';
import { agentScheduleStore, customAgentsStore } from '../store';
import { sendAgentMessage } from '../../agents/agentChat';
import { runChapterWatcher } from '../../agents/watcher';
import { getRecommendations } from '../../agents/recommender';
import { organizeLibraryIntoCategories } from '../../agents/librarian';

/** Runs the scheduled agents when due (called from the startup jobs). */
export const runScheduledAgentsIfDue = async (now = Date.now()) => {
  const s = agentScheduleStore.get();
  if (!s.enabled || !canUse('agents.schedule').allowed) return false;
  const every = s.interval === 'daily' ? 86_400_000 : 7 * 86_400_000;
  if (s.lastAt && now - s.lastAt < every) return false;
  agentScheduleStore.set({ ...s, lastAt: now });
  if (s.watcher) await runChapterWatcher().catch(() => undefined);
  if (s.picks) await getRecommendations({ force: true }).catch(() => undefined);
  if (s.tidy) await organizeLibraryIntoCategories().catch(() => undefined);
  return true;
};

export const runCustomAgent = async (commands: string[]) => {
  let done = 0;
  for (const c of commands) {
    if (!c.trim()) continue;
    await sendAgentMessage(c).catch(() => undefined);
    done++;
  }
  return done;
};

export const AgentsPlusSection = ({ onOpenChat }: { onOpenChat: () => void }) => {
  const theme = useTheme();
  const sched = useEntitlement('agents.schedule');
  const [s, setS] = agentScheduleStore.use();
  const [agents, setAgents] = customAgentsStore.use();
  const custom = useEntitlement('agents.custom', agents.length);
  const [intervalPick, setIntervalPick] = useState(false);
  const [editing, setEditing] = useState<null | { id?: string; step: 'name' | 'cmds'; name?: string; cmds?: string }>(null);
  const [running, setRunning] = useState<string | null>(null);

  return (
    <View testID="sard-agents-plus">
      <View style={styles.head}>
        <SectionTitle theme={theme}>{tr(FEATURES['agents.schedule'].title)}</SectionTitle>
        {!sched.allowed ? <TierBadge tier={sched.requiredTier} small /> : null}
      </View>
      <SwitchRow icon="calendar-sync-outline" label={t('plus.agents.scheduleOn')} desc={tr(FEATURES['agents.schedule'].desc)} value={s.enabled} feature="agents.schedule" onChange={v => setS({ ...s, enabled: v })} />
      {s.enabled && sched.allowed ? (
        <>
          <Row theme={theme} icon="calendar-refresh" title={t('plus.backup.interval')} desc={t(`plus.backup.${s.interval}` as any)} onPress={() => setIntervalPick(true)} />
          <SwitchRow icon="bell-ring-outline" label={t('plus.agents.watcher')} value={s.watcher} onChange={v => setS({ ...s, watcher: v })} />
          <SwitchRow icon="star-shooting-outline" label={t('plus.agents.picks')} value={s.picks} onChange={v => setS({ ...s, picks: v })} />
          <SwitchRow icon="bookshelf" label={t('plus.agents.tidy')} value={s.tidy} onChange={v => setS({ ...s, tidy: v })} />
          <Muted theme={theme} style={styles.pad}>{t('plus.agents.scheduleHelp')}</Muted>
        </>
      ) : null}

      <View style={styles.head}>
        <SectionTitle theme={theme}>{tr(FEATURES['agents.custom'].title)}</SectionTitle>
        {custom.reason === 'tier' || custom.reason === 'disabled' ? <TierBadge tier={custom.requiredTier} small /> : null}
      </View>
      <Muted theme={theme} style={styles.pad}>{tr(FEATURES['agents.custom'].desc)}</Muted>
      {agents.map(a => (
        <Card key={a.id} theme={theme}>
          <Text style={[styles.name, { color: theme.onSurface }]}>{a.name}</Text>
          {a.commands.map((c, i) => (
            <Muted key={i} theme={theme}>{`${num(i + 1)}. ${c}`}</Muted>
          ))}
          <View style={styles.row}>
            <Button
              compact
              mode="contained"
              loading={running === a.id}
              title={t('plus.agents.run')}
              onPress={async () => {
                if (!canUse('agents.custom').allowed) return custom.gate();
                setRunning(a.id);
                const n = await runCustomAgent(a.commands);
                setRunning(null);
                showToast(t('plus.agents.ran', { n: num(n) }));
                onOpenChat();
              }}
            />
            <Button compact title={t('common.edit')} onPress={() => setEditing({ id: a.id, step: 'name', name: a.name, cmds: a.commands.join('\n') })} />
            <Button compact textColor={theme.error} title={t('common.delete')} onPress={() => setAgents(agents.filter(x => x.id !== a.id))} />
          </View>
        </Card>
      ))}
      <View style={styles.pad}>
        <Button testID="sard-new-agent" mode="contained-tonal" icon="robot-love-outline" title={t('plus.agents.new')} onPress={() => custom.gate(agents.length) && setEditing({ step: 'name' })} />
      </View>

      <ChoiceDialog
        visible={intervalPick}
        title={t('plus.backup.interval')}
        choices={[{ value: 'daily', label: t('plus.backup.daily') }, { value: 'weekly', label: t('plus.backup.weekly') }]}
        selected={s.interval}
        onDismiss={() => setIntervalPick(false)}
        onPick={v => {
          setS({ ...s, interval: v as 'daily' | 'weekly' });
          setIntervalPick(false);
        }}
      />
      <TextPromptDialog
        visible={editing?.step === 'name'}
        title={t('plus.agents.name')}
        initial={editing?.name ?? ''}
        onDismiss={() => setEditing(null)}
        onSubmit={v => setEditing(e => (e ? { ...e, step: 'cmds', name: v.trim() || t('plus.agents.defaultName') } : e))}
        submitLabel={t('plus.common.next')}
      />
      <TextPromptDialog
        visible={editing?.step === 'cmds'}
        title={t('plus.agents.commands')}
        help={t('plus.agents.commandsHelp')}
        initial={editing?.cmds ?? ''}
        multiline
        onDismiss={() => setEditing(null)}
        onSubmit={v => {
          const cmds = v.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 10);
          if (!editing || !cmds.length) return setEditing(null);
          const next = { id: editing.id ?? `a${Date.now().toString(36)}`, name: editing.name ?? '', commands: cmds };
          setAgents(editing.id ? agents.map(a => (a.id === editing.id ? next : a)) : [...agents, next]);
          setEditing(null);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingEnd: 12 },
  pad: { paddingHorizontal: 16, paddingVertical: 6 },
  name: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  row: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
});
