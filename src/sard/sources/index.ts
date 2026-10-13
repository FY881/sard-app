/**
 * Sard ships NO built-in sources (decision 2026-10-11: the app is for web
 * novels only; users add sources solely through their own repositories, and
 * the repository list ships empty). The former bundled plugins
 * (Wikisource, Gutenberg, Standard Ebooks, OPDS) stay on disk under
 * ./plugins for reference but are not imported anywhere, so they are not
 * bundled into the app.
 */
import type { BundledPlugin } from './shared/types';

export type { BundledPlugin } from './shared/types';
export { SARD_PLUGIN_PREFIX } from './shared/types';

export const BUNDLED_PLUGINS: readonly BundledPlugin[] = [];

export const isBundledPluginId = (_pluginId: string | undefined) => false;

export const getBundledPlugin = (_pluginId: string): BundledPlugin | undefined =>
  undefined;
