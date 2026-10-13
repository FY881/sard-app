/**
 * Fixed whitelist of LOCAL tools the agent chat may call (pure).
 *
 * The model only ever sees these declarations; any call outside the list, or
 * with invalid arguments, is rejected by `validateToolCall` before execution.
 * There is deliberately NO tool that searches the web or adds sources,
 * repositories, plugins or sites.
 */
import type { AIJsonSchema, AIToolDeclaration } from '@services/ai/types';

export type ToolName =
  | 'download_chapters'
  | 'summarize_chapter'
  | 'summarize_volume'
  | 'recap_novel'
  | 'organize_library'
  | 'show_shelf'
  | 'find_duplicates'
  | 'recommend_novels'
  | 'check_updates'
  | 'set_auto_download'
  | 'mark_chapters_read'
  | 'delete_downloads'
  | 'remove_from_library'
  | 'open_novel'
  | 'usage_today';

export interface ToolSpec {
  name: ToolName;
  description: string;
  parameters: AIJsonSchema;
  /** Changes or deletes user data → always asks for confirmation. */
  destructive: boolean;
  /** Requires the target novel to be resolved from the library. */
  needsNovel: boolean;
}

const novelQuery: AIJsonSchema = {
  type: 'string',
  description: 'اسم الرواية كما كتبه المستخدم (أو جزء منه)',
};

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'download_chapters',
    description:
      'تنزيل فصول رواية من المكتبة. which=latest لآخر الفصول المنشورة، next للفصول التالية غير المقروءة، all لكل غير المحمّل.',
    parameters: {
      type: 'object',
      properties: {
        novel: novelQuery,
        count: { type: 'integer', minimum: 1, maximum: 500 },
        which: { type: 'string', enum: ['latest', 'next', 'all'] },
      },
      required: ['novel'],
    },
    destructive: false,
    needsNovel: true,
  },
  {
    name: 'summarize_chapter',
    description:
      'تلخيص فصل. chapter رقم الفصل أو اسمه، أو "current" للفصل الحالي/آخر فصل مقروء.',
    parameters: {
      type: 'object',
      properties: {
        novel: novelQuery,
        chapter: { type: 'string' },
      },
      required: ['novel'],
    },
    destructive: false,
    needsNovel: true,
  },
  {
    name: 'summarize_volume',
    description:
      'تلخيص مجلد أو نطاق فصول (آمن من الحرق: حتى آخر فصل مقروء فقط). volume رقم المجلد، أو from_chapter/to_chapter.',
    parameters: {
      type: 'object',
      properties: {
        novel: novelQuery,
        volume: { type: 'integer', minimum: 1, maximum: 999 },
        from_chapter: { type: 'integer', minimum: 1 },
        to_chapter: { type: 'integer', minimum: 1 },
      },
      required: ['novel'],
    },
    destructive: false,
    needsNovel: true,
  },
  {
    name: 'recap_novel',
    description: 'كتابة «ما سبق» قبل متابعة القراءة في رواية.',
    parameters: {
      type: 'object',
      properties: { novel: novelQuery },
      required: ['novel'],
    },
    destructive: false,
    needsNovel: true,
  },
  {
    name: 'organize_library',
    description:
      'ترتيب المكتبة في فئات ذكية (متوقفة، قربت تخلص، جاهزة للقراءة المتواصلة، لم تبدأ، منتهية) — يضيف الروايات للفئات دون حذف شيء.',
    parameters: { type: 'object', properties: {} },
    destructive: true,
    needsNovel: false,
  },
  {
    name: 'show_shelf',
    description: 'عرض رف ذكي من المكتبة.',
    parameters: {
      type: 'object',
      properties: {
        shelf: {
          type: 'string',
          enum: [
            'paused',
            'near_finish',
            'binge_ready',
            'not_started',
            'finished',
          ],
        },
      },
      required: ['shelf'],
    },
    destructive: false,
    needsNovel: false,
  },
  {
    name: 'find_duplicates',
    description: 'إيجاد الروايات المكررة بنفس العنوان من مصادر مختلفة.',
    parameters: { type: 'object', properties: {} },
    destructive: false,
    needsNovel: false,
  },
  {
    name: 'recommend_novels',
    description:
      'اقتراح روايات من قوائم «الأكثر شهرة» في المصادر المثبتة لدى المستخدم فقط، حسب ذوقه.',
    parameters: {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1, maximum: 20 } },
    },
    destructive: false,
    needsNovel: false,
  },
  {
    name: 'check_updates',
    description: 'التحقق من الفصول الجديدة لروايات المكتبة الآن.',
    parameters: { type: 'object', properties: {} },
    destructive: false,
    needsNovel: false,
  },
  {
    name: 'set_auto_download',
    description:
      'تفعيل/إيقاف التنزيل التلقائي للفصول التالية لرواية (مراقب الفصول).',
    parameters: {
      type: 'object',
      properties: {
        novel: novelQuery,
        enabled: { type: 'boolean' },
        count: { type: 'integer', minimum: 1, maximum: 100 },
        wifi_only: { type: 'boolean' },
      },
      required: ['novel', 'enabled'],
    },
    destructive: false,
    needsNovel: true,
  },
  {
    name: 'mark_chapters_read',
    description: 'تعليم الفصول كمقروءة حتى الفصل رقم up_to_chapter.',
    parameters: {
      type: 'object',
      properties: {
        novel: novelQuery,
        up_to_chapter: { type: 'integer', minimum: 1 },
      },
      required: ['novel', 'up_to_chapter'],
    },
    destructive: true,
    needsNovel: true,
  },
  {
    name: 'delete_downloads',
    description:
      'حذف الفصول المحمّلة لرواية. scope=read للمقروءة فقط، all للكل.',
    parameters: {
      type: 'object',
      properties: {
        novel: novelQuery,
        scope: { type: 'string', enum: ['read', 'all'] },
      },
      required: ['novel'],
    },
    destructive: true,
    needsNovel: true,
  },
  {
    name: 'remove_from_library',
    description: 'إزالة رواية من المكتبة.',
    parameters: {
      type: 'object',
      properties: { novel: novelQuery },
      required: ['novel'],
    },
    destructive: true,
    needsNovel: true,
  },
  {
    name: 'open_novel',
    description: 'فتح صفحة رواية من المكتبة.',
    parameters: {
      type: 'object',
      properties: { novel: novelQuery },
      required: ['novel'],
    },
    destructive: false,
    needsNovel: true,
  },
  {
    name: 'usage_today',
    description: 'عرض استهلاك الذكاء الاصطناعي اليوم والحدود المحلية.',
    parameters: { type: 'object', properties: {} },
    destructive: false,
    needsNovel: false,
  },
];

