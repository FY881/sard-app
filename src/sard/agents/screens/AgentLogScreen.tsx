/**
 * «سجل الوكلاء» (route `SardAgentLog`): what each agent did, newest first.
 */
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Appbar as PaperAppbar } from 'react-native-paper';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import dayjs from 'dayjs';
import { useTheme } from '@hooks/persisted';
import { Appbar, ConfirmationDialog, SafeAreaView } from '@components';
import type { SardAgentLogRow } from '@database/schema/sardAi';
import { AGENT_STRINGS, AI_STRINGS } from '../../ai/strings';
import { clearAgentLogs, listAgentLogs } from '../../ai/db';
import { Muted, Notice } from '../../ai/components/ui';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const AGENT_META: Record<string, { icon: IconName; label: string }> = {
  watcher: { icon: 'bell-ring-outline', label: AGENT_STRINGS.watcher.title },
  librarian: { icon: 'bookshelf', label: AGENT_STRINGS.librarian.title },
  recommender: { icon: 'star-shooting-outline', label: AGENT_STRINGS.recommender.title },
  chat: { icon: 'robot-happy-outline', label: AGENT_STRINGS.chat.title },
  recap: { icon: 'history', label: AI_STRINGS.recap.title },
  scout: { icon: 'scale-balance', label: AGENT_STRINGS.scout.title },
};

const AgentLogScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const [rows, setRows] = useState<SardAgentLogRow[]>();
  const [clearVisible, setClearVisible] = useState(false);

  const load = useCallback(() => {
    listAgentLogs(300).then(setRows).catch(() => setRows([]));
  }, []);
  useFocusEffect(load);

  return (
    <SafeAreaView excludeTop>
      <Appbar title={AGENT_STRINGS.activity} handleGoBack={navigation.goBack} theme={theme} mode="small">
        <PaperAppbar.Action
          icon="delete-sweep-outline"
          iconColor={theme.onSurface}
          disabled={!rows?.length}
          onPress={() => setClearVisible(true)}
        />
      </Appbar>
      <FlatList
        data={rows ?? []}
        keyExtractor={r => String(r.id)}
        ListEmptyComponent={rows ? <Notice theme={theme} title={AGENT_STRINGS.activityEmpty} /> : null}
        renderItem={({ item }) => {
          const meta = AGENT_META[item.agent] ?? AGENT_META.chat;
          return (
            <View style={styles.row}>
              <View style={[styles.icon, { backgroundColor: theme.secondaryContainer }]}>
                <MaterialCommunityIcons name={meta.icon} size={18} color={theme.onSecondaryContainer} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: theme.onSurface }]}>{meta.label}</Text>
                {item.detail ? <Muted theme={theme}>{item.detail}</Muted> : null}
                <Muted theme={theme} style={styles.time}>
                  {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm')}
                </Muted>
              </View>
            </View>
          );
        }}
      />
      <ConfirmationDialog
        visible={clearVisible}
        title={AGENT_STRINGS.clearActivity}
        confirmLabel={AGENT_STRINGS.clearActivity}
        cancelLabel={AI_STRINGS.common.cancel}
        confirmTone="danger"
        onConfirm={async () => {
          setClearVisible(false);
          await clearAgentLogs();
          load();
        }}
        onDismiss={() => setClearVisible(false)}
      />
    </SafeAreaView>
  );
};

export default AgentLogScreen;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  flex: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  time: { fontSize: 11, marginTop: 2 },
});
