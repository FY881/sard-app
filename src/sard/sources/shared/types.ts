import type { Plugin } from '@plugins/types';

export const SARD_PLUGIN_PREFIX = 'sard.';
export const SARD_BUILTIN_URL_SCHEME = 'sard-builtin://';

/** Arabic language label exactly as in utils/constants/languages ('ab'). */
export const LANG_ARABIC = '\u200eالعربية';
export const LANG_ENGLISH = 'English';
export const LANG_MULTI = 'Multi';

export interface BundledPlugin extends Plugin {
  /** Always true for Sard's built-in sources. */
  isBuiltIn: true;
  /** Short Arabic license statement shown in the source details. */
  licenseNote: string;
  /** Upstream site that publishes the license terms. */
  licenseUrl: string;
}
