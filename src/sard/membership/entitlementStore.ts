/**
 * Entitlement storage and evaluation (pure; MMKV is injected).
 *
 * Shape is shared with the future «سَرد أدمن» app (owner + 5 roles):
 *   { tier, source: "code" | "trial" | "admin", issuedBy: "owner" | <role id>,
 *     issuedAt, expiresAt | null, deviceId?, codeId }
 * Codes are re-verified on every load, so editing the stored JSON cannot
 * raise the tier. Expiry → 3-day grace → back to Free with no data lost.
 */
import { verifyCode, type CodeError } from './code';
import { maxTier, tierRank, type AdminRole, type Tier } from './tiers';

export interface KeyValueStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

export type EntitlementSource = 'code' | 'trial' | 'admin';

export interface Entitlement {
  tier: Tier;
  source: EntitlementSource;
  issuedBy: 'owner' | AdminRole;
  /** ms */
  issuedAt: number;
  /** ms, null = lifetime */
  expiresAt: number | null;
  deviceId?: string;
  codeId: string;
  /** ms, when this device activated it */
  activatedAt: number;
  /** The signed code (code/admin sources) so it can be re-verified and restored. */
  code?: string;
}

export interface MembershipState {
  entitlements: Entitlement[];
  trialUsedAt?: number;
  /** Debug owner unlock — honoured only in dev builds. */
  devTier?: Tier;
}

export type MembershipStatus = 'free' | 'active' | 'grace';

export interface EffectiveMembership {
  tier: Tier;
  status: MembershipStatus;
  entitlement?: Entitlement;
  expiresAt: number | null;
  graceEndsAt: number | null;
  /** Whole days until expiry (or grace end while in grace); null = lifetime/free. */
  daysLeft: number | null;
  devOverride: boolean;
}

export const MEMBERSHIP_KEY = 'SARD_MEMBERSHIP_STATE';
export const DAY_MS = 86_400_000;
export const GRACE_DAYS = 3;
export const TRIAL_DAYS = 7;
export const TRIAL_TIER: Tier = 'plus';

export type ActivateResult =
  | { ok: true; entitlement: Entitlement; replaced: boolean }
  | { ok: false; error: CodeError | 'already' };

export type TrialResult =
  | { ok: true; entitlement: Entitlement }
  | { ok: false; error: 'used' | 'paid' };

export interface MembershipDeps {
  publicKeyHex: string;
  deviceId: () => string;
  now?: () => number;
  revokedCodeIds?: () => readonly string[];
  isDev?: boolean;
}

const emptyState = (): MembershipState => ({ entitlements: [] });

export class MembershipStore {
  constructor(
    private readonly kv: KeyValueStore,
    private readonly deps: MembershipDeps,
  ) {}

