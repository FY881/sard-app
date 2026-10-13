/**
 * On-device text analysis («الذكاء الاصطناعي المحلي»): extractive summary,
 * keywords, recurring names, difficulty and cloze questions. No network, no
 * model — classic IR/NLP that works for Arabic and English.
 */
const TASHKEEL = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

export const AR_STOP = new Set(
  'في من على إلى الى عن مع هذا هذه ذلك تلك التي الذي الذين اللذين ما ماذا لماذا كيف أين متى ثم أو أم بل لا لم لن قد كان كانت يكون تكون كانوا هو هي هم هن أنا نحن أنت أنتم انت انا إن ان أن إنه انه أنه كل بعض غير بين عند حتى إذا اذا لكن ولكن وقد فقد لقد وكان وهو وهي وما ولا وفي ومن وعلى منه منها عليه عليها إليه اليه له لها لهم به بها فيه فيها ذات قال قالت يقول تقول هناك هنا الآن اليوم أي أيضا أيضًا جدا جدًا مثل حين حيث كما لما عندما بعد قبل فوق تحت أمام خلف حول دون سوى ليس ليست يا أمّا اما إما ثمّ وإن وأن فإن فلا'.split(/\s+/),
);
export const EN_STOP = new Set(
  'the a an and or but if then of to in on at for with from by as is are was were be been being it its this that these those he she they we you i me him her them my his their our your not no so do does did have has had will would can could should there here what which who whom when where why how all any some more most such only own same than too very just also into out up down over again once said says'.split(/\s+/),
);

export const normalizeToken = (w: string) =>
  w.replace(TASHKEEL, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase();

/** Light Arabic prefix stripping (و/ف/ب/ل/ال) for counting, not for display. */
export const stemAr = (w: string) => {
  let s = w;
  if (s.length > 4 && /^(وال|فال|بال|كال|لل)/.test(s)) s = s.slice(3);
  else if (s.length > 3 && s.startsWith('ال')) s = s.slice(2);
  else if (s.length > 3 && /^[وفب]/.test(s) && !AR_STOP.has(s)) s = s.slice(1);
  return s;
};

export const tokenize = (text: string): string[] =>
  (text.match(/[\p{L}\p{N}]+/gu) || []).map(normalizeToken).filter(Boolean);

export const isStop = (t: string) => AR_STOP.has(t) || EN_STOP.has(t) || t.length < 2 || /^\d+$/.test(t);

export const splitSentences = (text: string): string[] =>
  (text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?؟…])\s+|\n+/u)
    .map(s => s.trim())
    .filter(s => s.length > 12);

