/**
 * Navigation helpers for Sard AI/agent screens.
 * The screens are registered by the main agent inside MoreStack (see
 * work/docs/tracks/ai.md). If they end up elsewhere, change SARD_ROUTE_PARENT.
 */
export const SARD_ROUTE_PARENT = 'MoreStack';

export const SARD_ROUTES = {
  aiSettings: 'SardAiSettings',
  novelAi: 'SardNovelAi',
  agentsHub: 'SardAgents',
  agentChat: 'SardAgentChat',
  smartShelves: 'SardSmartShelves',
  recommendations: 'SardRecommendations',
  watcher: 'SardWatcher',
  agentLog: 'SardAgentLog',
} as const;

export type SardRoute = (typeof SARD_ROUTES)[keyof typeof SARD_ROUTES];

type Nav = { navigate: (...args: any[]) => void };

export const sardNavigate = (
  navigation: Nav,
  screen: SardRoute | string,
  params?: Record<string, unknown>,
) => navigation.navigate(SARD_ROUTE_PARENT, { screen, params });

export const openNovelScreen = (
  navigation: Nav,
  novel: {
    name: string;
    path: string;
    pluginId: string;
    cover?: string | null;
  },
) =>
  navigation.navigate('ReaderStack', {
    screen: 'Novel',
    params: {
      name: novel.name,
      path: novel.path,
      pluginId: novel.pluginId,
      cover: novel.cover ?? null,
    },
  });
