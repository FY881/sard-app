/**
 * Fetches exactly one page the user asked for and extracts it. No retries
 * in the background, no prefetch of linked pages.
 */
import { decodeHtmlBytes } from './charset';
import {
  extractArticle,
  NoReadableContentError,
  type ExtractedArticle,
} from './extract';
import { readerModeStrings as S, fmt } from '../export/strings';

const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 25000;

// A regular mobile browser UA: some sites refuse unknown clients.
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

export type ReaderModeErrorKind =
  | 'http'
  | 'timeout'
  | 'type'
  | 'size'
  | 'empty'
  | 'network';

export class ReaderModeError extends Error {
  kind: ReaderModeErrorKind;
  constructor(message: string, kind: ReaderModeErrorKind) {
    super(message);
    this.name = 'ReaderModeError';
    this.kind = kind;
  }
}

export interface FetchedPage extends ExtractedArticle {
  finalUrl: string;
  charset: string;
  fetchedAt: number;
}

const plainTextToHtml = (text: string) =>
  `<html><body>${text
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
    .join('')}</body></html>`;

export const fetchReadablePage = async (
  url: string,
  signal?: AbortSignal,
): Promise<FetchedPage> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  const cleanup = () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Language': 'ar,en;q=0.8',
      },
      signal: controller.signal,
    });
  } catch (error) {
    cleanup();
    if (controller.signal.aborted && !signal?.aborted) {
      throw new ReaderModeError(S.timeout, 'timeout');
    }
    throw new ReaderModeError(
      fmt(S.fetchFailed, {
        error: error instanceof Error ? error.message : String(error),
      }),
      'network',
    );
  }

  try {
    if (!response.ok) {
      throw new ReaderModeError(
        fmt(S.httpError, { status: response.status }),
        'http',
      );
    }
    const contentType = response.headers.get('content-type');
    if (contentType && !/html|xml|text\/plain/i.test(contentType)) {
      throw new ReaderModeError(
        fmt(S.notHtml, { type: contentType.split(';')[0] }),
        'type',
      );
    }
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES) {
      throw new ReaderModeError(S.tooLarge, 'size');
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      throw new ReaderModeError(S.tooLarge, 'size');
    }
    const { text, charset } = decodeHtmlBytes(
      new Uint8Array(buffer),
      contentType,
    );
    const finalUrl = response.url || url;
    const source = /text\/plain/i.test(contentType ?? '')
      ? plainTextToHtml(text)
      : text;
    try {
      return {
        ...extractArticle(source, finalUrl),
        finalUrl,
        charset,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      if (error instanceof NoReadableContentError) {
        throw new ReaderModeError(S.noContent, 'empty');
      }
      throw error;
    }
  } finally {
    cleanup();
  }
};