const termFreq = (tokens: string[]) => {
  const m = new Map<string, number>();
  for (const t of tokens) {
    if (isStop(t)) continue;
    const k = stemAr(t);
    if (k.length < 2) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};

/** Top-N sentences by summed normalised term frequency, kept in story order. */
export const summarize = (text: string, maxSentences = 5): string[] => {
  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) return sentences;
  const tf = termFreq(tokenize(text));
  const maxF = Math.max(1, ...tf.values());
  const scored = sentences.map((s, i) => {
    const toks = tokenize(s).filter(t => !isStop(t));
    const sum = toks.reduce((a, t) => a + (tf.get(stemAr(t)) ?? 0) / maxF, 0);
    const len = Math.max(6, toks.length);
    const position = i < 3 ? 0.15 : 0;
    return { i, s, score: sum / Math.sqrt(len) + position };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.i - b.i)
    .map(x => x.s);
};

export const keywords = (text: string, n = 12): { word: string; count: number }[] => {
  const display = new Map<string, Map<string, number>>();
  const counts = new Map<string, number>();
  for (const raw of text.match(/[\p{L}]+/gu) || []) {
    const t = normalizeToken(raw);
    if (isStop(t) || t.length < 3) continue;
    const k = stemAr(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    const forms = display.get(k) ?? new Map<string, number>();
    forms.set(raw.replace(TASHKEEL, ''), (forms.get(raw.replace(TASHKEEL, '')) ?? 0) + 1);
    display.set(k, forms);
  }
  return [...counts.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([k, count]) => {
      const forms = [...(display.get(k) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]);
      return { word: forms[0]?.[0] ?? k, count };
    });
};

const SPEECH_VERBS_AR = /(?:قال|قالت|سأل|سألت|أجاب|أجابت|صرخ|صرخت|همس|همست|ابتسم|ابتسمت|نظر|نظرت|رد|ردت)\s+([\u0621-\u064A]{3,})/g;
const NAME_TITLES_AR = /(?:السيد|السيدة|الأمير|الأميرة|الملك|الملكة|الشيخ|القائد|الدكتور|المعلم|العم|الآنسة)\s+([\u0621-\u064A]{3,})/g;
const EN_NAME = /(?<![.!?]\s)(?<!^)\b([A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})?)\b/g;

/** Recurring character-like names with mention counts. */
export const characters = (text: string, n = 15): { name: string; count: number }[] => {
  const clean = (text || '').replace(TASHKEEL, '');
  const cand = new Map<string, number>();
  const bump = (s: string, w = 1) => {
    const k = s.trim();
    if (!k || AR_STOP.has(normalizeToken(k)) || EN_STOP.has(k.toLowerCase())) return;
    cand.set(k, (cand.get(k) ?? 0) + w);
  };
  for (const m of clean.matchAll(SPEECH_VERBS_AR)) bump(m[1], 2);
  for (const m of clean.matchAll(NAME_TITLES_AR)) bump(m[1], 2);
  for (const m of clean.matchAll(EN_NAME)) bump(m[1]);
  // Confirm by total occurrences in the text.
  const out: { name: string; count: number }[] = [];
  for (const [name, w] of cand) {
    const occurrences = clean.split(name).length - 1;
    const score = occurrences + w;
    if (occurrences >= 2) out.push({ name, count: Math.max(occurrences, Math.round(score / 2)) });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, n);
};

export interface Difficulty {
  words: number;
  sentences: number;
  avgSentenceWords: number;
  avgWordLength: number;
  /** distinct / total (type-token ratio on the first 1000 words) */
  lexicalVariety: number;
  /** 1 easy … 5 hard */
  level: 1 | 2 | 3 | 4 | 5;
}

export const difficulty = (text: string): Difficulty => {
  const toks = tokenize(text);
  const sentences = Math.max(1, splitSentences(text).length);
  const avgSentenceWords = toks.length / sentences;
  const avgWordLength = toks.length ? toks.reduce((a, t) => a + t.length, 0) / toks.length : 0;
  const sample = toks.slice(0, 1000);
  const lexicalVariety = sample.length ? new Set(sample.map(stemAr)).size / sample.length : 0;
  const score = (avgSentenceWords / 12) * 1.4 + (avgWordLength / 5) * 1.2 + lexicalVariety * 2.2;
  const level = (score < 2.8 ? 1 : score < 3.4 ? 2 : score < 4 ? 3 : score < 4.7 ? 4 : 5) as Difficulty['level'];
  return {
    words: toks.length,
    sentences,
    avgSentenceWords: Math.round(avgSentenceWords * 10) / 10,
    avgWordLength: Math.round(avgWordLength * 10) / 10,
    lexicalVariety: Math.round(lexicalVariety * 100) / 100,
    level,
  };
};

export interface ClozeQuestion {
  sentence: string;
  /** sentence with the answer replaced by ____ */
  prompt: string;
  answer: string;
  options: string[];
}

/** Fill-in-the-blank questions from summary sentences, distractors from keywords. */
export const clozeQuiz = (text: string, count = 5, random: () => number = Math.random): ClozeQuestion[] => {
  const kws = keywords(text, 30).map(k => k.word);
  if (kws.length < 4) return [];
  const sentences = summarize(text, Math.max(count * 2, 8));
  const out: ClozeQuestion[] = [];
  for (const s of sentences) {
    const answer = kws.find(k => s.includes(k));
    if (!answer) continue;
    const pool = kws.filter(k => k !== answer);
    const distractors: string[] = [];
    while (distractors.length < 3 && pool.length) {
      distractors.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    }
    const options = [...distractors, answer].sort(() => random() - 0.5);
    out.push({ sentence: s, prompt: s.replace(answer, '_____'), answer, options });
    if (out.length >= count) break;
  }
  return out;
};

export interface SearchHit {
  chapterId: number;
  chapterName: string;
  index: number;
  snippet: string;
}

/** Diacritic-insensitive search with ±60-char snippets. */
export const searchText = (
  chapters: { id: number; name: string; text: string }[],
  query: string,
  maxHits = 200,
): SearchHit[] => {
  const q = normalizeToken(query.trim());
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  for (const c of chapters) {
    const norm = normalizeToken(c.text);
    let from = 0;
    while (hits.length < maxHits) {
      const i = norm.indexOf(q, from);
      if (i < 0) break;
      // normalisation removes chars; map back approximately by ratio
      const ratio = c.text.length / Math.max(1, norm.length);
      const at = Math.floor(i * ratio);
      const s = Math.max(0, at - 60);
      hits.push({
        chapterId: c.id,
        chapterName: c.name,
        index: i,
        snippet: (s > 0 ? '…' : '') + c.text.slice(s, at + q.length + 60).replace(/\s+/g, ' ').trim() + '…',
      });
      from = i + q.length;
    }
    if (hits.length >= maxHits) break;
  }
  return hits;
};
