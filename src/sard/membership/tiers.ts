/**
 * Sard membership tiers «مجاني / بلس / برو / أسطورة».
 * Order matters: a higher tier includes everything of the lower ones.
 */
export type Tier = 'free' | 'plus' | 'pro' | 'legend';

export const TIERS: readonly Tier[] = ['free', 'plus', 'pro', 'legend'];

export interface L10n {
  ar: string;
  en: string;
}

export const tierRank = (t: Tier): number => TIERS.indexOf(t);

export const tierAtLeast = (have: Tier, need: Tier): boolean =>
  tierRank(have) >= tierRank(need);

export const tierFromCode = (n: number): Tier | undefined => TIERS[n];

export const maxTier = (a: Tier, b: Tier): Tier =>
  tierRank(a) >= tierRank(b) ? a : b;

export const isTier = (v: unknown): v is Tier =>
  typeof v === 'string' && (TIERS as readonly string[]).includes(v);

export interface TierMeta {
  name: L10n;
  tagline: L10n;
  /** Accent used by badges, cards and the comparison table. */
  color: string;
  onColor: string;
  icon: string;
  /** Membership badge / profile frame «فضي / ذهبي / أسطوري متحرك». */
  badge: L10n | null;
  animatedBadge: boolean;
}

export const TIER_META: Record<Tier, TierMeta> = {
  free: {
    name: { ar: 'مجاني', en: 'Free' },
    tagline: {
      ar: 'القراءة كاملة بلا إعلانات، وكل أساسيات سَرد',
      en: 'Full ad-free reading and every Sard essential',
    },
    color: '#6B7A80',
    onColor: '#FFFFFF',
    icon: 'book-open-page-variant-outline',
    badge: null,
    animatedBadge: false,
  },
  plus: {
    name: { ar: 'بلس', en: 'Plus' },
    tagline: {
      ar: 'تنزيل بلا حد، تصدير كامل، ثيمات مميزة وكل الوكلاء',
      en: 'Unlimited offline, full export, premium themes, all agents',
    },
    color: '#8E9AAF',
    onColor: '#10141A',
    icon: 'star-four-points-outline',
    badge: { ar: 'شارة فضية', en: 'Silver badge' },
    animatedBadge: false,
  },
  pro: {
    name: { ar: 'برو', en: 'Pro' },
    tagline: {
      ar: 'قوالب تصدير وغلاف مخصص، حصة ذكاء أكبر، وأدوات متقدمة',
      en: 'Export templates & custom cover, bigger AI quota, power tools',
    },
    color: '#D4A017',
    onColor: '#1A1300',
    icon: 'crown-outline',
    badge: { ar: 'شارة ذهبية', en: 'Gold badge' },
    animatedBadge: false,
  },
  legend: {
    name: { ar: 'أسطورة', en: 'Legend' },
    tagline: {
      ar: 'كل شيء بلا حدود، ثيمات حصرية، دفعات تصدير ووكلاء مخصصون',
      en: 'Everything unlimited, exclusive themes, batch export, custom agents',
    },
    color: '#9B4DCA',
    onColor: '#FFFFFF',
    icon: 'diamond-stone',
    badge: { ar: 'شارة أسطورية متحركة', en: 'Animated legend badge' },
    animatedBadge: true,
  },
};

/** Numeric limits per tier. `Infinity` = no limit. */
export const TIER_LIMITS = {
  /** Downloaded chapters kept for offline reading. */
  offlineChapters: { free: 300, plus: Infinity, pro: Infinity, legend: Infinity },
  /** Cloud AI requests per day (user's own key). Legend: unlimited. */
  aiDaily: { free: 5, plus: 50, pro: 200, legend: Infinity },
  /** Saved reader profiles. */
  readerProfiles: { free: 1, plus: 5, pro: Infinity, legend: Infinity },
  /** Saved smart library filters. */
  smartFilters: { free: 0, plus: 10, pro: Infinity, legend: Infinity },
  /** Personal reading challenges running at the same time. */
  customChallenges: { free: 0, plus: 3, pro: 10, legend: Infinity },
  /** Export jobs queued at the same time. */
  exportJobs: { free: 1, plus: 1, pro: 1, legend: Infinity },
  /** Chapters per export (free: a single chapter). */
  exportChapters: { free: 1, plus: Infinity, pro: Infinity, legend: Infinity },
  /** Streak freezes that can be banked. */
  streakFreezes: { free: 0, plus: 0, pro: 2, legend: 5 },
  /** Custom agents (saved command macros). */
  customAgents: { free: 0, plus: 0, pro: 0, legend: Infinity },
} as const satisfies Record<string, Record<Tier, number>>;

export type LimitKey = keyof typeof TIER_LIMITS;

export const limitFor = (key: LimitKey, tier: Tier): number => TIER_LIMITS[key][tier];

/** Admin roles of the future «سَرد أدمن» app (owner + 5 roles). */
export const ADMIN_ROLES = [
  'owner',
  'general_manager',
  'membership_manager',
  'content_moderator',
  'support',
  'analyst',
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
/** Roles allowed to issue membership codes/grants. */
export const ISSUER_ROLES: readonly AdminRole[] = ['owner', 'general_manager', 'membership_manager'];
