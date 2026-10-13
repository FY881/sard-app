/**
 * OpenAI-compatible chat/completions adapter (OpenRouter, local servers, …).
 *   POST {baseUrl}/chat/completions
 *   Authorization: Bearer <user key>
 *   { model, messages[{role, content, tool_calls?, tool_call_id?}], tools[{type:'function', function}],
 *     tool_choice, temperature, max_tokens, response_format }
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

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENAI_COMPAT_DEFAULT_MODEL = 'google/gemini-3.5-flash-lite';

export const normalizeBaseUrl = (url?: string) =>
  (url?.trim() || OPENROUTER_BASE_URL).replace(/\/+$/, '');

const toOpenAIMessages = (system: string | undefined, messages: AIMessage[]) => {
  const out: Record<string, unknown>[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.text });
    } else if (m.role === 'model') {
      const msg: Record<string, unknown> = {
        role: 'assistant',
        content: m.text || null,
      };
      if (m.functionCalls?.length) {
        msg.tool_calls = m.functionCalls.map(c => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
        }));
      }
      out.push(msg);
    } else {
      out.push({
        role: 'tool',
        tool_call_id: m.callId,
        content: JSON.stringify(m.response),
      });
    }
  }
  return out;
};

export const buildOpenAIRequest = (
  config: AIProviderConfig,
  req: AIGenerateRequest,
) => {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: toOpenAIMessages(req.system, req.messages),
  };
  if (req.tools?.length && req.toolMode !== 'none') {
    body.tools = req.tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    body.tool_choice = req.toolMode === 'any' ? 'required' : 'auto';
  }
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.maxOutputTokens !== undefined) body.max_tokens = req.maxOutputTokens;
  if (req.json) body.response_format = { type: 'json_object' };
  return {
    url: `${normalizeBaseUrl(config.baseUrl)}/chat/completions`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      // OpenRouter attribution headers (optional, harmless elsewhere).
      'HTTP-Referer': 'https://github.com/FY881/sard-app',
      'X-Title': 'Sard',
    },
    body,
  };
};

export const parseOpenAIResponse = (
  json: any,
  config: AIProviderConfig,
): AIGenerateResult => {
  if (json?.error) {
    throw errorFromHttp(
      Number(json.error.code) || 500,
      JSON.stringify({ error: json.error }),
    );
  }
  const choice = json?.choices?.[0];
  if (!choice) throw new AIError('EMPTY');
  const msg = choice.message ?? {};
  const text = String(msg.content ?? '').trim();
  const functionCalls: AIFunctionCall[] = (msg.tool_calls ?? [])
    .filter((c: any) => c?.function?.name)
    .map((c: any) => {
      let args: Record<string, unknown> = {};
      try {
        args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
      } catch {
        args = {};
      }
      return { id: String(c.id ?? c.function.name), name: c.function.name, args };
    });
  if (!text && !functionCalls.length) {
    if (choice.finish_reason === 'content_filter') {
      throw new AIError('SAFETY');
    }
    throw new AIError('EMPTY', { detail: choice.finish_reason });
  }
  return {
    text,
    functionCalls,
    message: {
      role: 'model',
      text,
      functionCalls: functionCalls.length ? functionCalls : undefined,
    },
    finishReason: choice.finish_reason,
    usage: json.usage
      ? {
          promptTokens: json.usage.prompt_tokens,
          outputTokens: json.usage.completion_tokens,
          totalTokens: json.usage.total_tokens,
        }
      : undefined,
    model: json.model ?? config.model,
    provider: 'openai-compatible',
  };
};

export const callOpenAICompat = async (
  fetchImpl: FetchLike,
  config: AIProviderConfig,
  req: AIGenerateRequest,
): Promise<AIGenerateResult> => {
  const { url, headers, body } = buildOpenAIRequest(config, req);
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
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AIError('PARSE', { detail: text.slice(0, 200) });
  }
  return parseOpenAIResponse(json, config);
};
