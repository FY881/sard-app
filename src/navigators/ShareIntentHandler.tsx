import { useCallback, useEffect } from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';
import { useEventListener } from 'expo';

import NativeShareReceiver from '@modules/native-share-receiver';
import { resolveSharedUrl } from '@services/share/resolveSharedUrl';
import { RootStackParamList } from './types';
import { extractFirstUrl } from '../sard/readermode/url';
import { extractRepoUrl } from '../screens/settings/SettingsRepositoryScreen/utils/repoUrl';

/** Route name of the Sard reader-mode screen (registered in Main.tsx). */
export const SARD_READER_MODE_ROUTE = 'SardReaderMode';

// Navigates to routes added by Sard that RootStackParamList does not type.
const navigateUntyped = (name: string, params?: object) =>
  (
    navigationRef.navigate as unknown as (
      routeName: string,
      routeParams?: object,
    ) => void
  )(name, params);

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// The container resolves its initial state asynchronously (linking), so a
// share arriving before navigationRef.isReady() would otherwise be dropped.
// Queue it here; Main.tsx flushes once NavigationContainer's onReady fires.
let pendingShare: string | null = null;

const dispatchSharedText = (text: string) => {
  // Sard: a shared repository URL goes to the repository review dialog
  // (never added silently).
  const repoUrl = extractRepoUrl(text);
  if (repoUrl) {
    if (!navigationRef.isReady()) {
      pendingShare = text;
      return;
    }
    navigationRef.navigate('MoreStack', {
      screen: 'SettingsStack',
      params: { screen: 'RespositorySettings', params: { url: repoUrl } },
    });
    return;
  }
  const result = resolveSharedUrl(extractFirstUrl(text) ?? text);
  if (!result) {
    return;
  }
  if (!navigationRef.isReady()) {
    pendingShare = text;
    return;
  }
  if (result.kind === 'novel') {
    // Novel screen bootstraps itself via fetchNovel(pluginId, path);
    // name/cover params are not consumed by the novel store (verified in
    // NovelContextProvider: only path/pluginId are read).
    navigationRef.navigate('ReaderStack', {
      screen: 'Novel',
      params: {
        name: '',
        path: result.path,
        pluginId: result.pluginId,
        cover: null,
      },
    });
  } else {
    // Sard: a web page no installed source handles opens in reader mode
    // (that one page only); plain text still goes to global search.
    const pageUrl = extractFirstUrl(text);
    if (pageUrl) {
      navigateUntyped(SARD_READER_MODE_ROUTE, { url: pageUrl });
      return;
    }
    navigationRef.navigate('GlobalSearchScreen', {
      searchText: result.searchText,
    });
  }
};

export const flushPendingShare = () => {
  if (pendingShare === null || !navigationRef.isReady()) {
    return;
  }
  const text = pendingShare;
  pendingShare = null;
  dispatchSharedText(text);
};

const ShareIntentHandler = () => {
  const handleSharedText = useCallback((text: string) => {
    dispatchSharedText(text);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve(NativeShareReceiver.getInitialSharedText())
      .then(text => {
        if (active && text) {
          handleSharedText(text);
        }
      })
      .catch(() => {
        // Nothing to act on if the initial intent cannot be read.
      });
    return () => {
      active = false;
    };
  }, [handleSharedText]);

  useEventListener(NativeShareReceiver, 'SharedText', ({ text }) => {
    if (text) {
      handleSharedText(text);
    }
  });

  return null;
};

export default ShareIntentHandler;
