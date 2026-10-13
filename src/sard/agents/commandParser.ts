/**
 * Offline Arabic command parser (pure).
 *
 * Common commands are understood locally — instantly, without any AI request
 * (saves the free quota and works with no key). Anything else goes to Gemini
 * function-calling with the same tool whitelist. Output is always validated
 * by `validateToolCall`.
 */
import { normalizeText, toWesternDigits } from '../ai/arabic';
import { parseOrdinal } from '../ai/volumes';
import type { ToolName } from './tools';

export interface ParsedCommand {
  tool: ToolName;
  args: Record<string, unknown>;
}

const NUM_WORDS: Record<string, number> = {
  واحد: 1, اثنين: 2, اتنين: 2, فصلين: 2, ثلاث: 3, تلات: 3, ثلاثه: 3,
  تلاته: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7,
  سبعه: 7, ثمان: 8, تمن: 8, ثمانيه: 8, تمانيه: 8, تسع: 9, تسعه: 9, عشر: 10,
  عشره: 10, عشرين: 20, ثلاثين: 30, تلاتين: 30, اربعين: 40, خمسين: 50,
  ميه: 100, مايه: 100, مائه: 100,
};

const NUM_ALT = Object.keys(NUM_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|');

const DOWNLOAD = '(?:نزل|نزلي|نزللي|حمل|حملي|حمللي|نزلها|download|dl)';
const SUMMARIZE = '(?:لخص|لخصلي|لخصي|ملخص|تلخيص|summari[sz]e|summary)';
const CHAPTERS = '(?:فصل|فصول|الفصل|الفصول|شابتر|شابترات|chapters?|ch)';
const FROM = '(?:من روايه|لروايه|من|ل|في|بتاع|بتاعه|بتاعت|of|from|for)';

const cleanNovelName = (s: string) =>
  s
    .replace(/^(?:روايه|الروايه|novel)\s+/, '')
    .replace(/\s+(?:لو سمحت|من فضلك|please|بسرعه|دلوقتي|الان)$/, '')
    .replace(/[؟?!.]+$/, '')
    .trim();

const parseCount = (raw?: string): number | undefined => {
  if (!raw) return undefined;
  const d = toWesternDigits(raw).match(/\d+/);
  if (d) return Number(d[0]);
  return NUM_WORDS[raw.trim()];
};

const DOWNLOAD_RE = new RegExp(
  `^${DOWNLOAD}\\s+(?:لي\\s+)?(?:(اخر|احدث|الاخيره|التالي|التاليه|الجايه|الجاي|الجديده|كل)\\s+)?(?:(\\d+|${NUM_ALT})\\s+)?${CHAPTERS}?\\s*(?:(اخر|الاخيره|التاليه|الجايه|الجديده|اللي بعد كده|اللي بعده)\\s+)?${FROM}\\s+(.+)$`,
);

const DOWNLOAD_ALL_RE = new RegExp(
  `^${DOWNLOAD}\\s+(?:لي\\s+)?كل\\s+(?:فصول|الفصول)\\s+(?:${FROM}\\s+)?(.+)$`,
);

const VOLUME_RE = new RegExp(
  `^${SUMMARIZE}\\s+(?:لي\\s+)?(?:المجلد|مجلد|الجزء|volume|vol)\\s+([^\\s]+)\\s+${FROM}\\s+(.+)$`,
);

const RANGE_RE = new RegExp(
  `^${SUMMARIZE}\\s+(?:لي\\s+)?${CHAPTERS}\\s+(?:من\\s+)?(\\d+)\\s+(?:الي|لحد|ل|-|to)\\s+(\\d+)\\s+${FROM}\\s+(.+)$`,
);

const CHAPTER_RE = new RegExp(
  `^${SUMMARIZE}\\s+(?:لي\\s+)?(?:(?:الفصل|فصل|chapter)\\s+(\\d+|الحالي|الاخير)|(?:اخر|احدث)\\s+فصل)\\s+${FROM}\\s+(.+)$`,
);

export const parseLocalCommand = (input: string): ParsedCommand | null => {
  const t = normalizeText(input);
  if (!t) return null;
  let m: RegExpMatchArray | null;

  // نزل كل فصول X (no preposition)
  m = t.match(DOWNLOAD_ALL_RE);
  if (m && cleanNovelName(m[1])) {
    return {
      tool: 'download_chapters',
      args: { novel: cleanNovelName(m[1]), which: 'all' },
    };
  }

  // نزّل آخر 20 فصل من X / حمّل الفصول التالية لـ X
  m = t.match(DOWNLOAD_RE);
  if (m) {
    const which = m[1] ?? m[3];
    let count = parseCount(m[2]);
    const novel = cleanNovelName(m[4]);
    if (!novel) return null;
    const mode =
      which === 'كل'
        ? 'all'
        : which && /(اخر|احدث|الاخيره|الجديده)/.test(which)
        ? 'latest'
        : 'next';
    if (mode === 'all') count = undefined;
    return {
      tool: 'download_chapters',
      args: { novel, which: mode, ...(count ? { count } : {}) },
    };
  }

  // لخّص المجلد التاني من X / لخص المجلد 2 لـ X
  m = t.match(VOLUME_RE);
  if (m) {
    const volume = parseOrdinal(m[1]);
    const novel = cleanNovelName(m[2]);
    if (volume && novel) {
      return { tool: 'summarize_volume', args: { novel, volume } };
    }
  }

  // لخص الفصول من 10 الى 20 من X
  m = t.match(RANGE_RE);
  if (m) {
    return {
      tool: 'summarize_volume',
      args: {
        novel: cleanNovelName(m[3]),
        from_chapter: Number(m[1]),
        to_chapter: Number(m[2]),
      },
    };
  }

  // لخص الفصل 12 من X / لخص الفصل الحالي من X / لخص اخر فصل من X
  m = t.match(CHAPTER_RE);
  if (m) {
    const chapter = m[1] && /^\d+$/.test(m[1]) ? m[1] : 'current';
    return {
      tool: 'summarize_chapter',
      args: { novel: cleanNovelName(m[2]), chapter },
    };
  }

  // ذكرني بما سبق في X
  m = t.match(
    /^(?:ذكرني|فكرني|ما سبق|ماسبق)(?:\s+(?:بما سبق|باللي فات|بالاحداث))?\s+(?:في|من|ل)\s+(.+)$/,
  );
  if (m && m[1]) {
    return { tool: 'recap_novel', args: { novel: cleanNovelName(m[1]) } };
  }

  if (
    /^(?:رتب|رتبلي|نظم|نظملي|ظبط|organi[sz]e)\s+(?:لي\s+)?(?:مكتبتي|المكتبه|library|my library)/.test(
      t,
    )
  ) {
    return { tool: 'organize_library', args: {} };
  }
  if (/(مكرر|مكرره|المكررات|متكرر|duplicates?)/.test(t)) {
    return { tool: 'find_duplicates', args: {} };
  }
  if (
    /(?:حدث|تحديث|شيك|افحص|check)\s*(?:لي\s+)?(?:المكتبه|مكتبتي|الفصول الجديده|updates?)|فصول جديده/.test(
      t,
    )
  ) {
    return { tool: 'check_updates', args: {} };
  }
  if (
    /^(?:رشح|رشحلي|اقترح|اقترحلي|انصحني|recommend)/.test(t) ||
    /(ترشيحات|اقرا ايه)/.test(t)
  ) {
    const c = t.match(/(\d+)/);
    return {
      tool: 'recommend_novels',
      args: c ? { count: Number(c[1]) } : {},
    };
  }
  if (/(استهلاك|الحصه|حصتي|الكوتا|quota|usage)/.test(t)) {
    return { tool: 'usage_today', args: {} };
  }
  m = t.match(/^(?:افتح|افتحلي|open)\s+(?:روايه\s+)?(.+)$/);
  if (m) return { tool: 'open_novel', args: { novel: cleanNovelName(m[1]) } };

  if (/(متوقف|وقفت|سايبها|paused|stalled)/.test(t)) {
    return { tool: 'show_shelf', args: { shelf: 'paused' } };
  }
  if (/(قربت تخلص|قربت اخلص|هتخلص|almost|near)/.test(t)) {
    return { tool: 'show_shelf', args: { shelf: 'near_finish' } };
  }
  if (/(متواصل|ماراثون|binge|جاهزه للقراءه)/.test(t)) {
    return { tool: 'show_shelf', args: { shelf: 'binge_ready' } };
  }
  if (/(مبداتش|لم ابدا|ما بدات|not started)/.test(t)) {
    return { tool: 'show_shelf', args: { shelf: 'not_started' } };
  }
  return null;
};