  private now() {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private readRaw(): MembershipState {
    const raw = this.kv.getString(MEMBERSHIP_KEY);
    if (!raw) return emptyState();
    try {
      const parsed = JSON.parse(raw) as MembershipState;
      return {
        entitlements: Array.isArray(parsed.entitlements) ? parsed.entitlements : [],
        trialUsedAt: typeof parsed.trialUsedAt === 'number' ? parsed.trialUsedAt : undefined,
        devTier: parsed.devTier,
      };
    } catch {
      return emptyState();
    }
  }

  private write(state: MembershipState) {
    this.kv.set(MEMBERSHIP_KEY, JSON.stringify(state));
  }

  /** Re-checks one stored entitlement against signature, device and revocation. */
  private stillValid(e: Entitlement): Entitlement | null {
    if (e.source === 'trial') {
      if (e.deviceId && e.deviceId !== this.deps.deviceId()) return null;
      if (e.tier !== TRIAL_TIER || e.expiresAt === null) return null;
      if (e.expiresAt - e.issuedAt > TRIAL_DAYS * DAY_MS + 1000) return null;
      return e;
    }
    if (!e.code) return null;
    const res = verifyCode(e.code, {
      publicKeyHex: this.deps.publicKeyHex,
      deviceId: this.deps.deviceId(),
      now: this.now(),
      revokedCodeIds: this.deps.revokedCodeIds?.(),
    });
    if (!res.ok) return null;
    // Trust only what the signature says.
    return {
      ...e,
      tier: res.code.tier,
      source: res.code.admin ? 'admin' : 'code',
      issuedBy: res.code.issuedBy,
      issuedAt: res.code.issuedAt,
      expiresAt: res.expiresAt,
      codeId: res.code.codeId,
    };
  }

  getState(): MembershipState {
    const raw = this.readRaw();
    return {
      ...raw,
      entitlements: raw.entitlements
        .map(e => this.stillValid(e))
        .filter((e): e is Entitlement => !!e),
    };
  }

  effective(): EffectiveMembership {
    const state = this.getState();
    const now = this.now();
    if (this.deps.isDev && state.devTier) {
      return {
        tier: state.devTier,
        status: state.devTier === 'free' ? 'free' : 'active',
        expiresAt: null,
        graceEndsAt: null,
        daysLeft: null,
        devOverride: true,
      };
    }
    let best: { e: Entitlement; status: MembershipStatus } | undefined;
    for (const e of state.entitlements) {
      const end = e.expiresAt;
      let status: MembershipStatus | undefined;
      if (end === null || now < end) status = 'active';
      else if (now < end + GRACE_DAYS * DAY_MS) status = 'grace';
      if (!status) continue;
      if (
        !best ||
        (status === 'active' && best.status === 'grace') ||
        (status === best.status &&
          (tierRank(e.tier) > tierRank(best.e.tier) ||
            (e.tier === best.e.tier && laterEnd(e, best.e))))
      ) {
        best = { e, status };
      }
    }
    if (!best) {
      return {
        tier: 'free',
        status: 'free',
        expiresAt: null,
        graceEndsAt: null,
        daysLeft: null,
        devOverride: false,
      };
    }
    const { e, status } = best;
    const graceEndsAt = e.expiresAt === null ? null : e.expiresAt + GRACE_DAYS * DAY_MS;
    const target = status === 'grace' ? graceEndsAt : e.expiresAt;
    return {
      tier: e.tier,
      status,
      entitlement: e,
      expiresAt: e.expiresAt,
      graceEndsAt,
      daysLeft: target === null ? null : Math.max(0, Math.ceil((target - now) / DAY_MS)),
      devOverride: false,
    };
  }

  activate(codeText: string): ActivateResult {
    const now = this.now();
    const res = verifyCode(codeText, {
      publicKeyHex: this.deps.publicKeyHex,
      deviceId: this.deps.deviceId(),
      now,
      revokedCodeIds: this.deps.revokedCodeIds?.(),
    });
    if (!res.ok) return res;
    if (res.expiresAt !== null && now >= res.expiresAt) return { ok: false, error: 'expired' };
    const raw = this.readRaw();
    const existing = raw.entitlements.find(x => x.codeId === res.code.codeId && x.source !== 'trial');
    const entitlement: Entitlement = {
      tier: res.code.tier,
      source: res.code.admin ? 'admin' : 'code',
      issuedBy: res.code.issuedBy,
      issuedAt: res.code.issuedAt,
      expiresAt: res.expiresAt,
      deviceId: res.code.deviceBound ? this.deps.deviceId() : undefined,
      codeId: res.code.codeId,
      activatedAt: existing?.activatedAt ?? now,
      code: codeText.trim(),
    };
    if (existing && this.stillValid(existing)) return { ok: false, error: 'already' };
    this.write({
      ...raw,
      entitlements: [
        ...raw.entitlements.filter(x => x.codeId !== entitlement.codeId || x.source === 'trial'),
        entitlement,
      ],
    });
    return { ok: true, entitlement, replaced: !!existing };
  }

  canStartTrial(): boolean {
    const raw = this.readRaw();
    if (raw.trialUsedAt) return false;
    return tierRank(this.effective().tier) < tierRank(TRIAL_TIER);
  }

  startTrial(): TrialResult {
    const raw = this.readRaw();
    if (raw.trialUsedAt) return { ok: false, error: 'used' };
    if (tierRank(this.effective().tier) >= tierRank(TRIAL_TIER)) return { ok: false, error: 'paid' };
    const now = this.now();
    const entitlement: Entitlement = {
      tier: TRIAL_TIER,
      source: 'trial',
      issuedBy: 'owner',
      issuedAt: now,
      expiresAt: now + TRIAL_DAYS * DAY_MS,
      deviceId: this.deps.deviceId(),
      codeId: `trial-${now.toString(36)}`,
      activatedAt: now,
    };
    this.write({ ...raw, trialUsedAt: now, entitlements: [...raw.entitlements, entitlement] });
    return { ok: true, entitlement };
  }

  /** Re-activates codes from a backup or a pasted list; returns how many were restored. */
  restore(codes: readonly string[]): { restored: number; failed: number } {
    let restored = 0;
    let failed = 0;
    for (const c of codes) {
      if (!c?.trim()) continue;
      const r = this.activate(c);
      if (r.ok || r.error === 'already') restored++;
      else failed++;
    }
    return { restored, failed };
  }

  /** Signed codes kept on this device (for the encrypted backup / restore). */
  exportCodes(): string[] {
    return this.readRaw()
      .entitlements.map(e => e.code)
      .filter((c): c is string => !!c);
  }

  remove(codeId: string) {
    const raw = this.readRaw();
    this.write({ ...raw, entitlements: raw.entitlements.filter(e => e.codeId !== codeId || e.source === 'trial') });
  }

  setDevTier(tier: Tier | undefined) {
    if (!this.deps.isDev) return false;
    this.write({ ...this.readRaw(), devTier: tier });
    return true;
  }

  /** Highest tier this device ever held (achievement / badge history). */
  bestEverTier(): Tier {
    return this.getState().entitlements.reduce<Tier>((t, e) => maxTier(t, e.tier), 'free');
  }
}

const laterEnd = (a: Entitlement, b: Entitlement) =>
  a.expiresAt === null || (b.expiresAt !== null && a.expiresAt > b.expiresAt);
