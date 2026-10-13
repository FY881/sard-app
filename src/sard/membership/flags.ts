/**
 * `sardFlags` — local feature-flag layer in front of every gate.
 *
 * Defaults live in the app (everything on). A signed remote-config JSON from
 * the owner (later: the «سَرد أدمن» backend) can switch features off, kill all
 * premium/extra features at once, revoke code ids and show a message.
 * Core reading is never switchable. Unsigned or older configs are rejected.
 */
import { base64Decode, canonicalJson, utf8ToBytes, verifyEd25519 } from './crypto';
import type { KeyValueStore } from './entitlementStore';
import type { L10n } from './tiers';

export const CONFIG_DOMAIN = 'SARD-CONFIG-v1';
export const REMOTE_CONFIG_KEY = 'SARD_REMOTE_CONFIG';
export const LOCAL_FLAGS_KEY = 'SARD_LOCAL_FLAGS';

export interface RemoteConfig {
  v: 1;
  /** unix seconds */
  issuedAt: number;
  /** unix seconds; after this the config is ignored */
  expiresAt?: number;
  flags?: Record<string, boolean>;
  /** Turns every switchable feature off (maintenance / emergency). */
  killAll?: boolean;
  revokedCodeIds?: string[];
  message?: L10n;
  signature: string;
}

export type ConfigError = 'json' | 'shape' | 'signature' | 'expired' | 'stale';

export const parseRemoteConfig = (
  input: string | object,
  publicKeyHex: string,
  nowMs = Date.now(),
): { ok: true; config: RemoteConfig } | { ok: false; error: ConfigError } => {
  let obj: any;
  try {
    obj = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return { ok: false, error: 'json' };
  }
  if (
    !obj ||
    obj.v !== 1 ||
    typeof obj.issuedAt !== 'number' ||
    typeof obj.signature !== 'string' ||
    (obj.flags !== undefined && (typeof obj.flags !== 'object' || Array.isArray(obj.flags))) ||
    (obj.revokedCodeIds !== undefined && !Array.isArray(obj.revokedCodeIds))
  ) {
    return { ok: false, error: 'shape' };
  }
  const { signature, ...body } = obj;
  const sig = base64Decode(signature);
  const ok =
    !!sig &&
    sig.length === 64 &&
    verifyEd25519(sig, utf8ToBytes(CONFIG_DOMAIN + canonicalJson(body)), publicKeyHex);
  if (!ok) return { ok: false, error: 'signature' };
  if (typeof obj.expiresAt === 'number' && obj.expiresAt * 1000 < nowMs) {
    return { ok: false, error: 'expired' };
  }
  return { ok: true, config: obj as RemoteConfig };
};

/** Keys that can never be switched off (free core reading). */
export const CORE_KEYS = new Set<string>(['core.reading']);

export class SardFlags {
  constructor(
    private readonly kv: KeyValueStore,
    private readonly publicKeyHex: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  getRemote(): RemoteConfig | undefined {
    const raw = this.kv.getString(REMOTE_CONFIG_KEY);
    if (!raw) return undefined;
    const res = parseRemoteConfig(raw, this.publicKeyHex, this.now());
    return res.ok ? res.config : undefined;
  }

  /** Validates and stores a remote config. Older configs never replace newer ones. */
  apply(input: string | object): { ok: true; config: RemoteConfig } | { ok: false; error: ConfigError } {
    const res = parseRemoteConfig(input, this.publicKeyHex, this.now());
    if (!res.ok) return res;
    const current = this.getRemote();
    if (current && res.config.issuedAt < current.issuedAt) return { ok: false, error: 'stale' };
    this.kv.set(REMOTE_CONFIG_KEY, JSON.stringify(res.config));
    return res;
  }

  clearRemote() {
    this.kv.set(REMOTE_CONFIG_KEY, '');
  }

  /** User-side toggles (e.g. turn a feature off for yourself). */
  getLocal(): Record<string, boolean> {
    try {
      return JSON.parse(this.kv.getString(LOCAL_FLAGS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  setLocal(key: string, enabled: boolean | undefined) {
    const next = { ...this.getLocal() };
    if (enabled === undefined) delete next[key];
    else next[key] = enabled;
    this.kv.set(LOCAL_FLAGS_KEY, JSON.stringify(next));
  }

  isEnabled(key: string): boolean {
    if (CORE_KEYS.has(key)) return true;
    const remote = this.getRemote();
    if (remote?.killAll) return false;
    if (remote?.flags && remote.flags[key] === false) return false;
    const local = this.getLocal();
    if (local[key] === false) return false;
    return true;
  }

  revokedCodeIds(): string[] {
    return this.getRemote()?.revokedCodeIds?.map(String) ?? [];
  }

  message(): L10n | undefined {
    return this.getRemote()?.message;
  }
}