export const TOOL_NAMES = new Set<string>(TOOL_SPECS.map(t => t.name));

export const getToolSpec = (name: string) =>
  TOOL_SPECS.find(t => t.name === name);

export const toolDeclarations = (): AIToolDeclaration[] =>
  TOOL_SPECS.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));

export type ValidatedCall =
  | { ok: true; name: ToolName; args: Record<string, unknown>; spec: ToolSpec }
  | { ok: false; error: 'unknown_tool' | 'invalid_args'; detail: string };

const coerce = (schema: AIJsonSchema, value: unknown): [boolean, unknown] => {
  switch (schema.type) {
    case 'string': {
      if (value === undefined || value === null) return [false, value];
      const s = String(value).trim().slice(0, 200);
      if (!s) return [false, s];
      if (schema.enum && !schema.enum.includes(s)) return [false, s];
      return [true, s];
    }
    case 'integer':
    case 'number': {
      const n =
        typeof value === 'string' ? Number(value.trim()) : Number(value);
      if (!Number.isFinite(n)) return [false, value];
      const v = schema.type === 'integer' ? Math.round(n) : n;
      if (schema.minimum !== undefined && v < schema.minimum) return [false, v];
      if (schema.maximum !== undefined && v > schema.maximum) return [false, v];
      return [true, v];
    }
    case 'boolean': {
      if (typeof value === 'boolean') return [true, value];
      if (value === 'true' || value === 'نعم') return [true, true];
      if (value === 'false' || value === 'لا') return [true, false];
      return [false, value];
    }
    default:
      return [true, value];
  }
};

/** Validates a model/local tool call against the whitelist + schema. */
export const validateToolCall = (
  name: string,
  rawArgs: unknown,
): ValidatedCall => {
  const spec = getToolSpec(name);
  if (!spec || !TOOL_NAMES.has(name)) {
    return { ok: false, error: 'unknown_tool', detail: name };
  }
  const args =
    rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {};
  const props = spec.parameters.properties ?? {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(args)) {
    if (!props[key]) continue; // drop unknown keys silently
    const [ok, v] = coerce(props[key], args[key]);
    if (!ok) return { ok: false, error: 'invalid_args', detail: key };
    out[key] = v;
  }
  for (const req of spec.parameters.required ?? []) {
    if (out[req] === undefined) {
      return { ok: false, error: 'invalid_args', detail: `missing:${req}` };
    }
  }
  return { ok: true, name: spec.name, args: out, spec };
};
