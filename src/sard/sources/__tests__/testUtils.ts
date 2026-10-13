/* Shared helpers for the bundled-source tests (fixtures + fake fetch). */
import * as fs from 'fs';
import * as path from 'path';

export const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

type Route = [RegExp | string, string | (() => string), number?];

export interface FakeFetch {
  calls: string[];
  fn: (url: string, init?: any) => Promise<any>;
}

/** Routes requests by URL substring/regex to fixture bodies. */
export const fakeFetch = (routes: Route[]): FakeFetch => {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const route = routes.find(([m]) =>
      typeof m === 'string' ? url.includes(m) : m.test(url),
    );
    const status = route ? route[2] ?? 200 : 404;
    const body = route
      ? typeof route[1] === 'function'
        ? (route[1] as () => string)()
        : route[1]
      : 'not found';
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      text: async () => body,
      json: async () => JSON.parse(body),
    };
  };
  return { calls, fn };
};

export const installFetch = (routes: Route[]) => {
  const ff = fakeFetch(routes);
  (global as any).fetch = jest.fn(ff.fn);
  return ff;
};

export const stripHtml = (s: string) =>
  s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
