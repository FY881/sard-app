/**
 * Google Gemini REST adapter (generateContent).
 *
 * Request shape verified 2026-10-11 against https://ai.google.dev/api/generate-content
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   header  x-goog-api-key: <user key>
 *   body    { contents[{role, parts[{text}|{functionCall}|{functionResponse}]}],
 *             systemInstruction{parts[{text}]},
 *             tools[{functionDeclarations[{name, description, parametersJsonSchema}]}],
 *             toolConfig{functionCallingConfig{mode, allowedFunctionNames}},
 *             generationConfig{temperature, maxOutputTokens, responseMimeType,
 *                              responseJsonSchema} }
 *   reply   { candidates[{content{role, parts[]}, finishReason}],
 *             promptFeedback{blockReason}, usageMetadata{...}, modelVersion }
 *
 * Model parts are echoed back verbatim (`raw`) so Gemini 3 thought signatures
 * survive multi-turn function calling.
 */
import { AIError, errorFromHttp } from './errors';
import type {
  AIFunctionCall,
  AIGenerateRequest,
  AIGenerateResult,
  AIMessage,
  AIProviderConfig,
  FetchLike,
} from './types';

export const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta';

/** Free-tier text models suggested in settings (from ai.google.dev pricing). */
export const GEMINI_SUGGESTED_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
] as const;

export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';

type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
    id?: string;
  };
};

type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

const toGeminiContents = (messages: AIMessage[]): GeminiContent[] => {
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.text }] });
    } else if (m.role === 'model') {
      const raw = m.raw as GeminiContent | undefined;
      if (raw && Array.isArray(raw.parts)) {
        contents.push({ role: 'model', parts: raw.parts });
      } else {
        const parts: GeminiPart[] = [];
        if (m.text) parts.push({ text: m.text });
        for (const c of m.functionCalls ?? []) {
          parts.push({ functionCall: { name: c.name, args: c.args } });
        }
        if (parts.length) contents.push({ role: 'model', parts });
      }
    } else {
      const part: GeminiPart = {
        functionResponse: { name: m.name, response: m.response },
      };
      // Consecutive tool results belong in one user turn.
      const last = contents[contents.length - 1];
      if (last && last.role === 'user' && last.parts[0]?.functionResponse) {
        last.parts.push(part);
      } else {
        contents.push({ role: 'user', parts: [part] });
      }
    }
  }
  return contents;
};

export const buildGeminiRequest = (
  config: AIProviderConfig,
  req: AIGenerateRequest,
  options: { omitJsonSchema?: boolean } = {},
) => {
  const body: Record<string, unknown> = {
    contents: toGeminiContents(req.messages),
  };
  if (req.system) {
    body.systemInstruction = { parts: [{ text: req.system }] };
  }
  if (req.tools?.length && req.toolMode !== 'none') {
    body.tools = [
      {
        functionDeclarations: req.tools.map(t => ({
          name: t.name,
          description: t.description,
          parametersJsonSchema: t.parameters,
        })),
      },
    ];
    body.toolConfig = {
      functionCallingConfig:
        req.toolMode === 'any'
          ? {
              mode: 'ANY',
              allowedFunctionNames: req.tools.map(t => t.name),
            }
          : { mode: 'AUTO' },
    };
  }
  const generationConfig: Record<string, unknown> = {};
  if (req.temperature !== undefined) {
    generationConfig.temperature = req.temperature;
  }
  if (req.maxOutputTokens !== undefined) {
    generationConfig.maxOutputTokens = req.maxOutputTokens;
  }
  if (req.json) {
    generationConfig.responseMimeType = 'application/json';
    if (req.jsonSchema && !options.omitJsonSchema) {
      generationConfig.responseJsonSchema = req.jsonSchema;
    }
  }
  if (Object.keys(generationConfig).length) {
    body.generationConfig = generationConfig;
  }
  const model = encodeURIComponent(config.model.replace(/^models\//, ''));
  return {
    url: `${GEMINI_BASE_URL}/models/${model}:generateContent`,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body,
  };
};

let callCounter = 0;

export const parseGeminiResponse = (
  json: any,
  config: AIProviderConfig,
): AIGenerateResult => {
  const blockReason = json?.promptFeedback?.blockReason;
  const candidate = json?.candidates?.[0];
  if (!candidate) {
    if (blockReason) {
      throw new AIError('SAFETY', { detail: String(blockReason) });
    }
    throw new AIError('EMPTY');
  }
  const parts: GeminiPart[] = candidate?.content?.parts ?? [];
  const text = parts
    .filter(p => typeof p.text === 'string' && !p.thought)
    .map(p => p.text)
    .join('')
    .trim();
  const functionCalls: AIFunctionCall[] = parts
    .filter(p => p.functionCall?.name)
    .map(p => ({
      id: p.functionCall!.id ?? `gemini-call-${++callCounter}`,
      name: p.functionCall!.name,
      args: (p.functionCall!.args ?? {}) as Record<string, unknown>,
    }));
  const finishReason: string | undefined = candidate.finishReason;
  if (!text && !functionCalls.length) {
    if (
      finishReason &&
      ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(
        finishReason,
      )
    ) {
      throw new AIError('SAFETY', { detail: finishReason });
    }
    throw new AIError('EMPTY', { detail: finishReason });
  }
  const usage = json?.usageMetadata;
  return {
    text,
    functionCalls,
    message: {
      role: 'model',
      text,
      functionCalls: functionCalls.length ? functionCalls : undefined,
      raw: { role: 'model', parts },
    },
    finishReason,
    usage: usage
      ? {
          promptTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
        }
      : undefined,
    model: json?.modelVersion ?? config.model,
    provider: 'gemini',
  };
};

export const callGemini = async (
  fetchImpl: FetchLike,
  config: AIProviderConfig,
  req: AIGenerateRequest,
): Promise<AIGenerateResult> => {
  const attempt = async (omitJsonSchema: boolean) => {
    const { url, headers, body } = buildGeminiRequest(config, req, {
      omitJsonSchema,
    });
    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: req.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw errorFromHttp(
        res.status,
        text,
        res.headers?.get('retry-after') ?? null,
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new AIError('PARSE', { detail: text.slice(0, 200) });
    }
  };
  let json: any;
  try {
    json = await attempt(false);
  } catch (e) {
    // Older/lite models may reject a JSON schema: retry once with plain JSON mode.
    if (
      e instanceof AIError &&
      e.code === 'BAD_REQUEST' &&
      req.json &&
      req.jsonSchema
    ) {
      json = await attempt(true);
    } else {
      throw e;
    }
  }
  return parseGeminiResponse(json, config);
};
