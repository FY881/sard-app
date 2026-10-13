/**
 * Render smoke tests for every «سَرد+» screen, each hub category route, the
 * agents hub (AgentsPlusSection) and the reader «سَرد+» tab.
 *
 * Regression guard for Sard 1.1-r12: the React Compiler memoised the old
 * `store.use()` MMKV hook (not a `use[A-Z]` name), so it ran only on the first
 * render. Every re-render then had fewer hooks and crashed with
 * "Rendered fewer hooks than expected" / "Cannot read property 'length' of
 * undefined". Each test therefore renders, flushes async loads, re-renders,
 * and changes the MMKV state the screen listens to, for free and legend tiers.
 * No error boundary is used here, so any render error fails the test.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { setMMKVObject } from '@utils/mmkv/mmkv';

import PlusHubScreen, { CATEGORY_ROUTES } from '../screens/PlusHubScreen';
import ReadingToolsScreen from '../screens/ReadingToolsScreen';
import LibraryToolsScreen from '../screens/LibraryToolsScreen';
import StorageScreen from '../screens/StorageScreen';
import AchievementsScreen from '../screens/AchievementsScreen';
import LookFeelScreen from '../screens/LookFeelScreen';
import LocalAiScreen from '../screens/LocalAiScreen';
import PrivacyScreen from '../screens/PrivacyScreen';
import BackupToolsScreen from '../screens/BackupToolsScreen';
import BookmarksScreen from '../screens/BookmarksScreen';
import VocabularyScreen from '../screens/VocabularyScreen';
import WrapScreen from '../screens/WrapScreen';
import DiagnosticsScreen from '../screens/DiagnosticsScreen';
import ChangelogScreen from '../screens/ChangelogScreen';
import AgentsHubScreen from '../../agents/screens/AgentsHubScreen';
import { AgentsPlusSection } from '../components/AgentsPlusSection';
import { QuoteOfDayCard } from '../components/QuoteOfDayCard';
import { membership } from '../../membership/service';
import {
  agentScheduleStore,
  customAgentsStore,
  hiddenStore,
  lockStore,
  plusReaderSettings,
  PLUS_KEYS,
  quoteStore,
} from '../store';
import type { Tier } from '../../membership/tiers';

jest.mock('@hooks/persisted', () => {
  const theme = { ...require('@theme/md3').darkThemes[0], isDark: true };
  const { initialChapterReaderSettings } = jest.requireActual('@hooks/persisted/useSettings');
  return {
    useTheme: () => theme,
    useChapterReaderSettings: () => ({ ...initialChapterReaderSettings, setChapterReaderSettings: jest.fn() }),
  };
});

jest.mock('@services/backgroundTasks', () => ({
  backgroundTasks: { enqueue: jest.fn(), addListener: jest.fn(() => jest.fn()), getQueue: jest.fn(() => []), subscribe: jest.fn(() => jest.fn()) },
  BackgroundTaskQueue: jest.fn(),
}));

// The reader tab lives inside the reader bottom sheet; render its scroll view and input plainly.
jest.mock('@gorhom/bottom-sheet', () => {
  const actual = jest.requireActual('@gorhom/bottom-sheet');
  const RN = jest.requireActual('react-native');
  return { ...actual, BottomSheetScrollView: RN.ScrollView, BottomSheetTextInput: RN.TextInput };
});

jest.mock('expo-linking', () => ({
  createURL: (p: string) => `sard://${p}`,
  openURL: jest.fn(),
  canOpenURL: jest.fn(async () => false),
  parse: jest.fn(() => ({})),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  getInitialURL: jest.fn(async () => null),
}));

// No SQLite in the rn jest project: every query chain rejects, so screens must
// render their empty / error states without crashing.
jest.mock('@database/db', () => {
  const make = (): any =>
    new Proxy(function () {}, {
      get: (_t, prop) => {
        if (prop === 'then') return (_res: unknown, rej: (e: unknown) => void) => rej(new Error('no db in tests'));
        if (prop === Symbol.toPrimitive) return () => 0;
        return make();
      },
      apply: () => make(),
    });
  return { db: make(), drizzleDb: make(), dbManager: make() };
});

jest.mock('../../../screens/reader/ChapterContext', () => ({
  useChapterContext: () => ({
    novel: { id: 1, name: 'رواية', path: '/n/1', pluginId: 'test' },
    chapter: { id: 10, name: 'الفصل ١', novelId: 1, path: '/c/10' },
    webViewRef: { current: null },
  }),
}));

// eslint-disable-next-line import/first
import SardPlusTab from '../../../screens/reader/components/ReaderBottomSheet/SardPlusTab';

const Providers = ({ children }: { children: React.ReactNode }) => (
  <GestureHandlerRootView>
    <SafeAreaProvider
      initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <PaperProvider>
        <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
      </PaperProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>
);

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
  }
};

const SCREENS: Record<string, React.ComponentType<any>> = {
  SardPlus: PlusHubScreen,
  SardReadingTools: ReadingToolsScreen,
  SardLibraryTools: LibraryToolsScreen,
  SardStorage: StorageScreen,
  SardAchievements: AchievementsScreen,
  SardLookFeel: LookFeelScreen,
  SardLocalAi: LocalAiScreen,
  SardPrivacy: PrivacyScreen,
  SardBackupTools: BackupToolsScreen,
  SardBookmarks: BookmarksScreen,
  SardVocabulary: VocabularyScreen,
  SardWrap: WrapScreen,
  SardDiagnostics: DiagnosticsScreen,
  SardChangelog: ChangelogScreen,
  SardAgents: AgentsHubScreen,
  AgentsPlusSection: () => <AgentsPlusSection onOpenChat={() => undefined} />,
  QuoteOfDayCard: () => <QuoteOfDayCard />,
  ReaderSardPlusTab: SardPlusTab,
};

/** Render → flush → re-render → MMKV changes → flush; must stay mounted without throwing. */
const exercise = async (Comp: React.ComponentType<any>, allowEmpty = false) => {
  const errors: unknown[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    const msg = a.map(String).join(' ');
    if (/hooks|Rendered (fewer|more)|is not a function|Cannot read propert/i.test(msg)) errors.push(msg);
  });
  const props = { navigation: { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }, route: { params: {} } };
  const view = render(
    <Providers>
      <Comp {...props} />
    </Providers>,
  );
  await flush();
  view.rerender(
    <Providers>
      <Comp {...props} />
    </Providers>,
  );
  await act(async () => {
    // Change every store a «سَرد+» screen listens to.
    lockStore.set({ ...lockStore.get(), hideInRecents: !lockStore.get().hideInRecents });
    hiddenStore.set([...hiddenStore.get(), 1]);
    plusReaderSettings.set({ ...plusReaderSettings.get(), haptics: !plusReaderSettings.get().haptics });
    agentScheduleStore.set({ ...agentScheduleStore.get(), enabled: true });
    customAgentsStore.set([{ id: 'a1', name: 'وكيل', commands: ['لخّص'] }]);
    quoteStore.set({ ...quoteStore.get(), hiddenDay: undefined });
  });
  await flush();
  view.rerender(
    <Providers>
      <Comp {...props} />
    </Providers>,
  );
  await flush();
  // Real content rendered (not just the providers). The quote card hides itself with no highlights.
  if (!allowEmpty) expect(view.queryAllByText(/\S/).length).toBeGreaterThan(0);
  view.unmount();
  spy.mockRestore();
  expect(errors).toEqual([]);
};

