import type { PluginItem } from '@plugins/types';

import {
  BUNDLED_PLUGINS,
  getBundledPluginItems,
  isBundledPluginId,
  isReservedPluginId,
  mergeBundledIntoInstalled,
} from '../index';

jest.mock('@hooks/persisted/useUserAgent', () => ({
  getUserAgent: () => 'SardTest',
}));
jest.mock('@plugins/helpers/fetch', () => ({
  fetchApi: jest.fn(),
  downloadFile: jest.fn(),
}));
jest.mock('@plugins/helpers/storage', () => ({
  Storage: class {
    get() {
      return undefined;
    }
    set() {}
    delete() {}
  },
}));
jest.mock('@modules/native-file', () => ({ __esModule: true, default: {} }));
jest.mock('@modules/native-zip-archive', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('@modules/nitro-epub', () => ({ epub: {} }));
jest.mock('@utils/Storages', () => ({ PLUGIN_STORAGE: '/data/Plugins' }));

const user = { id: 'user', name: 'User', version: '1.0.0' } as PluginItem;

describe('bundled source registry', () => {
  it('ships only legal built-ins with reserved, prefixed ids', () => {
    expect(BUNDLED_PLUGINS.map(p => p.id)).toEqual([
      'sard.ar-wikisource',
      'sard.gutenberg',
      'sard.standardebooks',
      'sard.opds',
    ]);
    BUNDLED_PLUGINS.forEach(p => {
      expect(p.isBuiltIn).toBe(true);
      expect(p.licenseNote.length).toBeGreaterThan(10);
      expect(p.url.startsWith('sard-builtin://')).toBe(true);
      expect(typeof p.popularNovels).toBe('function');
      expect(typeof p.parseNovel).toBe('function');
      expect(typeof p.parseChapter).toBe('function');
      expect(typeof p.searchNovels).toBe('function');
    });
    expect(isBundledPluginId('sard.gutenberg')).toBe(true);
    expect(isBundledPluginId('gutenberg')).toBe(false);
    expect(isReservedPluginId('sard.anything')).toBe(true);
  });

  it('adds missing built-ins first and keeps user plugins', () => {
    const merged = mergeBundledIntoInstalled([user]);
    expect(merged.map(p => p.id)).toEqual([
      ...BUNDLED_PLUGINS.map(p => p.id),
      'user',
    ]);
    expect(merged.slice(0, 4).every(p => p.isBuiltIn)).toBe(true);
  });

  it('returns the same array when already up to date (no write needed)', () => {
    const current = [...getBundledPluginItems(), user];
    expect(mergeBundledIntoInstalled(current)).toBe(current);
  });

  it('refreshes stale built-in entries and drops spoofed sard. ids', () => {
    const stale = [
      { ...getBundledPluginItems()[0], version: '0.0.1' },
      { id: 'sard.fake', name: 'Fake' } as PluginItem,
      user,
    ];
    const merged = mergeBundledIntoInstalled(stale);
    expect(merged).not.toBe(stale);
    expect(merged[0].version).toBe(BUNDLED_PLUGINS[0].version);
    expect(merged.some(p => p.id === 'sard.fake')).toBe(false);
  });

  it('marks only the OPDS source as having settings', () => {
    const withSettings = getBundledPluginItems()
      .filter(p => p.hasSettings)
      .map(p => p.id);
    expect(withSettings).toEqual(['sard.opds']);
  });
});
