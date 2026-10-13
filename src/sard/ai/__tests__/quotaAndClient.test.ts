import {
  QuotaCounter,
  dayKey,
  DEFAULT_QUOTA_LIMITS,
  type KeyValueStore,
} from '@services/ai/quota';
import { createAIClient } from '@services/ai/client';
import { buildGeminiRequest, parseGeminiResponse } from '@services/ai/gemini';
import {
  buildOpenAIRequest,
  parseOpenAIResponse,
} from '@services/ai/openaiCompat';
import { errorFromHttp, AIError } from '@services/ai/errors';
import { normalizeAISettings } from '@services/ai/config';
import type { FetchLike } from '@services/ai/types';
import { aiErrorMessage } from '../strings';

const memStore = (): KeyValueStore => {
  const data = new Map<string, string>();
  return { getString: k => data.get(k), set: (k, v) => void data.set(k, v) };
};

describe('QuotaCounter', () => {
  it('counts per feature and blocks at the feature cap', () => {
    const q = new QuotaCounter(memStore(), () => new Date(2026, 9, 11, 10));
    q.setLimits({
      ...DEFAULT_QUOTA_LIMITS,
      perFeature: { ...DEFAULT_QUOTA_LIMITS.perFeature, recap: 2 },
    });
    expect(q.check('recap').ok).toBe(true);
    q.consume('recap');
    q.consume('recap');
    const c = q.check('recap');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('feature');
    expect(q.check('ask').ok).toBe(true);
  });
  it('enforces the daily total and ignores test calls', () => {
    const q = new QuotaCounter(memStore(), () => new Date(2026, 9, 11));
    q.setLimits({ ...DEFAULT_QUOTA_LIMITS, dailyTotal: 3 });
    q.consume('ask');
    q.consume('summary');
    q.consume('test');
    q.consume('test');
    expect(q.usedTotal()).toBe(2);
    q.consume('agent');
    const c = q.check('glossary');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('total');
  });
  it('0 means unlimited', () => {
    const q = new QuotaCounter(memStore(), () => new Date(2026, 9, 11));
    q.setLimits({
      dailyTotal: 0,
      perFeature: { ...DEFAULT_QUOTA_LIMITS.perFeature, ask: 0 },
    });
    for (let i = 0; i < 500; i++) q.consume('ask');
    expect(q.check('ask').ok).toBe(true);
  });
  it('rolls over at local midnight and keeps history', () => {
    let now = new Date(2026, 9, 11, 23, 59);
    const q = new QuotaCounter(memStore(), () => now);
    q.consume('ask', 5);
    now = new Date(2026, 9, 12, 0, 1);
    expect(q.used('ask')).toBe(0);
    expect(q.getState().history[0]).toEqual({
      day: '2026-10-11',
      counts: { ask: 5 },
    });
  });
  it('refund never goes negative; reset clears today', () => {
    const q = new QuotaCounter(memStore(), () => new Date(2026, 9, 11));
    q.refund('ask');
    expect(q.used('ask')).toBe(0);
    q.consume('ask', 3);
    q.resetToday();
    expect(q.usedTotal()).toBe(0);
  });
  it('sanitizes corrupted limits', () => {
    const store = memStore();
    store.set(
      'SARD_AI_QUOTA_LIMITS',
      '{"dailyTotal":-5,"perFeature":{"ask":"abc"}}',
    );
    const q = new QuotaCounter(store);
    expect(q.getLimits().dailyTotal).toBe(DEFAULT_QUOTA_LIMITS.dailyTotal);
    expect(q.getLimits().perFeature.ask).toBe(
      DEFAULT_QUOTA_LIMITS.perFeature.ask,
    );
  });
  it('dayKey is local yyyy-mm-dd', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('Gemini request/response shape', () => {
  const cfg = {
    provider: 'gemini' as const,
    apiKey: 'AIzaTEST',
    model: 'gemini-3.5-flash-lite',
  };
  it('builds generateContent request with key header, system, tools and JSON', () => {
    const r = buildGeminiRequest(cfg, {
      system: 'sys',
      messages: [
        { role: 'user', text: 'hi' },
        {
          role: 'model',
          text: '',
          functionCalls: [{ id: '1', name: 'check_updates', args: {} }],
        },
        {
          role: 'tool',
          callId: '1',
          name: 'check_updates',
          response: { ok: true },
        },
      ],
      tools: [
        {
          name: 'check_updates',
          description: 'd',
          parameters: { type: 'object', properties: {} },
        },
      ],
      toolMode: 'auto',
      json: true,
      jsonSchema: { type: 'object' },
      maxOutputTokens: 10,
    });
    expect(r.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    );
    expect(r.headers['x-goog-api-key']).toBe('AIzaTEST');
    expect(r.url).not.toContain('AIzaTEST');
    const body = r.body as any;
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents.map((c: any) => c.role)).toEqual([
      'user',
      'model',
      'user',
    ]);
    expect(body.contents[2].parts[0].functionResponse.name).toBe(
      'check_updates',
    );
    expect(
      body.tools[0].functionDeclarations[0].parametersJsonSchema.type,
    ).toBe('object');
    expect(body.toolConfig.functionCallingConfig.mode).toBe('AUTO');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.maxOutputTokens).toBe(10);
  });
  it('echoes raw model parts (thought signatures) verbatim', () => {
    const raw = {
      role: 'model',
      parts: [
        { functionCall: { name: 'x', args: {} }, thoughtSignature: 'SIG' },
      ],
    };
    const r = buildGeminiRequest(cfg, {
      messages: [{ role: 'model', text: '', raw }],
    });
    expect((r.body as any).contents[0].parts[0].thoughtSignature).toBe('SIG');
  });
  it('parses text, thoughts and function calls', () => {
    const res = parseGeminiResponse(
      {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                { text: 'thinking', thought: true },
                { text: 'مرحبا' },
                { functionCall: { name: 'open_novel', args: { novel: 'x' } } },
              ],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 3,
          candidatesTokenCount: 2,
          totalTokenCount: 5,
        },
      },
      cfg,
    );
    expect(res.text).toBe('مرحبا');
    expect(res.functionCalls[0].name).toBe('open_novel');
    expect(res.usage?.totalTokens).toBe(5);
  });
  it('maps blocked prompts to SAFETY and empty to EMPTY', () => {
    expect(() =>
      parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }, cfg),
    ).toThrow(AIError);
    expect(() =>
      parseGeminiResponse(
        { candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] },
        cfg,
      ),
    ).toThrow(/EMPTY/);
  });
});

