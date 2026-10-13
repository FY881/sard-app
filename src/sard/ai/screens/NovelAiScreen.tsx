/**
 * Full-screen novel AI (route `SardNovelAi`).
 * Params: { novelId: number; chapterId?: number; tab?: NovelAiTab }
 */
import { useEffect, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '@hooks/persisted';
import { Appbar, SafeAreaView } from '@components';
import { getNovelById } from '@database/queries/NovelQueries';
import NovelAiPanel, { type NovelAiTab } from '../components/NovelAiPanel';
import { LoadingRow } from '../components/ui';
import type { NovelRef } from '../features';
import { AI_STRINGS } from '../strings';
import { SARD_ROUTES, sardNavigate } from '../../agents/navigation';

type Params = { novelId: number; chapterId?: number; tab?: NovelAiTab };

const NovelAiScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const params = (useRoute().params ?? {}) as Params;
  const [novel, setNovel] = useState<NovelRef | undefined>();

  useEffect(() => {
    const n = getNovelById(params.novelId);
    if (n) setNovel({ id: n.id, name: n.name, pluginId: n.pluginId });
  }, [params.novelId]);

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={novel?.name ?? AI_STRINGS.settings.title}
        handleGoBack={navigation.goBack}
        theme={theme}
        mode="small"
      />
      {novel ? (
        <NovelAiPanel
          theme={theme}
          novel={novel}
          currentChapterId={params.chapterId}
          initialTab={params.tab}
          onOpenSettings={() => sardNavigate(navigation, SARD_ROUTES.aiSettings)}
        />
      ) : (
        <LoadingRow theme={theme} label={AI_STRINGS.common.loading} />
      )}
    </SafeAreaView>
  );
};

export default NovelAiScreen;
