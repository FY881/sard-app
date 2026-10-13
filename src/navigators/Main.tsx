import { useEffect } from 'react';

import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import {
  setNavigationBarTransparent,
  setStatusBarColor,
} from '@theme/utils/setBarColor';
import { useAppSettings, usePluginActions, useTheme } from '@hooks/persisted';
import { AppUpdateChecker } from '@components';

/**
 * Navigators
 */
import BottomNavigator from './BottomNavigator';
import MoreStack from './MoreStack';

/**
 * Screens
 */

import BrowseSourceScreen from '../screens/BrowseSourceScreen/BrowseSourceScreen';
import GlobalSearchScreen from '../screens/GlobalSearchScreen/GlobalSearchScreen';
import Migration from '../screens/browse/migration/Migration';
import SourceNovels from '../screens/browse/SourceNovels';
import MigrateNovel from '../screens/browse/migration/MigrationNovels';

import MalTopNovels from '../screens/browse/discover/MalTopNovels';
import AniListTopNovels from '../screens/browse/discover/AniListTopNovels';
import BrowseSettings from '../screens/browse/settings/BrowseSettings';
import PluginDetailsScreen from '../screens/browse/PluginDetailsScreen';
import WebviewScreen from '@screens/WebviewScreen/WebviewScreen';
import { RootStackParamList } from './types';
import HighlightsScreen from '../sard/reader/screens/HighlightsScreen';
import ReaderModeScreen from '../sard/readermode/screens/ReaderModeScreen';
import { useMMKVBoolean } from 'react-native-mmkv';
import OnboardingScreen from '@screens/onboarding/OnboardingScreen';
import { backgroundTasks } from '@services/backgroundTasks';
import ReaderStack from './ReaderStack';
import ShareIntentHandler, {
  flushPendingShare,
  navigationRef,
} from './ShareIntentHandler';
import { LibraryContextProvider } from '@components/Context/LibraryContext';
import { UpdateContextProvider } from '@components/Context/UpdateContext';
import { useReactNavigationDevTools } from '@rozenite/react-navigation-plugin';
import { PaywallSheet } from '../sard/membership/components/PaywallSheet';
import { AppLockGate } from '../sard/plus/lock/AppLockGate';
import { scheduleStartupJobs } from '../sard/plus/startup';
const Stack = createNativeStackNavigator<RootStackParamList>();

const MainNavigator = () => {
  const theme = useTheme();
  const { updateLibraryOnLaunch } = useAppSettings();
  const { refreshPlugins } = usePluginActions();
  const [isOnboarded] = useMMKVBoolean('IS_ONBOARDED');

  useEffect(() => {
    const timer = setTimeout(async () => {
      setStatusBarColor(theme);
      setNavigationBarTransparent(theme.isDark);
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [theme]);

  useEffect(() => {
    if (updateLibraryOnLaunch) {
      backgroundTasks.enqueue({ name: 'UPDATE_LIBRARY' });
    }
    if (isOnboarded) {
      // hack this helps app has enough time to initialize database;
      refreshPlugins();
      // Sard 1.1: cleanup / auto backup / scheduled agents / achievements.
      scheduleStartupJobs();
    }
  }, [isOnboarded, refreshPlugins, updateLibraryOnLaunch]);

  // Enable React Navigation DevTools in development
  useReactNavigationDevTools({ ref: navigationRef });

  if (!isOnboarded) {
    return <OnboardingScreen />;
  }
  return (
    <NavigationContainer<RootStackParamList>
      ref={navigationRef}
      onReady={flushPendingShare}
      theme={{
        colors: {
          ...DefaultTheme.colors,
          primary: theme.primary,
          background: theme.background,
          card: theme.surface,
          text: theme.onSurface,
          border: theme.outline,
        },
        dark: theme.isDark,
        fonts: DefaultTheme.fonts,
      }}
      linking={{
        prefixes: ['lnreader://', 'sard://'],
        config: {
          screens: {
            MoreStack: {
              screens: {
                SettingsStack: {
                  screens: {
                    RespositorySettings: '/repo/add',
                  },
                },
                SardAgents: '/agents',
                SardAiSettings: '/ai',
                SardSmartShelves: '/shelves',
                SardRecommendations: '/recommendations',
                SardAgentChat: '/agents/chat',
                Statistics: '/stats',
                SardMembership: '/membership',
                SardPlus: '/plus',
                SardFeatures: '/features',
                SardAchievements: '/achievements',
                SardReadingTools: '/plus/reading',
                SardBookmarks: '/plus/bookmarks',
                SardVocabulary: '/plus/vocab',
                SardLibraryTools: '/plus/library',
                SardStorage: '/plus/storage',
                SardWrap: '/plus/wrap',
                SardLookFeel: '/plus/look',
                SardLocalAi: '/plus/ai',
                SardPrivacy: '/plus/privacy',
                SardBackupTools: '/plus/backup',
                SardDiagnostics: '/plus/diagnostics',
                SardChangelog: '/plus/changelog',
              },
            },
            SardHighlights: '/highlights',
            SardReaderMode: '/readermode',
          },
        },
      }}
    >
      <ShareIntentHandler />
      <LibraryContextProvider>
        <UpdateContextProvider>
          <AppUpdateChecker />
          <PaywallSheet />
          <AppLockGate />
          <Stack.Navigator
            screenOptions={{
              animation: 'none',
              contentStyle: { backgroundColor: theme.background },
              headerShown: false,
            }}
          >
            <Stack.Screen name="BottomNavigator" component={BottomNavigator} />
            <Stack.Screen name="ReaderStack" component={ReaderStack} />
            <Stack.Screen name="MoreStack" component={MoreStack} />
            <Stack.Screen name="SourceScreen" component={BrowseSourceScreen} />
            <Stack.Screen name="BrowseMal" component={MalTopNovels} />
            <Stack.Screen name="BrowseAL" component={AniListTopNovels} />
            <Stack.Screen name="BrowseSettings" component={BrowseSettings} />
            <Stack.Screen
              name="PluginDetails"
              component={PluginDetailsScreen}
            />
            <Stack.Screen
              name="GlobalSearchScreen"
              component={GlobalSearchScreen}
            />
            <Stack.Screen name="Migration" component={Migration} />
            <Stack.Screen name="SourceNovels" component={SourceNovels} />
            <Stack.Screen name="MigrateNovel" component={MigrateNovel} />
            <Stack.Screen name="WebviewScreen" component={WebviewScreen} />
            <Stack.Screen name="SardHighlights" component={HighlightsScreen} />
            <Stack.Screen name="SardReaderMode" component={ReaderModeScreen} />
          </Stack.Navigator>
        </UpdateContextProvider>
      </LibraryContextProvider>
    </NavigationContainer>
  );
};

export default MainNavigator;
