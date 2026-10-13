/**
 * Sard 1.1 strings live in the shared locale files under the `sard.` key
 * (src/i18n/languages/{ar_SA,en}/strings.json, generated from
 * scripts/sard11-strings.json by scripts/merge-sard-strings.cjs).
 */
import type { TranslateOptions } from 'i18n-js';
import { getString, localization } from '@i18n/translations';
import type { StringMap } from '@i18n/types';
import type { L10n } from './membership/tiers';

type StripSard<T> = T extends `sard.${infer R}` ? R : never;
export type SardStringKey = StripSard<keyof StringMap>;

export const t = (key: SardStringKey, options?: TranslateOptions): string =>
  getString(`sard.${key}` as keyof StringMap, options);

export const isArabicUi = (): boolean => !localization || localization.startsWith('ar');

/** Picks the UI language from an inline {ar, en} pair (registry texts). */
export const tr = (text: L10n | undefined | null): string =>
  !text ? '' : isArabicUi() ? text.ar : text.en;

/** Arabic-Indic digits in Arabic UI, western otherwise. */
export const num = (n: number): string => {
  if (!Number.isFinite(n)) return isArabicUi() ? 'بلا حد' : 'Unlimited';
  const s = Math.round(n).toLocaleString('en-US');
  return isArabicUi() ? s.replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]).replace(/,/g, '٬') : s;
};
