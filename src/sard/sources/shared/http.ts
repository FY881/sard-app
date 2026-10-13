import { fetchApi } from '@plugins/helpers/fetch';
import { SARD_SOURCE_STRINGS as S } from '../strings';

export class SourceError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SourceError';
    this.status = status;
  }
}

export interface RequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Number of extra attempts on network errors / 5xx / 429. */
  retries?: number;
  method?: string;
  body?: string;
}

const DEFAULT_TIMEOUT = 30000;

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const looksLikeChallenge = (status: number, text: string) =>
  (status === 403 || status === 503) &&
  /just a moment|cf-chl|challenge-platform|captcha/i.test(text);

/**
 * fetch() with timeout, retry with backoff and Arabic error messages.
 * Uses LNReader's fetchApi so the user-configured User-Agent is applied
 * unless a header overrides it.
 */
export const request = async (
  url: string,
  options: RequestOptions = {},
): Promise<Response> => {
  const retries = options.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(
          () => controller.abort(),
          options.timeoutMs ?? DEFAULT_TIMEOUT,
        )
      : null;
    try {
      const res = await fetchApi(url, {
        method: options.method ?? 'GET',
        headers: { ...(options.headers ?? {}) },
        ...(options.body ? { body: options.body } : {}),
        ...(controller ? { signal: controller.signal as any } : {}),
      });
      if (res.ok) {
        return res;
      }
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        const retryAfter = Number(res.headers?.get?.('retry-after'));
        await sleep(
          retryAfter > 0
            ? Math.min(retryAfter * 1000, 8000)
            : (res.status === 429 ? 2000 : 800) * (attempt + 1),
        );
        continue;
      }
      let text = '';
      try {
        text = await res.text();
      } catch {
        // ignore
      }
      if (looksLikeChallenge(res.status, text)) {
        throw new SourceError(S.errBlocked, res.status);
      }
      if (res.status === 404) {
        throw new SourceError(S.errNotFound, 404);
      }
      throw new SourceError(S.errHttp(res.status), res.status);
    } catch (e: any) {
      if (e instanceof SourceError) {
        throw e;
      }
      lastError = e;
      if (attempt < retries) {
        await sleep(800 * (attempt + 1));
        continue;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  const err = lastError as any;
  if (err?.name === 'AbortError') {
    throw new SourceError(S.errTimeout);
  }
  throw new SourceError(S.errNetwork);
};

export const getText = async (url: string, options?: RequestOptions) => {
  const res = await request(url, options);
  const text = await res.text();
  if (/<title>\s*Just a moment/i.test(text.slice(0, 2000))) {
    throw new SourceError(S.errBlocked, 403);
  }
  return text;
};

export const getJson = async <T = any>(
  url: string,
  options?: RequestOptions,
): Promise<T> => {
  const text = await getText(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options?.headers ?? {}) },
  });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceError(S.errParse);
  }
};

export const buildQuery = (
  params: Record<string, string | number | boolean | undefined | null>,
) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join('&');

/** Small LRU cache used to avoid re-downloading large book HTML. */
export class LruCache<V> {
  private map = new Map<string, V>();
  constructor(private readonly max: number) {}
  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: string, value: V) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const first = this.map.keys().next().value as string;
      this.map.delete(first);
    }
  }
  delete(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

/** Deduplicate concurrent requests for the same key. */
export const singleFlight = <V>() => {
  const inflight = new Map<string, Promise<V>>();
  return (key: string, fn: () => Promise<V>): Promise<V> => {
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = fn().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
};
