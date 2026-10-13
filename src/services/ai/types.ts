/**
 * Provider-neutral types for Sard's AI layer.
 *
 * Sard is a personal app with no backend: every request goes straight from the
 * device to the provider the user configured (Google Gemini with the user's own
 * free API key, or any OpenAI-compatible endpoint such as OpenRouter).
 */

export type AIProviderId = 'gemini' | 'openai-compatible';

/** A JSON-schema subset understood by both Gemini and OpenAI tool calling. */
export interface AIJsonSchema {
  type: 'object' | 'string' | 'integer' | 'number' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, AIJsonSchema>;
  required?: string[];
  items?: AIJsonSchema;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

export interface AIToolDeclaration {
  name: string;
  description: string;
  parameters: AIJsonSchema;
}

export interface AIFunctionCall {
  /** Provider call id (OpenAI) – Gemini has none, we synthesize one. */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * One turn of a conversation. `raw` keeps the provider's original content
 * object so it can be echoed back verbatim (Gemini 3 models require their
 * `thoughtSignature` parts to be returned unchanged during function calling).
 */
export type AIMessage =
  | { role: 'user'; text: string }
  | {
      role: 'model';
      text: string;
      functionCalls?: AIFunctionCall[];
      raw?: unknown;
    }
  | {
      role: 'tool';
      callId: string;
      name: string;
      response: Record<string, unknown>;
    };

export interface AIGenerateRequest {
  system?: string;
  messages: AIMessage[];
  tools?: AIToolDeclaration[];
  /** 'auto' lets the model answer in text; 'any' forces a tool call. */
  toolMode?: 'auto' | 'any' | 'none';
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask for a JSON response (structured output). */
  json?: boolean;
  /** Optional JSON schema for structured output (Gemini responseJsonSchema). */
  jsonSchema?: AIJsonSchema;
  signal?: AbortSignal;
}

export interface AIUsage {
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AIGenerateResult {
  text: string;
  functionCalls: AIFunctionCall[];
  /** Assistant message ready to be appended to history. */
  message: Extract<AIMessage, { role: 'model' }>;
  finishReason?: string;
  usage?: AIUsage;
  model: string;
  provider: AIProviderId;
}

export interface AIProviderConfig {
  provider: AIProviderId;
  apiKey: string;
  model: string;
  /** Only for openai-compatible providers, e.g. https://openrouter.ai/api/v1 */
  baseUrl?: string;
}

/** Minimal fetch signature so the HTTP layer can be injected in tests. */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/** Every AI feature that consumes the user's free quota. */
export type AIFeature =
  | 'recap'
  | 'summary'
  | 'glossary'
  | 'ask'
  | 'agent'
  | 'test';

export const AI_FEATURES: AIFeature[] = [
  'recap',
  'summary',
  'glossary',
  'ask',
  'agent',
];
