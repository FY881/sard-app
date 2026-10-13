/**
 * Hard source rule, enforced in CODE (pure):
 * agents never search for, suggest, or add sources / repositories / sites /
 * plugins. A request for that is refused locally (no AI call), and any URL in
 * a model reply that is not one of the app's built-in legal sources is removed.
 */
import { normalizeText } from '../ai/arabic';

const SOURCE_NOUNS =
  /(مصدر|مصادر|موقع|مواقع|مستودع|مستودعات|ريبو|ريبوز|اضافه|اضافات|بلجن|بلاجن|اكستنشن|رابط|روابط|لينك|لينكات|سيرفر|repo|repos|repository|repositories|plugin|plugins|extension|extensions|source|sources|site|sites|website|websites|link|links|url|torrent|تورنت)/;

const ACQUIRE_VERBS =
  /(ضيف|ضيفلي|اضيف|اضف|ضف|زود|ركب|ثبت|نزل|حمل|دور|دورلي|ابحث|بحث|لاقي|لاقيلي|الاقي|هات|هاتلي|جيب|جيبلي|اقترح|اقترحلي|رشح|رشحلي|انصح|انصحني|اعرف|تعرف|فين|وين|اين|عايز|عاوز|add|install|find|search|suggest|recommend|get|where|give|want)/;

const LIST_LEGAL =
  /(قانوني|قانونيه|المدمج|المدمجه|الرسمي|الرسميه|legal|built.?in)/;

const SHOW_VERBS = /(اعرض|وريني|ورينا|عرض|قائمه|قايمه|ايه هي|ما هي|show|list)/;

const PIRACY =
  /(مقرصن|قرصنه|مسروق|مكركه|كراك|pirat|crack|warez|نسخ غير|بدون اذن)/;

export type SourceIntent = 'none' | 'refuse';

export const detectSourceIntent = (input: string): SourceIntent => {
  // "بالإضافة إلى" (= in addition to) is not a plugin request.
  const t = normalizeText(input).replace(/بالاضافه/g, ' ');
  if (PIRACY.test(t)) return 'refuse';
  if (!SOURCE_NOUNS.test(t)) return 'none';
  if (LIST_LEGAL.test(t) && !/(غير قانوني|مش قانوني)/.test(t)) {
    return 'refuse';
  }
  if (SHOW_VERBS.test(t) && /(مصادري|المصادر المثبته|المثبته)/.test(t)) {
    return 'refuse';
  }
  if (ACQUIRE_VERBS.test(t) || SHOW_VERBS.test(t)) return 'refuse';
  return 'none';
};

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>()«»"']+)/gi;
const BARE_DOMAIN_RE =
  /\b([a-z0-9-]+\.(?:com|net|org|io|me|co|info|xyz|site|online|cc|tv|ws|to|ru|cn|app|dev|club|top|link))\b(\/[^\s]*)?/gi;

const hostOf = (url: string) => {
  const m = url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .match(/^[^/?#:]+/);
  return (m?.[0] ?? '').toLowerCase();
};

/** Removes every URL/domain not belonging to an allowed (built-in) host. */
export const stripDisallowedLinks = (
  text: string,
  allowedSites: string[],
  replacement = '[رابط محذوف]',
) => {
  const allowed = allowedSites.map(hostOf).filter(Boolean);
  const keep = (u: string) => {
    const h = hostOf(u);
    return allowed.some(a => h === a || h.endsWith('.' + a));
  };
  return text
    .replace(URL_RE, m => (keep(m) ? m : replacement))
    .replace(BARE_DOMAIN_RE, m => (keep(m) ? m : replacement));
};
