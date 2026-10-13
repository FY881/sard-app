import { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  FlatList,
  ListRenderItemInfo,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Appbar as PaperAppbar, FAB, Portal } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';

import { Appbar, Button, EmptyView, SafeAreaView } from '@components';

import {
  createRepository,
  isRepoUrlDuplicated,
  setRepositoryEnabled,
  updateRepository,
} from '@database/queries/RepositoryQueries';
import { Repository } from '@database/types';
import { useBoolean } from '@hooks/index';
import { usePluginActions, useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';

import AddRepositoryModal from './components/AddRepositoryModal';
import RepoQrScanModal from './components/RepoQrScanModal';
import RepositoryCard from './components/RepositoryCard';
import { addDismissed, extractRepoUrl, isRepoUrl } from './utils/repoUrl';
import { repoStrings as S } from '../../../sard/export/strings';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RespositorySettingsScreenProps } from '@navigators/types';
import { showToast } from '@utils/showToast';
import { useLiveQuery } from '@database/manager/liveQuery';
import { repositorySchema } from '@database/schema';
import { dbManager } from '@database/db';

const DISMISSED_KEY = 'SARD_REPO_CLIPBOARD_DISMISSED';

/**
 * Sard: the repository list ships EMPTY and the app never suggests a
 * repository. Users add their own via paste, clipboard detection, QR scan
 * or a lnreader:// / sard:// link; every path ends in the review dialog
 * (Arabic help, repository check, trust confirmation) — nothing is added
 * silently.
 */
