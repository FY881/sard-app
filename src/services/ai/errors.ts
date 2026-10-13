/**
 * Typed AI errors. Every code maps to a clear Arabic message in
 * `src/sard/ai/strings.ts` (aiErrorMessage) so the UI never shows raw HTTP.
 */
export type AIErrorCode =
  | 'NO_KEY'
  | 'DISABLED'
  | 'LOCAL_QUOTA'
  | 'RATE_LIMIT'
  | 'INVALID_KEY'
  | 'MODEL_NOT_FOUND'
  | 'BAD_REQUEST'
  | 'SAFETY'
  | 'EMPTY'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'SERVER'
  | 'PARSE';

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly status?: number;
  /** Seconds the provider asked us to wait (429 Retry-After / RetryInfo). */
  readonly retryAfterSec?: number;
  readonly detail?: string;

  constructor(
    code: AIErrorCode,
    options: { status?: number; retryAfterSec?: number; detail?: string } = {},
  ) {
    super(`AIError(${code})${options.detail ? ': ' + options.detail : ''}`);
    this.name = 'AIError';
    this.code = code;
    this.status = options.status;
    this.retryAfterSec = options.retryAfterSec;
    this.detail = options.detail;
  }
}

export const isAIError = (e: unknown): e is AIError =>
  e instanceof AIError ||
  (typeof e === 'object' && e !== null && (e as AIError).name === 'AIError');

/** Parses "37s" / "1.5s" (Google RetryInfo) or "12" (Retry-After). */
export const parseRetryDelay = (value?: string | null): number | undefined => {
  if (!value) return undefined;
  const m = String(value)
    .trim()
    .match(/^(\d+(?:\.\d+)?)s?$/);
  if (!m) return undefined;
  return Math.ceil(parseFloat(m[1]));
};

/** Maps an HTTP status + provider error body to an AIError. */
export const errorFromHttp = (
  status: number,
  bodyText: string,
  retryAfterHeader?: string | null,
): AIError => {
  let message = '';
  let retryAfterSec = parseRetryDelay(retryAfterHeader);
  try {
    const body = JSON.parse(bodyText);
    const err = Array.isArray(body) ? body[0]?.error : body?.error;
    message = String(err?.message ?? '');
    const details: unknown[] = Array.isArray(err?.details) ? err.details : [];
    for (const d of details) {
      const delay = (d as { retryDelay?: string })?.retryDelay;
      if (delay) retryAfterSec = parseRetryDelay(delay) ?? retryAfterSec;
    }
  } catch {
    message = bodyText.slice(0, 300);
  }
  const lower = message.toLowerCase();
  if (status === 429) {
    return new AIError('RATE_LIMIT', { status, retryAfterSec, detail: message });
  }
  if (
    status === 401 ||
    status === 403 ||
    lower.includes('api key not valid') ||
    lower.includes('api_key_invalid') ||
    lower.includes('invalid api key')
  ) {
    return new AIError('INVALID_KEY', { status, detail: message });
  }
  if (status === 404 || lower.includes('not found for api version')) {
    return new AIError('MODEL_NOT_FOUND', { status, detail: message });
  }
  if (status === 400) {
    return new AIError('BAD_REQUEST', { status, detail: message });
  }
  if (status === 408 || status === 504) {
    return new AIError('TIMEOUT', { status, detail: message });
  }
  return new AIError('SERVER', { status, detail: message });
};
