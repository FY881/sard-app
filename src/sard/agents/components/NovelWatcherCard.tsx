/**
 * Per-novel Chapter Watcher options (auto-download next N, Wi-Fi only).
 * Drop into the novel screen (e.g. novel info / settings sheet):
 *   <NovelWatcherCard novelId={novel.id} />
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@hooks/persisted';
import { SwitchItem } from '@components';
import type { SardNovelAgentRow } from '@database/schema/sardAi';
import { AGENT_STRINGS } from '../../ai/strings';
import { getNovelAgent, upsertNovelAgent } from '../../ai/db';
import { Stepper } from '../../ai/components/ui';
import { runChapterWatcher } from '../watcher';

const W = AGENT_STRINGS.watcher;

const NovelWatcherCard = ({
  novelId,
  compact,
}: {
  novelId: number;
  compact?: boolean;
}) => {
  const theme = useTheme();
  const [row, setRow] = useState<SardNovelAgentRow | undefined>();

  useEffect(() => {
    getNovelAgent(novelId).then(setRow).catch(() => {});
  }, [novelId]);

  if (!row) return null;

  const patch = async (p: Partial<SardNovelAgentRow>) => {
    const next = await upsertNovelAgent(novelId, p);
    setRow(next);
    if (next.autoDownload) runChapterWatcher({ novelIds: [novelId] }).catch(() => {});
  };

  return (
    <View style={compact ? undefined : styles.container}>
      <SwitchItem
        label={W.autoDownload}
        description={W.autoDownloadDesc(row.autoDownloadCount)}
        value={row.autoDownload}
        onPress={() => patch({ autoDownload: !row.autoDownload })}
        theme={theme}
      />
      {row.autoDownload ? (
        <>
          <Stepper
            theme={theme}
            label={W.count}
            value={row.autoDownloadCount}
            min={1}
            max={100}
            onChange={v => patch({ autoDownloadCount: v })}
          />
          <SwitchItem
            label={W.wifiOnly}
            value={row.wifiOnly}
            onPress={() => patch({ wifiOnly: !row.wifiOnly })}
            theme={theme}
          />
        </>
      ) : null}
    </View>
  );
};

export default NovelWatcherCard;

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
});