const SettingsBrowseScreen = ({
  route: { params },
  navigation,
}: RespositorySettingsScreenProps) => {
  const theme = useTheme();
  const { bottom, right } = useSafeAreaInsets();
  const { refreshPlugins } = usePluginActions();

  const repositories = useLiveQuery(dbManager.select().from(repositorySchema), [
    { table: 'Repository' },
  ]);

  const {
    value: addRepositoryModalVisible,
    setTrue: showAddRepositoryModal,
    setFalse: closeAddRepositoryModal,
  } = useBoolean();
  const { value: qrVisible, setTrue: showQr, setFalse: closeQr } = useBoolean();
  const [prefillUrl, setPrefillUrl] = useState<string | undefined>();
  const [clipboardUrl, setClipboardUrl] = useState<string | undefined>();

  const upsertRepository = useCallback(
    async (repositoryUrl: string, repository?: Repository) => {
      const url = repositoryUrl.trim();
      if (!isRepoUrl(url)) {
        showToast(S.invalidUrl);
        return false;
      }
      if (await isRepoUrlDuplicated(url)) {
        showToast(S.duplicate);
        return false;
      }
      if (repository) {
        await updateRepository(repository.id, url);
        showToast(S.updated);
      } else {
        await createRepository(url);
        showToast(S.added);
      }
      refreshPlugins();
      return true;
    },
    [refreshPlugins],
  );

  const toggleRepository = useCallback(
    async (repository: Repository) => {
      try {
        await setRepositoryEnabled(repository.id, !repository.enabled);
        await refreshPlugins({
          clearUnavailableUpdates: repository.enabled,
        });
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error));
      }
    },
    [refreshPlugins],
  );

  const renderRepository = useCallback(
    ({ item }: ListRenderItemInfo<Repository>) => (
      <RepositoryCard
        repository={item}
        refetchRepositories={refreshPlugins}
        toggleRepository={toggleRepository}
        upsertRepository={upsertRepository}
      />
    ),
    [refreshPlugins, toggleRepository, upsertRepository],
  );

  const openAdd = useCallback(
    (url?: string) => {
      setPrefillUrl(url);
      showAddRepositoryModal();
    },
    [showAddRepositoryModal],
  );

  // Deep links (lnreader://repo/add?url=…) open the review dialog instead of
  // adding straight away.
  useEffect(() => {
    if (params?.url) {
      const url = extractRepoUrl(params.url) ?? params.url;
      showToast(S.deepLinkReview);
      openAdd(url);
    }
  }, [params, openAdd]);

  // Clipboard detection: offer (never auto-add) a copied repository URL.
  const checkClipboard = useCallback(async () => {
    try {
      if (!(await Clipboard.hasStringAsync())) {
        setClipboardUrl(undefined);
        return;
      }
      const url = extractRepoUrl(await Clipboard.getStringAsync());
      const dismissed = getMMKVObject<string[]>(DISMISSED_KEY) ?? [];
      const known = (repositories ?? []).some(r => r.url === url);
      setClipboardUrl(
        url && !dismissed.includes(url) && !known ? url : undefined,
      );
    } catch {
      setClipboardUrl(undefined);
    }
  }, [repositories]);

  useFocusEffect(
    useCallback(() => {
      checkClipboard();
      const sub = AppState.addEventListener('change', state => {
        if (state === 'active') checkClipboard();
      });
      return () => sub.remove();
    }, [checkClipboard]),
  );

  const dismissClipboard = () => {
    if (clipboardUrl) {
      setMMKVObject(
        DISMISSED_KEY,
        addDismissed(
          getMMKVObject<string[]>(DISMISSED_KEY) ?? [],
          clipboardUrl,
        ),
      );
    }
    setClipboardUrl(undefined);
  };

  const onQrScanned = (url: string) => {
    closeQr();
    openAdd(url);
  };

  return (
    <SafeAreaView excludeTop>
      <Appbar
        title={getString('browseScreen.repositories')}
        handleGoBack={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          }
        }}
        theme={theme}
      >
        <PaperAppbar.Action
          icon="qrcode-scan"
          iconColor={theme.onSurface}
          accessibilityLabel={S.scanQr}
          onPress={showQr}
        />
      </Appbar>

      {clipboardUrl ? (
        <View
          style={[styles.banner, { backgroundColor: theme.surfaceVariant }]}
        >
          <Text style={[styles.bannerTitle, { color: theme.onSurface }]}>
            {S.clipboardTitle}
          </Text>
          <Text style={[styles.bannerBody, { color: theme.onSurfaceVariant }]}>
            {S.clipboardBody}
          </Text>
          <Text
            style={[styles.bannerUrl, { color: theme.onSurfaceVariant }]}
            numberOfLines={2}
          >
            {clipboardUrl}
          </Text>
          <View style={styles.bannerActions}>
            <Button title={S.clipboardDismiss} onPress={dismissClipboard} />
            <Button
              title={S.clipboardReview}
              mode="contained-tonal"
              onPress={() => {
                const url = clipboardUrl;
                setClipboardUrl(undefined);
                openAdd(url);
              }}
            />
          </View>
        </View>
      ) : null}

      <FlatList
        data={repositories}
        contentContainerStyle={styles.contentCtn}
        keyExtractor={repository => repository.id.toString()}
        renderItem={renderRepository}
        ListEmptyComponent={
          <EmptyView
            icon="Σ(ಠ_ಠ)"
            description={`${S.emptyTitle}\n\n${S.emptyBody}`}
            theme={theme}
            actions={[
              {
                iconName: 'qrcode-scan',
                title: S.scanQr,
                onPress: showQr,
              },
            ]}
          />
        }
      />
      <FAB
        style={[styles.fab, { backgroundColor: theme.primary, right, bottom }]}
        color={theme.onPrimary}
        label={getString('common.add')}
        uppercase={false}
        onPress={() => openAdd(undefined)}
        icon={'plus'}
      />
      <Portal>
        <AddRepositoryModal
          visible={addRepositoryModalVisible}
          initialUrl={prefillUrl}
          closeModal={() => {
            closeAddRepositoryModal();
            setPrefillUrl(undefined);
          }}
          upsertRepository={upsertRepository}
          onScanQr={() => {
            closeAddRepositoryModal();
            showQr();
          }}
        />
      </Portal>
      <RepoQrScanModal
        visible={qrVisible}
        onClose={closeQr}
        onScanned={onQrScanned}
      />
    </SafeAreaView>
  );
};

export default SettingsBrowseScreen;

const styles = StyleSheet.create({
  contentCtn: {
    flexGrow: 1,
    paddingBottom: 100,
    paddingVertical: 16,
  },
  fab: {
    margin: 16,
    position: 'absolute',
    right: 0,
  },
  banner: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    padding: 14,
  },
  bannerTitle: { fontSize: 14, fontWeight: '600' },
  bannerBody: { fontSize: 13, marginTop: 4 },
  bannerUrl: { fontSize: 12, marginTop: 6 },
  bannerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
});
