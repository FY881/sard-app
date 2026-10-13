import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Screens
import About from '../screens/more/About';
import Settings from '../screens/settings/SettingsScreen';
import TrackerSettings from '../screens/settings/SettingsTrackerScreen';
import ReaderSettings from '../screens/settings/SettingsReaderScreen/SettingsReaderScreen';
import BackupSettings from '../screens/settings/SettingsBackupScreen';
import AdvancedSettings from '../screens/settings/SettingsAdvancedScreen';
import GeneralSettings from '../screens/settings/SettingsGeneralScreen/SettingsGeneralScreen';
import TaskQueue from '../screens/more/TaskQueueScreen';
import Downloads from '../screens/more/DownloadsScreen';
import AppearanceSettings from '../screens/settings/SettingsAppearanceScreen/SettingsAppearanceScreen';
import CategoriesScreen from '@screens/Categories/CategoriesScreen';
import SettingsCustomCode from '@screens/settings/SettingsCustomCodeScreen';
import CodeSnippetsScreen from '@screens/settings/SettingsCustomCodeScreen/CodeSnippetsScreen';
import RespositorySettings from '@screens/settings/SettingsRepositoryScreen/SettingsRepositoryScreen';
import LibrarySettings from '@screens/settings/SettingsLibraryScreen/SettingsLibraryScreen';
import StatsScreen from '@screens/StatsScreen/StatsScreen';
import GenreTaxonomyScreen from '@screens/settings/SettingsTaxonomyScreen/SettingsTaxonomyScreen';
import AiSettingsScreen from '../sard/ai/screens/AiSettingsScreen';
import NovelAiScreen from '../sard/ai/screens/NovelAiScreen';
import AgentsHubScreen from '../sard/agents/screens/AgentsHubScreen';
import AgentChatScreen from '../sard/agents/screens/AgentChatScreen';
import SmartShelvesScreen from '../sard/agents/screens/SmartShelvesScreen';
import RecommendationsScreen from '../sard/agents/screens/RecommendationsScreen';
import WatcherScreen from '../sard/agents/screens/WatcherScreen';
import AgentLogScreen from '../sard/agents/screens/AgentLogScreen';
import MembershipHubScreen from '../sard/membership/screens/MembershipHubScreen';
import FeaturesScreen from '../sard/membership/screens/FeaturesScreen';
import PlusHubScreen from '../sard/plus/screens/PlusHubScreen';
import ReadingToolsScreen from '../sard/plus/screens/ReadingToolsScreen';
import BookmarksScreen from '../sard/plus/screens/BookmarksScreen';
import VocabularyScreen from '../sard/plus/screens/VocabularyScreen';
import LibraryToolsScreen from '../sard/plus/screens/LibraryToolsScreen';
import StorageScreen from '../sard/plus/screens/StorageScreen';
import AchievementsScreen from '../sard/plus/screens/AchievementsScreen';
import WrapScreen from '../sard/plus/screens/WrapScreen';
import LookFeelScreen from '../sard/plus/screens/LookFeelScreen';
import LocalAiScreen from '../sard/plus/screens/LocalAiScreen';
import PrivacyScreen from '../sard/plus/screens/PrivacyScreen';
import BackupToolsScreen from '../sard/plus/screens/BackupToolsScreen';
import DiagnosticsScreen from '../sard/plus/screens/DiagnosticsScreen';
import ChangelogScreen from '../sard/plus/screens/ChangelogScreen';
import { withGate } from '../sard/plus/ui';

// Sard 1.1: chat + chapter watcher need «كل الوكلاء» (Plus).
const GatedAgentChat = withGate(AgentChatScreen, 'agents.all');
const GatedWatcher = withGate(WatcherScreen, 'agents.all');
import { MoreStackParamList, SettingsStackParamList } from './types';
import { useTheme } from '@hooks/persisted';

const Stack = createNativeStackNavigator<
  MoreStackParamList & SettingsStackParamList
>();

const SettingsStack = () => {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        animation: 'none',
        contentStyle: { backgroundColor: theme.background },
        headerShown: false,
      }}
    >
      <Stack.Screen name="Settings" component={Settings} />
      <Stack.Screen name="GeneralSettings" component={GeneralSettings} />
      <Stack.Screen name="ReaderSettings" component={ReaderSettings} />
      <Stack.Screen name="TrackerSettings" component={TrackerSettings} />
      <Stack.Screen name="BackupSettings" component={BackupSettings} />
      <Stack.Screen name="AppearanceSettings" component={AppearanceSettings} />
      <Stack.Screen name="AdvancedSettings" component={AdvancedSettings} />
      <Stack.Screen
        name="RespositorySettings"
        component={RespositorySettings}
      />
      <Stack.Screen name="LibrarySettings" component={LibrarySettings} />
      <Stack.Screen name="CustomCode" component={SettingsCustomCode} />
      <Stack.Screen name="CodeSnippets" component={CodeSnippetsScreen} />
      <Stack.Screen name="GenreTaxonomy" component={GenreTaxonomyScreen} />
    </Stack.Navigator>
  );
};

const MoreStack = () => {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        animation: 'none',
        contentStyle: { backgroundColor: theme.background },
        headerShown: false,
      }}
    >
      <Stack.Screen name="SettingsStack" component={SettingsStack} />
      <Stack.Screen name="About" component={About} />
      <Stack.Screen name="TaskQueue" component={TaskQueue} />
      <Stack.Screen name="Downloads" component={Downloads} />
      <Stack.Screen name="Categories" component={CategoriesScreen} />
      <Stack.Screen name="Statistics" component={StatsScreen} />
      <Stack.Screen name="SardAiSettings" component={AiSettingsScreen} />
      <Stack.Screen name="SardNovelAi" component={NovelAiScreen} />
      <Stack.Screen name="SardAgents" component={AgentsHubScreen} />
      <Stack.Screen name="SardAgentChat" component={GatedAgentChat} />
      <Stack.Screen name="SardSmartShelves" component={SmartShelvesScreen} />
      <Stack.Screen
        name="SardRecommendations"
        component={RecommendationsScreen}
      />
      <Stack.Screen name="SardWatcher" component={GatedWatcher} />
      <Stack.Screen name="SardAgentLog" component={AgentLogScreen} />
      <Stack.Screen name="SardMembership" component={MembershipHubScreen} />
      <Stack.Screen name="SardFeatures" component={FeaturesScreen} />
      <Stack.Screen name="SardPlus" component={PlusHubScreen} />
      <Stack.Screen name="SardReadingTools" component={ReadingToolsScreen} />
      <Stack.Screen name="SardBookmarks" component={BookmarksScreen} />
      <Stack.Screen name="SardVocabulary" component={VocabularyScreen} />
      <Stack.Screen name="SardLibraryTools" component={LibraryToolsScreen} />
      <Stack.Screen name="SardStorage" component={StorageScreen} />
      <Stack.Screen name="SardAchievements" component={AchievementsScreen} />
      <Stack.Screen name="SardWrap" component={WrapScreen} />
      <Stack.Screen name="SardLookFeel" component={LookFeelScreen} />
      <Stack.Screen name="SardLocalAi" component={LocalAiScreen} />
      <Stack.Screen name="SardPrivacy" component={PrivacyScreen} />
      <Stack.Screen name="SardBackupTools" component={BackupToolsScreen} />
      <Stack.Screen name="SardDiagnostics" component={DiagnosticsScreen} />
      <Stack.Screen name="SardChangelog" component={ChangelogScreen} />
    </Stack.Navigator>
  );
};

export default MoreStack;