const resetStores = () => {
  for (const k of PLUS_KEYS) setMMKVObject(k, undefined as any);
};

describe.each<Tier>(['free', 'legend'])('«سَرد+» screens render and re-render (%s tier)', tier => {
  beforeEach(() => {
    resetStores();
    membership.setDevTier(tier);
  });
  afterAll(() => membership.setDevTier(undefined));

  it.each(Object.keys(SCREENS))('%s', async name => {
    await exercise(SCREENS[name], name === 'QuoteOfDayCard');
  });
});

describe('«سَرد+» hub categories', () => {
  it('every hub category routes to a tested screen', () => {
    for (const route of Object.values(CATEGORY_ROUTES)) {
      expect(SCREENS[route]).toBeDefined();
    }
    expect(Object.keys(CATEGORY_ROUTES).sort()).toEqual(
      ['custom', 'library', 'localAi', 'motivation', 'offline', 'privacy', 'reading', 'tools'].sort(),
    );
  });

  it.each(Object.entries(CATEGORY_ROUTES))('category %s → %s renders', async (_cat, route) => {
    membership.setDevTier('legend');
    await exercise(SCREENS[route]);
    membership.setDevTier(undefined);
  });
});

describe('React Compiler safety', () => {
  // A hook must be called through a `use[A-Z0-9]…` name, or the React Compiler
  // memoises the call as a plain function (this crashed v1.1-r12).
  it('no method-style `x.use()` hooks in app code', () => {
    const fs = jest.requireActual('fs') as typeof import('fs');
    const path = jest.requireActual('path') as typeof import('path');
    const root = path.resolve(__dirname, '../../..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__' && e.name !== 'generated') walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name)) {
          fs.readFileSync(p, 'utf8')
            .split('\n')
            .forEach((line, i) => {
              if (/\b[A-Za-z_$][\w$]*\.use\(\s*\)/.test(line) && !/^\s*(\/\/|\*)/.test(line)) {
                offenders.push(`${path.relative(root, p)}:${i + 1}`);
              }
            });
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
