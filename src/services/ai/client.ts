/**
 * Provider-neutral AI client with quota protection, timeouts and a single
 * polite retry on 429. Dependency-injected (no React Native imports) so the
 * whole request pipeline can be unit-tested without network.
 */
import { AIError, isAIError } from './errors';
import { callGemini } from './gemini';
import { callOpenAICompat } from './openaiCompat';
import type { AISettings } from './config';
import type { QuotaCounter } from './quota';
import type {
  AIFeature,
  AIGenerateRequest,
  AIGenerateResult,
  AIProviderConfig,
  AIProviderId,
  FetchLike,
} from './types';

export interface AIClientDeps {
  getSettings: () => AISettings;
  getKey: (provider: AIProviderId) => string;
  quota: Pick<QuotaCounter, 'check' | 'consume' | 'refund'>;
  fetch: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export interface AIGenerateOptions {
  /** Skip the master switch (used by the settings «test» button). */
  ignoreDisabled?: boolean;
  /** Override provider/model/key (settings test before saving). */
  overrideConfig?: Partial<AIProviderConfig>;
}

export const resolveProviderConfig = (
  settings: AISettings,
  getKey: (p: AIProviderId) => string,
  override?: Partial<AIProviderConfig>,
): AIProviderConfig => {
  const provider = override?.provider ?? settings.provider;
  return {
    provider,
    apiKey: (override?.apiKey ?? getKey(provider)).trim(),
    model:
      override?.model ??
      (provider === 'gemini' ? settings.geminiModel : settings.openaiModel),
    baseUrl:
      override?.baseUrl ??
      (provider === 'openai-compatible' ? settings.openaiBaseUrl : undefined),
  };
};

const withTimeout = (fetchImpl: FetchLike, timeoutMs: number): FetchLike => {
  return async (url, init) => {
    if (typeof AbortController === 'undefined') return fetchImpl(url, init);
    const controller = new AbortController();
    const outer = init.signal;
    const onAbort = () => controller.abort();
    outer?.addEventListener?.('abort', onAbort);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (e) {
      if (outer?.aborted) throw new AIError('ABORTED');
      if (controller.signal.aborted) throw new AIError('TIMEOUT');
      throw e;
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener?.('abort', onAbort);
    }
  };
};

export const createAIClient = (deps: AIClientDeps) => {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
  const fetchImpl = withTimeout(deps.fetch, deps.timeoutMs ?? 90000);

  const generate = async (
    feature: AIFeature,
    req: AIGenerateRequest,
    options: AIGenerateOptions = {},
  ): Promise<AIGenerateResult> => {
    const settings = deps.getSettings();
    if (!settings.enabled && !options.ignoreDisabled) {
      throw new AIError('DISABLED');
    }
    const config = resolveProviderConfig(
      settings,
      deps.getKey,
      options.overrideConfig,
    );
    if (!config.apiKey) throw new AIError('NO_KEY');

    const call = () =>
      config.provider === 'gemini'
        ? callGemini(fetchImpl, config, req)
        : callOpenAICompat(fetchImpl, config, req);

    const runCounted = async () => {
      const check = deps.quota.check(feature);
      if (!check.ok) {
        throw new AIError('LOCAL_QUOTA', {
          detail: `${check.reason}:${check.used}/${check.limit}`,
        });
      }
      deps.quota.consume(feature);
      try {
        return await call();
      } catch (e) {
        // Requests that never reached the provider don't cost quota.
        if (isAIError(e) && (e.code === 'ABORTED' || e.code === 'TIMEOUT')) {
          deps.quota.refund(feature);
          throw e;
        }
        if (!isAIError(e)) {
          deps.quota.refund(feature);
          throw new AIError('NETWORK', { detail: String(e) });
        }
        throw e;
      }
    };

    try {
      return await runCounted();
    } catch (e) {
      if (
        isAIError(e) &&
        e.code === 'RATE_LIMIT' &&
        settings.autoRetryOnRateLimit &&
        (e.retryAfterSec ?? 5) <= 20 &&
        !req.signal?.aborted
      ) {
        await sleep(((e.retryAfterSec ?? 5) + 1) * 1000);
        return runCounted();
      }
      throw e;
    }
  };

  /** Cheap request used by the settings screen «اختبار المفتاح». */
  const testConnection = async (override?: Partial<AIProviderConfig>) => {
    const started = Date.now();
    const result = await generate(
      'test',
      {
        messages: [{ role: 'user', text: 'ردّ بكلمة واحدة فقط: تمام' }],
        maxOutputTokens: 256,
        temperature: 0,
      },
      { ignoreDisabled: true, overrideConfig: override },
    );
    return {
      ok: true as const,
      latencyMs: Date.now() - started,
      model: result.model,
      reply: result.text.slice(0, 40),
    };
  };

  return { generate, testConnection };
};

export type AIClient = ReturnType<typeof createAIClient>;