describe('OpenAI-compatible shape', () => {
  const cfg = {
    provider: 'openai-compatible' as const,
    apiKey: 'sk-x',
    model: 'm',
    baseUrl: 'https://openrouter.ai/api/v1/',
  };
  it('builds chat/completions request', () => {
    const r = buildOpenAIRequest(cfg, {
      system: 's',
      messages: [{ role: 'user', text: 'u' }],
      tools: [{ name: 't', description: 'd', parameters: { type: 'object' } }],
      toolMode: 'any',
    });
    expect(r.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(r.headers.Authorization).toBe('Bearer sk-x');
    expect((r.body as any).tool_choice).toBe('required');
    expect((r.body as any).messages[0]).toEqual({
      role: 'system',
      content: 's',
    });
  });
  it('parses tool calls with JSON arguments', () => {
    const res = parseOpenAIResponse(
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'c1', function: { name: 't', arguments: '{"a":1}' } },
              ],
            },
          },
        ],
      },
      cfg,
    );
    expect(res.functionCalls).toEqual([{ id: 'c1', name: 't', args: { a: 1 } }]);
  });
});

describe('errors', () => {
  it('maps 429 with RetryInfo', () => {
    const e = errorFromHttp(
      429,
      JSON.stringify({
        error: { message: 'quota', details: [{ retryDelay: '17s' }] },
      }),
    );
    expect(e.code).toBe('RATE_LIMIT');
    expect(e.retryAfterSec).toBe(17);
    expect(aiErrorMessage(e)).toContain('17');
  });
  it('maps invalid key', () => {
    expect(
      errorFromHttp(
        400,
        JSON.stringify({
          error: { message: 'API key not valid. Please pass a valid API key.' },
        }),
      ).code,
    ).toBe('INVALID_KEY');
  });
  it('gives Arabic message for NO_KEY', () => {
    expect(aiErrorMessage(new AIError('NO_KEY'))).toMatch(/مفتاح/);
  });
});

