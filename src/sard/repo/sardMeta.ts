/**
 * «مستودع سَرد» extensions to the LNReader repository format.
 *
 * A repo's plugins.min.json entries may carry an optional `sard` object and the
 * repo may ship `sard-repo.json` next to it. Everything here is optional and
 * validated: stock LNReader repos (no `sard`, no manifest) behave exactly as
 * before. Nothing here names or suggests any repository.
 */
import { sha256Hex } from '../membership/crypto';

export type HealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';

export interface SardPluginMeta {
  category?: string;
  tags: string[];
  description_ar?: string;
  license?: string;
  licenseUrl?: string;
  contentType?: string;
  minAppVersion?: string;
  allowedDomains?: string[];
  health?: { status: HealthStatus; checkedAt?: string | null };
  /** lowercase hex sha256 of the plugin JS file */
  sha256?: string;
  updatedAt?: string;
  source?: string;
}

export interface SardRepoManifest {
  name?: string;
  name_en?: string;
  description_ar?: string;
  description_en?: string;
  version?: string;
  homepage?: string;
  pluginCount?: number;
  contentPolicy?: string;
  license?: string;
  generatedAt?: string;
}

/**
 * Version `minAppVersion` is compared with: the LNReader plugin API level this
 * fork implements (upstream LNReader 2.1.4; the app itself is versioned 1.x), which is what repos target.
 */
export const PLUGIN_API_VERSION = '2.1.4';

const str = (v: unknown, max = 2000): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

const httpUrl = (v: unknown): string | undefined => {
  const s = str(v, 500);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
};

const HEALTH: HealthStatus[] = ['ok', 'degraded', 'down', 'unknown'];

/** Validates an entry's `sard` object; returns undefined when absent/invalid. */
export const parseSardMeta = (raw: unknown): SardPluginMeta | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const hash = str(o.sha256, 128)?.toLowerCase();
  const healthObj =
    o.health && typeof o.health === 'object' ? (o.health as Record<string, unknown>) : undefined;
  const status = str(healthObj?.status)?.toLowerCase() as HealthStatus | undefined;
  return {
    category: str(o.category, 60),
    tags: Array.isArray(o.tags)
      ? o.tags.map(x => str(x, 40)).filter((x): x is string => !!x).slice(0, 12)
      : [],
    description_ar: str(o.description_ar, 600),
    license: str(o.license, 120),
    licenseUrl: httpUrl(o.licenseUrl),
    contentType: str(o.contentType, 40),
    minAppVersion: str(o.minAppVersion, 20),
    allowedDomains: Array.isArray(o.allowedDomains)
      ? o.allowedDomains.map(d => str(d, 120)).filter((d): d is string => !!d)
      : undefined,
    health: healthObj
      ? {
          status: status && HEALTH.includes(status) ? status : 'unknown',
          checkedAt: str(healthObj.checkedAt, 80) ?? null,
        }
      : undefined,
    sha256: hash && /^[0-9a-f]{64}$/.test(hash) ? hash : undefined,
    updatedAt: str(o.updatedAt, 80),
    source: str(o.source, 200),
  };
};

export const parseRepoManifest = (raw: unknown): SardRepoManifest | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const m: SardRepoManifest = {
    name: str(o.name, 80),
    name_en: str(o.name_en, 80),
    description_ar: str(o.description_ar, 800),
    description_en: str(o.description_en, 800),
    version: str(o.version, 20),
    homepage: httpUrl(o.homepage),
    pluginCount: typeof o.pluginCount === 'number' ? o.pluginCount : undefined,
    contentPolicy: str(o.contentPolicy, 60),
    license: str(o.license, 60),
    generatedAt: str(o.generatedAt, 80),
  };
  return m.name || m.description_ar || m.description_en ? m : undefined;
};

/** `…/plugins.min.json` → `…/sard-repo.json` (same folder). */
export const manifestUrlFor = (repoUrl: string): string | undefined => {
  try {
    const u = new URL(repoUrl);
    const parts = u.pathname.split('/');
    parts[parts.length - 1] = 'sard-repo.json';
    u.pathname = parts.join('/');
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return undefined;
  }
};

/** Numeric version compare ("2.1.4" vs "2.10"); non-numeric parts count as 0. */
export const compareVersions = (a: string, b: string): number => {
  const pa = a.split(/[.+-]/).map(x => parseInt(x, 10) || 0);
  const pb = b.split(/[.+-]/).map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
};

export const isCompatible = (meta: SardPluginMeta | undefined, appVersion = PLUGIN_API_VERSION) =>
  !meta?.minAppVersion || compareVersions(appVersion, meta.minAppVersion) >= 0;

export type IntegrityResult =
  | { ok: true; checked: boolean }
  | { ok: false; expected: string; actual: string };

/** sha256 of the downloaded code, compared with the repo's value when present. */
export const checkIntegrity = (code: string, meta: SardPluginMeta | undefined): IntegrityResult => {
  if (!meta?.sha256) return { ok: true, checked: false };
  const actual = sha256Hex(code);
  return actual === meta.sha256
    ? { ok: true, checked: true }
    : { ok: false, expected: meta.sha256, actual };
};

export class PluginIntegrityError extends Error {
  constructor(
    public readonly pluginName: string,
    public readonly kind: 'sha256' | 'minAppVersion',
    detail: string,
  ) {
    super(
      kind === 'sha256'
        ? `تم إيقاف تثبيت «${pluginName}»: بصمة الملف لا تطابق بصمة المستودع (sha256). قد يكون الملف تغيّر أو تلف أثناء التنزيل. ${detail}`
        : `«${pluginName}» يحتاج إصدارًا أحدث من سَرد (${detail}).`,
    );
    this.name = 'PluginIntegrityError';
  }
}

/**
 * Attaches validated meta + the repo url to entries that carry `sard`.
 * Stock entries are returned untouched (same object).
 */
export const annotateRepoPlugins = <T extends { sard?: unknown }>(
  entries: T[],
  repoUrl: string,
): (T & { repoUrl?: string; sard?: SardPluginMeta })[] =>
  entries.map(e => {
    if (!e || typeof e !== 'object' || e.sard === undefined) return e as T & { sard?: SardPluginMeta };
    const meta = parseSardMeta(e.sard);
    if (!meta) {
      const { sard: _drop, ...rest } = e;
      return rest as T & { sard?: SardPluginMeta };
    }
    return { ...e, sard: meta, repoUrl };
  });

/** Distinct categories (Arabic-aware sort) for the filter chips. */
export const categoriesOf = (plugins: { sard?: SardPluginMeta }[]): string[] =>
  [...new Set(plugins.map(p => p.sard?.category).filter((c): c is string => !!c))].sort(
    (a, b) => a.localeCompare(b, 'ar'),
  );

export const filterByCategory = <T extends { sard?: SardPluginMeta }>(
  plugins: T[],
  category: string | null,
) => (category ? plugins.filter(p => p.sard?.category === category) : plugins);

export const HEALTH_LABELS: Record<HealthStatus, { ar: string; en: string; color: string; icon: string }> = {
  ok: { ar: 'يعمل', en: 'Working', color: '#2E7D32', icon: 'check-circle-outline' },
  degraded: { ar: 'متقطع', en: 'Degraded', color: '#F9A825', icon: 'alert-outline' },
  down: { ar: 'متوقف', en: 'Down', color: '#C62828', icon: 'close-circle-outline' },
  unknown: { ar: 'غير معروف', en: 'Unknown', color: '#757575', icon: 'help-circle-outline' },
};