describe('AI client pipeline (no network)', () => {
  const okBody = JSON.stringify({
    candidates: [{ content: { parts: [{ text: 'تمام' }] }, finishReason: 'STOP' }],
  });
  const mkFetch = (responses: { status: number; body: string }[]) => {
    const calls: string[] = [];
    const f: FetchLike = async (_url, init) => {
      calls.push(init.body);
      const r = responses.shift() ?? { status: 200, body: okBody };
      return {
        ok: r.status < 300,
        status: r.status,
        text: async () => r.body,
        headers: { get: () => null },
      };
    };
    return { f, calls };
  };
  const quota = () => new QuotaCounter(memStore(), () => new Date(2026, 9, 11));
  const msg = { messages: [{ role: 'user' as const, text: 'x' }] };

  it('throws NO_KEY without calling fetch', async () => {
    const { f, calls } = mkFetch([]);
    const client = createAIClient({
      getSettings: () => normalizeAISettings({}),
      getKey: () => '',
      quota: quota(),
      fetch: f,
    });
    await expect(client.generate('recap', msg)).rejects.toMatchObject({
      code: 'NO_KEY',
    });
    expect(calls).toHaveLength(0);
  });
  it('blocks when the local quota is exhausted', async () => {
    const { f, calls } = mkFetch([]);
    const q = quota();
    q.setLimits({
      ...DEFAULT_QUOTA_LIMITS,
      perFeature: { ...DEFAULT_QUOTA_LIMITS.perFeature, ask: 1 },
    });
    const client = createAIClient({
      getSettings: () => normalizeAISettings({}),
      getKey: () => 'k',
      quota: q,
      fetch: f,
    });
    await client.generate('ask', msg);
    await expect(client.generate('ask', msg)).rejects.toMatchObject({
      code: 'LOCAL_QUOTA',
    });
    expect(calls).toHaveLength(1);
  });
  it('retries once on a short 429 and counts both attempts', async () => {
    const { f, calls } = mkFetch([
      {
        status: 429,
        body: JSON.stringify({
          error: { message: 'x', details: [{ retryDelay: '1s' }] },
        }),
      },
      { status: 200, body: okBody },
    ]);
    const q = quota();
    const client = createAIClient({
      getSettings: () => normalizeAISettings({}),
      getKey: () => 'k',
      quota: q,
      fetch: f,
      sleep: async () => {},
    });
    const r = await client.generate('summary', msg);
    expect(r.text).toBe('تمام');
    expect(calls).toHaveLength(2);
    expect(q.used('summary')).toBe(2);
  });
  it('refunds quota on network failure', async () => {
    const q = quota();
    const client = createAIClient({
      getSettings: () => normalizeAISettings({}),
      getKey: () => 'k',
      quota: q,
      fetch: async () => {
        throw new TypeError('Network request failed');
      },
    });
    await expect(client.generate('ask', msg)).rejects.toMatchObject({
      code: 'NETWORK',
    });
    expect(q.used('ask')).toBe(0);
  });
  it('DISABLED unless ignoreDisabled (test button)', async () => {
    const { f } = mkFetch([]);
    const client = createAIClient({
      getSettings: () => normalizeAISettings({ enabled: false }),
      getKey: () => 'k',
      quota: quota(),
      fetch: f,
    });
    await expect(client.generate('ask', msg)).rejects.toMatchObject({
      code: 'DISABLED',
    });
    const t = await client.testConnection();
    expect(t.ok).toBe(true);
  });
});
