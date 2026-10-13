/* «مستودع سَرد» — arabic/arWikisource — https://github.com/FY881/sard-plugins (MIT) */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/plugins/arabic/arWikisource.ts
var arWikisource_exports = {};
__export(arWikisource_exports, {
  CATEGORIES: () => CATEGORIES,
  attribution: () => attribution,
  cleanArticleHtml: () => cleanArticleHtml,
  default: () => arWikisource_default,
  extractAuthor: () => extractAuthor,
  extractSubpageLinks: () => extractSubpageLinks,
  orderSubpages: () => orderSubpages,
  ownTextLength: () => ownTextLength,
  pathToTitle: () => pathToTitle,
  resolveWorks: () => resolveWorks,
  summaryIntro: () => summaryIntro,
  titleToPath: () => titleToPath
});
module.exports = __toCommonJS(arWikisource_exports);
var import_cheerio2 = require("cheerio");
var import_filterInputs = require("@libs/filterInputs");
var import_novelStatus = require("@libs/novelStatus");

// src/shared/strings.ts
var SARD_SOURCE_STRINGS = {
  licenseLabel: "الترخيص",
  // Generic errors
  errNetwork: "تعذّر الاتصال بالمصدر. تحقّق من الإنترنت وحاول مجددًا.",
  errTimeout: "انتهت مهلة الاتصال بالمصدر.",
  errHttp: (status) => `ردّ المصدر بخطأ (${status}).`,
  errBlocked: "المصدر يطلب تحققًا من المتصفح. افتح الصفحة في WebView ثم أعد المحاولة.",
  errNotFound: "لم يُعثر على هذا العنوان في المصدر.",
  errParse: "تعذّرت قراءة ردّ المصدر.",
  errChapterMissing: "تعذّر العثور على هذا الفصل. حدّث قائمة الفصول.",
  // Generic labels
  untitled: "بلا عنوان",
  unknownAuthor: "مؤلف غير معروف",
  intro: "المقدّمة",
  chapterN: (n) => `الفصل ${n}`,
  partN: (n) => `الجزء ${n}`,
  fullText: "النص الكامل",
  all: "الكل",
  sortBy: "الترتيب",
  language: "اللغة",
  genre: "التصنيف",
  topic: "الموضوع",
  category: "القسم",
  authorLabel: "المؤلف",
  translatorLabel: "ترجمة",
  editorLabel: "تحرير",
  subjectsLabel: "الموضوعات",
  wordsLabel: "عدد الكلمات",
  readingTimeLabel: "مدة القراءة",
  publishedLabel: "تاريخ النشر",
  sourceLabel: "المصدر",
  // Project Gutenberg
  gutenbergName: "مشروع غوتنبرغ",
  gutenbergLicense: "ملكية عامة في الولايات المتحدة — Project Gutenberg License. تحقّق من قوانين بلدك قبل إعادة النشر.",
  gutenbergCopyrighted: "تنبيه: هذا العنوان محميّ بحقوق نشر في بعض البلدان بحسب بيانات المشروع.",
  gutenbergSortPopular: "الأكثر تحميلًا",
  gutenbergSortAscending: "الأقدم رقمًا",
  gutenbergSortDescending: "الأحدث إضافةً",
  gutenbergTopic: "الموضوع/الرف",
  gutenbergAuthorYearStart: "المؤلف عاش بعد سنة",
  gutenbergAuthorYearEnd: "المؤلف عاش قبل سنة",
  gutenbergDownloads: "عدد التحميلات",
  gutenbergBookshelves: "الرفوف",
  // Standard Ebooks
  standardEbooksName: "ستاندرد إيبوكس",
  standardEbooksLicense: "نُسخ Standard Ebooks مكرّسة للملك العام (CC0 1.0)، والنصوص الأصلية في الملك العام في الولايات المتحدة وقد تكون محمية في بلدان أخرى؛ تحقّق من قوانين بلدك.",
  seSortPopularity: "الأكثر شعبية",
  seSortNewest: "الأحدث إصدارًا",
  seSortAuthor: "اسم المؤلف (أ → ي)",
  seSortReadingEase: "سهولة القراءة",
  seSortLength: "الطول (الأقصر أولًا)",
  seSortRelevance: "الأكثر صلة",
  seReadingEase: "سهولة القراءة",
  // Arabic Wikisource
  wikisourceName: "ويكي مصدر العربية",
  wikisourceLicense: "نصوص ويكي مصدر متاحة بموجب ترخيص المشاع الإبداعي (CC BY-SA 4.0)، ومعظم الأعمال الأصلية في الملك العام. تحقّق من حالة كل نص في صفحته.",
  wsCatNovels: "روايات",
  wsCatStories: "قصص",
  wsCatShortStories: "قصص قصيرة",
  wsCatPlays: "مسرحيات",
  wsCatLiterature: "أدب",
  wsCatPoetryCollections: "دواوين شعرية",
  wsCatTranslated: "أعمال مترجمة",
  wsCatChildren: "أدب الأطفال",
  wsSortTitle: "أبجديًا",
  wsSortRecent: "الأحدث إضافةً",
  wsCustomCategory: "تصنيف مخصّص (اختياري)",
  wsLicenseCategoryNote: (cats) => `تصنيفات الصفحة: ${cats}`,
  // OPDS
  opdsName: "كتالوج OPDS",
  opdsCatalogUrl: "رابط كتالوج OPDS (Calibre-web / Kavita / Komga …)",
  opdsUsername: "اسم المستخدم (اختياري)",
  opdsPassword: "كلمة المرور (اختياري)",
  opdsShowNavigation: "عرض الأقسام كعناصر قابلة للفتح",
  opdsNotConfigured: "لم يُضبط رابط كتالوج OPDS بعد. افتح إعدادات المصدر وأدخل رابط الكتالوج الخاص بك.",
  opdsAuthRequired: "الكتالوج يطلب تسجيل الدخول. أدخل اسم المستخدم وكلمة المرور في إعدادات المصدر.",
  opdsFeed: "القسم",
  opdsRoot: "الصفحة الرئيسية للكتالوج",
  opdsCustomFeed: "رابط قسم مخصّص (اختياري)",
  opdsSearchUnsupported: "هذا الكتالوج لا يدعم البحث.",
  opdsFolder: "قسم",
  opdsFolderSummary: "هذا قسم في الكتالوج. افتح الفصول لاستعراض محتواه.",
  opdsNoEpub: "لا يوفّر الكتالوج نسخة EPUB لهذا الكتاب. يمكنك فتح رابط التحميل مباشرة:",
  opdsDownloadLink: "رابط التحميل",
  opdsFormats: "الصيغ المتاحة",
  opdsEpubFailed: "تعذّر تنزيل ملف EPUB من الكتالوج أو فكّه.",
  opdsLicenseNote: "محتوى هذا المصدر يأتي من خادمك أو كتالوج اخترته بنفسك؛ أنت مسؤول عن حقوق ما تضيفه.",
  opdsEntriesInFolder: (n) => `يحتوي على ${n} عنصرًا`,
  epubTooLarge: "ملف EPUB أكبر من الحد المسموح (60 م.ب).",
  epubInvalid: "ملف EPUB غير صالح أو تالف."
};

// src/shared/http.ts
var import_fetch = require("@libs/fetch");
var SourceError = class extends Error {
  constructor(message, status) {
    super(message);
    this.name = "SourceError";
    this.status = status;
  }
};
var DEFAULT_TIMEOUT = 3e4;
var sleep = (ms) => new Promise((res) => setTimeout(res, ms));
var looksLikeChallenge = (status, text) => (status === 403 || status === 503) && /just a moment|cf-chl|challenge-platform|captcha/i.test(text);
var request = async (url, options = {}) => {
  var _a, _b, _c, _d, _e, _f;
  const retries = (_a = options.retries) != null ? _a : 2;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(
      () => controller.abort(),
      (_b = options.timeoutMs) != null ? _b : DEFAULT_TIMEOUT
    ) : null;
    try {
      const res = await (0, import_fetch.fetchApi)(url, {
        method: (_c = options.method) != null ? _c : "GET",
        headers: { ...(_d = options.headers) != null ? _d : {} },
        ...options.body ? { body: options.body } : {},
        ...controller ? { signal: controller.signal } : {}
      });
      if (res.ok) {
        return res;
      }
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        const retryAfter = Number((_f = (_e = res.headers) == null ? void 0 : _e.get) == null ? void 0 : _f.call(_e, "retry-after"));
        await sleep(
          retryAfter > 0 ? Math.min(retryAfter * 1e3, 8e3) : (res.status === 429 ? 2e3 : 800) * (attempt + 1)
        );
        continue;
      }
      let text = "";
      try {
        text = await res.text();
      } catch {
      }
      if (looksLikeChallenge(res.status, text)) {
        throw new SourceError(SARD_SOURCE_STRINGS.errBlocked, res.status);
      }
      if (res.status === 404) {
        throw new SourceError(SARD_SOURCE_STRINGS.errNotFound, 404);
      }
      throw new SourceError(SARD_SOURCE_STRINGS.errHttp(res.status), res.status);
    } catch (e) {
      if (e instanceof SourceError) {
        throw e;
      }
      lastError = e;
      if (attempt < retries) {
        await sleep(800 * (attempt + 1));
        continue;
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  const err = lastError;
  if ((err == null ? void 0 : err.name) === "AbortError") {
    throw new SourceError(SARD_SOURCE_STRINGS.errTimeout);
  }
  throw new SourceError(SARD_SOURCE_STRINGS.errNetwork);
};
var getText = async (url, options) => {
  const res = await request(url, options);
  const text = await res.text();
  if (/<title>\s*Just a moment/i.test(text.slice(0, 2e3))) {
    throw new SourceError(SARD_SOURCE_STRINGS.errBlocked, 403);
  }
  return text;
};
var getJson = async (url, options) => {
  var _a;
  const text = await getText(url, {
    ...options,
    headers: { Accept: "application/json", ...(_a = options == null ? void 0 : options.headers) != null ? _a : {} }
  });
  try {
    return JSON.parse(text);
  } catch {
    throw new SourceError(SARD_SOURCE_STRINGS.errParse);
  }
};
var buildQuery = (params) => Object.entries(params).filter(([, v]) => v !== void 0 && v !== null && v !== "").map(
  ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
).join("&");
var LruCache = class {
  constructor(max) {
    this.max = max;
    this.map = /* @__PURE__ */ new Map();
  }
  get(key) {
    const v = this.map.get(key);
    if (v !== void 0) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key, value) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
  }
  delete(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
};

// src/shared/html.ts
var import_cheerio = require("cheerio");
var DEFAULT_MAX_CHARS = 15e4;
var DEFAULT_MIN_TEXT = 250;
var HEADING_LEVELS = [1, 2, 3, 4];
var TOC_TITLE = /^(contents|table of contents|list of illustrations|illustrations|index|المحتويات|الفهرس|فهرس)\.?$/i;
var PART_TITLE = /^(book|part|volume|vol\.|canto|act|الجزء|الكتاب|المجلد|القسم|الباب)\b/i;
var isTocSegment = (seg) => {
  const links = (seg.html.match(/<a\s[^>]*href=["']#/gi) || []).length;
  if (TOC_TITLE.test(seg.title)) {
    const anyLinks = (seg.html.match(/<a\s[^>]*href=/gi) || []).length;
    if (links >= 5 || anyLinks >= 3 && stripTags(seg.html).length < 1500) {
      return true;
    }
  }
  if (links < 8) return false;
  return stripTags(seg.html).length / links < 70;
};
var collapseWhitespace = (s) => s.replace(/\s+/g, " ").trim();
var stripTags = (html) => collapseWhitespace(
  html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#8203;/g, "")
);
var absolutize = (url, base) => {
  if (!url || !base) return url;
  if (/^(https?:|data:|file:|mailto:|#)/i.test(url)) return url;
  if (url.startsWith("//")) return "https:" + url;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
};
var absolutizeHtml = (html, baseUrl) => {
  if (!baseUrl) return html;
  return html.replace(
    /(\s(?:src|href|poster)\s*=\s*)(["'])(.*?)\2/gi,
    (_m, pre, q, url) => url.startsWith("#") ? `${pre}${q}${url}${q}` : `${pre}${q}${absolutize(url, baseUrl)}${q}`
  );
};
var headingRegex = (level) => new RegExp(`<h${level}(?=[\\s>])`, "gi");
var headingTitle = (segmentHtml, level) => {
  const m = segmentHtml.match(
    new RegExp(`^<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "i")
  );
  if (!m) return "";
  const $ = (0, import_cheerio.load)(m[1].replace(/<br\s*\/?>/gi, " "), null, false);
  $(".caption, .pagenum, .pageno, sup, .noprint").remove();
  let title = collapseWhitespace($.root().text());
  if (!title) {
    const alt = $("img[alt]").map((_, el) => $(el).attr("alt")).get().join(" ");
    title = collapseWhitespace(alt);
  }
  return title.length > 140 ? title.slice(0, 137) + "…" : title;
};
var textLength = (html) => stripTags(html).length;
var splitByLevel = (html, level) => {
  const re = headingRegex(level);
  const positions = [];
  let m;
  while (m = re.exec(html)) positions.push(m.index);
  const pre = positions.length ? html.slice(0, positions[0]) : html;
  const segments = positions.map((start, i) => {
    const end = i + 1 < positions.length ? positions[i + 1] : html.length;
    const segHtml = html.slice(start, end);
    return { title: headingTitle(segHtml, level), html: segHtml };
  });
  return { pre, segments };
};
var median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
var chooseHeadingLevel = (html) => {
  let best;
  for (const level of HEADING_LEVELS) {
    const count = (html.match(headingRegex(level)) || []).length;
    if (count < 2) continue;
    const { segments } = splitByLevel(html, level);
    const med = median(segments.map((s) => textLength(s.html)));
    if (med < 1200 && count > 3) continue;
    if (!best || count > best.count) best = { level, count };
  }
  if (best) return best.level;
  let fallback;
  for (const level of HEADING_LEVELS) {
    const count = (html.match(headingRegex(level)) || []).length;
    if (count >= 2 && (!fallback || count > fallback.count)) {
      fallback = { level, count };
    }
  }
  return fallback == null ? void 0 : fallback.level;
};
var splitBySize = (html, maxChars) => {
  if (html.length <= maxChars) return [html];
  const parts = [];
  let rest = html;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    let cut = Math.max(
      window.lastIndexOf("</p>"),
      window.lastIndexOf("</div>"),
      window.lastIndexOf("<br")
    );
    if (cut < maxChars * 0.4) cut = maxChars;
    else cut = window.indexOf(">", cut) + 1 || maxChars;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.trim()) parts.push(rest);
  return parts;
};
var normalizeFragment = (html) => {
  const $ = (0, import_cheerio.load)(html, null, false);
  return $.html();
};
var cleanBody = (fullHtml, removeSelectors = []) => {
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : fullHtml;
  const $ = (0, import_cheerio.load)(body, null, false);
  $(["script", "style", "link", "meta", ...removeSelectors].join(",")).remove();
  return $.html();
};
var splitBookHtml = (fullHtml, options = {}) => {
  var _a, _b;
  const maxChars = (_a = options.maxChapterChars) != null ? _a : DEFAULT_MAX_CHARS;
  const minText = (_b = options.minChapterTextChars) != null ? _b : DEFAULT_MIN_TEXT;
  const html = absolutizeHtml(
    cleanBody(fullHtml, options.removeSelectors),
    options.baseUrl
  );
  const level = chooseHeadingLevel(html);
  let raw = [];
  if (level === void 0) {
    raw = [{ title: SARD_SOURCE_STRINGS.fullText, html }];
  } else {
    const { pre, segments } = splitByLevel(html, level);
    if (textLength(pre) >= minText) {
      raw.push({ title: SARD_SOURCE_STRINGS.intro, html: pre });
    }
    raw.push(...segments);
  }
  raw = raw.filter((seg) => !isTocSegment(seg));
  const merged = [];
  let carry;
  for (const seg of raw) {
    const current = carry ? {
      title: PART_TITLE.test(carry.title) ? [carry.title, seg.title].filter(Boolean).join(" — ") : seg.title || carry.title,
      html: carry.html + seg.html
    } : seg;
    carry = void 0;
    if (textLength(current.html) < minText) {
      carry = current;
      continue;
    }
    merged.push(current);
  }
  if (carry) {
    if (merged.length) {
      const last = merged[merged.length - 1];
      last.html += carry.html;
    } else {
      merged.push(carry);
    }
  }
  const result = [];
  merged.forEach((seg) => {
    const parts = splitBySize(seg.html, maxChars);
    if (parts.length === 1) {
      result.push(seg);
    } else {
      parts.forEach(
        (p, i) => result.push({
          title: seg.title === SARD_SOURCE_STRINGS.fullText ? SARD_SOURCE_STRINGS.partN(i + 1) : `${seg.title || SARD_SOURCE_STRINGS.untitled} (${SARD_SOURCE_STRINGS.partN(i + 1)})`,
          html: p
        })
      );
    }
  });
  return result.map((seg, i) => ({
    title: seg.title || SARD_SOURCE_STRINGS.chapterN(i + 1),
    html: normalizeFragment(seg.html)
  }));
};

// src/shared/text.ts
var escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// src/shared/types.ts
var LANG_ARABIC = "‎العربية";

// src/plugins/arabic/arWikisource.ts
var SITE = "https://ar.wikisource.org";
var API = `${SITE}/w/api.php`;
var PAGE_SIZE = 40;
var WM_UA = "SardReader/1.0 (Sard plugin repository; https://github.com/FY881/sard-plugins)";
var WM_HEADERS = {
  "User-Agent": WM_UA,
  "Api-User-Agent": WM_UA
};
var CATEGORIES = [
  { label: SARD_SOURCE_STRINGS.wsCatNovels, value: "روايات" },
  { label: SARD_SOURCE_STRINGS.wsCatStories, value: "قصص" },
  { label: SARD_SOURCE_STRINGS.wsCatShortStories, value: "قصص قصيرة" },
  { label: "قصص شعبية", value: "قصص شعبية" },
  { label: SARD_SOURCE_STRINGS.wsCatPlays, value: "مسرحيات" },
  { label: SARD_SOURCE_STRINGS.wsCatTranslated, value: "كتب مترجمة" },
  { label: SARD_SOURCE_STRINGS.wsCatLiterature, value: "أدب" },
  { label: SARD_SOURCE_STRINGS.wsCatPoetryCollections, value: "دواوين شعر" },
  { label: "مقامات", value: "مقامات" },
  { label: "رحلات", value: "رحلات" },
  { label: "أدب فارسي", value: "أدب فارسي" }
];
var filters = {
  category: {
    label: SARD_SOURCE_STRINGS.category,
    type: import_filterInputs.FilterTypes.Picker,
    value: "روايات",
    options: CATEGORIES
  },
  sort: {
    label: SARD_SOURCE_STRINGS.sortBy,
    type: import_filterInputs.FilterTypes.Picker,
    value: "sortkey",
    options: [
      { label: SARD_SOURCE_STRINGS.wsSortTitle, value: "sortkey" },
      { label: SARD_SOURCE_STRINGS.wsSortRecent, value: "timestamp" }
    ]
  },
  customCategory: {
    label: SARD_SOURCE_STRINGS.wsCustomCategory,
    type: import_filterInputs.FilterTypes.TextInput,
    value: ""
  }
};
var apiQueue = Promise.resolve();
var API_GAP_MS = 120;
var api = (params) => {
  const run = () => getJson(
    `${API}?${buildQuery({ format: "json", formatversion: 2, ...params })}`,
    { headers: WM_HEADERS, retries: 3 }
  );
  const result = apiQueue.then(run, run);
  apiQueue = result.catch(() => void 0).then(() => new Promise((res) => setTimeout(res, API_GAP_MS)));
  return result;
};
var titleToPath = (title) => title.replace(/ /g, "_");
var pathToTitle = (path) => {
  const raw = path.replace(/^\/?wiki\//, "");
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
  }
  return decoded.replace(/_/g, " ");
};
var continuation = /* @__PURE__ */ new Map();
var fetchCategoryPage = async (category, sort, page) => {
  var _a;
  const key = (p) => `${category}|${sort}|${p}`;
  let start = page;
  while (start > 1 && !continuation.has(key(start))) start--;
  let members = [];
  for (let p = start; p <= page; p++) {
    const cont = p === 1 ? {} : continuation.get(key(p));
    if (cont === null) return [];
    const data = await api({
      action: "query",
      list: "categorymembers",
      cmtitle: `تصنيف:${category}`,
      cmtype: "page|subcat",
      cmnamespace: "0|14",
      cmlimit: PAGE_SIZE,
      cmsort: sort === "timestamp" ? "timestamp" : "sortkey",
      cmdir: sort === "timestamp" ? "desc" : "asc",
      ...cont || {}
    });
    members = ((_a = data == null ? void 0 : data.query) == null ? void 0 : _a.categorymembers) || [];
    continuation.set(key(p + 1), (data == null ? void 0 : data.continue) ? data.continue : null);
  }
  return members;
};
var resolveWorks = async (members) => {
  var _a, _b, _c;
  const candidates = [];
  members.forEach((m) => {
    const t = m.ns === 14 ? m.title.replace(/^تصنيف:/, "") : m.ns === 0 ? m.title : "";
    if (t && !t.includes("/") && !candidates.includes(t)) candidates.push(t);
  });
  if (!candidates.length) return [];
  const data = await api({
    action: "query",
    titles: candidates.slice(0, 50).join("|"),
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: 400,
    redirects: 1
  });
  const pages = ((_a = data == null ? void 0 : data.query) == null ? void 0 : _a.pages) || [];
  const redirects = {};
  (((_b = data == null ? void 0 : data.query) == null ? void 0 : _b.normalized) || []).forEach(
    (r) => redirects[r.from] = r.to
  );
  (((_c = data == null ? void 0 : data.query) == null ? void 0 : _c.redirects) || []).forEach(
    (r) => redirects[r.from] = r.to
  );
  const byTitle = new Map(
    pages.filter((p) => !p.missing && p.ns === 0).map((p) => [p.title, p])
  );
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  candidates.forEach((c) => {
    var _a2;
    let title = redirects[c] || c;
    title = redirects[title] || title;
    const p = byTitle.get(title);
    if (!p || seen.has(title)) return;
    seen.add(title);
    out.push({
      id: void 0,
      name: title,
      path: titleToPath(title),
      cover: (_a2 = p.thumbnail) == null ? void 0 : _a2.source
    });
  });
  return out;
};
var REMOVE = [
  ".ws-noexport",
  ".noprint",
  "#headertemplate",
  ".wst-header",
  ".mw-editsection",
  "style",
  "link",
  ".navbox",
  ".mw-empty-elt",
  "#toc",
  ".toc",
  ".catlinks",
  ".ws-pagenum",
  ".pagenum"
];
var extractAuthor = (html) => {
  const $ = (0, import_cheerio2.load)(html, null, false);
  const a = $('a[title^="مؤلف:"]').first();
  if (!a.length) return void 0;
  return collapseWhitespace(a.text()) || (a.attr("title") || "").replace("مؤلف:", "") || void 0;
};
var extractSubpageLinks = (html, title) => {
  const $ = (0, import_cheerio2.load)(html, null, false);
  $(".ws-noexport, #headertemplate, .wst-header").remove();
  const prefix = `${title}/`;
  const out = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    const m = href.match(/^\/wiki\/([^#?]+)/);
    if (!m) return;
    let target;
    try {
      target = decodeURIComponent(m[1]).replace(/_/g, " ");
    } catch {
      return;
    }
    if (target.startsWith(prefix) && !out.includes(target)) out.push(target);
  });
  return out;
};
var cleanArticleHtml = (html) => {
  const $ = (0, import_cheerio2.load)(html, null, false);
  $(REMOVE.join(",")).remove();
  $("a.new").each((_, a) => {
    $(a).replaceWith($(a).text());
  });
  return absolutizeHtml($.html(), `${SITE}/wiki/`).replace(
    /(src|href|srcset)="\/\//g,
    '$1="https://'
  );
};
var ownTextLength = (html) => {
  const $ = (0, import_cheerio2.load)(cleanArticleHtml(html), null, false);
  $("a").remove();
  return collapseWhitespace($.root().text()).length;
};
var OWN_TEXT_MIN = 3e3;
var summaryIntro = (html, max = 500) => {
  const $ = (0, import_cheerio2.load)(cleanArticleHtml(html), null, false);
  $("ul, ol, table, .toc, h1, h2, h3, h4").remove();
  const paragraphs = $("p").map((_, p) => collapseWhitespace($(p).text())).get().filter((t) => t.length > 40);
  const text = paragraphs.join(" ");
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
};
var attribution = (title) => `<hr/><p style="font-size:0.8em;opacity:0.75" dir="rtl">${escapeHtml(
  SARD_SOURCE_STRINGS.sourceLabel
)}: <a href="${SITE}/wiki/${encodeURIComponent(
  titleToPath(title)
)}">ويكي مصدر — ${escapeHtml(title)}</a> · ${escapeHtml(
  SARD_SOURCE_STRINGS.licenseLabel
)}: <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.ar">CC BY-SA 4.0</a></p>`;
var subpageLabel = (title, parent) => title.startsWith(parent + "/") ? title.slice(parent.length + 1).replace(/\//g, " — ") : title;
var naturalCompare = (a, b) => a.localeCompare(b, "ar", { numeric: true });
var orderSubpages = (linked, all, childLinks = {}) => {
  const allSet = new Set(all);
  const ordered = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (t) => {
    if (!seen.has(t)) {
      seen.add(t);
      ordered.push(t);
    }
  };
  linked.filter((t) => allSet.has(t) || !all.length).forEach((t) => {
    push(t);
    (childLinks[t] || []).filter((c) => allSet.has(c) || !all.length).forEach(push);
    all.filter((x) => x.startsWith(t + "/")).sort(naturalCompare).forEach(push);
  });
  all.filter((t) => !seen.has(t)).sort(naturalCompare).forEach(push);
  return ordered;
};
var pageCache = new LruCache(8);
var splitCache = new LruCache(3);
var parsePage = async (title) => {
  const cached = pageCache.get(title);
  if (cached) return cached;
  const data = await api({
    action: "parse",
    page: title,
    prop: "text|categories",
    redirects: 1,
    disableeditsection: 1
  });
  if ((data == null ? void 0 : data.error) || !(data == null ? void 0 : data.parse)) throw new SourceError(SARD_SOURCE_STRINGS.errNotFound, 404);
  const parsed = {
    title: data.parse.title,
    html: data.parse.text,
    categories: (data.parse.categories || []).filter((c) => !c.hidden).map((c) => String(c.category).replace(/_/g, " "))
  };
  pageCache.set(title, parsed);
  if (parsed.title !== title) pageCache.set(parsed.title, parsed);
  return parsed;
};
var allSubpages = async (title) => {
  var _a, _b, _c, _d, _e, _f;
  const out = [];
  let cover;
  let cont;
  for (let i = 0; i < 6; i++) {
    const data = await api({
      action: "query",
      list: "allpages",
      apprefix: `${title}/`,
      apnamespace: 0,
      aplimit: 500,
      apfilterredir: "nonredirects",
      ...i === 0 ? {
        titles: title,
        prop: "pageimages",
        piprop: "thumbnail",
        pithumbsize: 500
      } : {},
      ...cont || {}
    });
    if (i === 0) cover = (_d = (_c = (_b = (_a = data == null ? void 0 : data.query) == null ? void 0 : _a.pages) == null ? void 0 : _b[0]) == null ? void 0 : _c.thumbnail) == null ? void 0 : _d.source;
    (((_e = data == null ? void 0 : data.query) == null ? void 0 : _e.allpages) || []).forEach((p) => out.push(p.title));
    if (!((_f = data == null ? void 0 : data.continue) == null ? void 0 : _f.apcontinue)) break;
    cont = {
      apcontinue: data.continue.apcontinue,
      continue: data.continue.continue
    };
  }
  return { titles: out, cover };
};
var splitMainPage = (page) => {
  let parts = splitCache.get(page.title);
  if (!parts) {
    parts = splitBookHtml(cleanArticleHtml(page.html));
    splitCache.set(page.title, parts);
  }
  return parts;
};
var wrapChapter = (html, title) => `<div dir="rtl" lang="ar">${html}</div>${attribution(title)}`;
var arWikisourcePlugin = {
  id: "sard.ar-wikisource",
  name: SARD_SOURCE_STRINGS.wikisourceName,
  site: SITE,
  lang: LANG_ARABIC,
  version: "1.0.0",
  imageRequestInit: { headers: { ...WM_HEADERS } },
  filters,
  async popularNovels(pageNo, options) {
    var _a, _b, _c;
    const values = options == null ? void 0 : options.filters;
    const custom = (((_a = values == null ? void 0 : values.customCategory) == null ? void 0 : _a.value) || "").trim().replace(/^تصنيف:/, "");
    const category = custom || ((_b = values == null ? void 0 : values.category) == null ? void 0 : _b.value) || "روايات";
    const sort = (options == null ? void 0 : options.showLatestNovels) ? "timestamp" : ((_c = values == null ? void 0 : values.sort) == null ? void 0 : _c.value) || "sortkey";
    const members = await fetchCategoryPage(category, sort, pageNo);
    return resolveWorks(members);
  },
  async searchNovels(searchTerm, pageNo) {
    var _a;
    const data = await api({
      action: "query",
      list: "search",
      srsearch: searchTerm,
      srnamespace: 0,
      srlimit: PAGE_SIZE,
      sroffset: (pageNo - 1) * PAGE_SIZE,
      srprop: ""
    });
    const results = ((_a = data == null ? void 0 : data.query) == null ? void 0 : _a.search) || [];
    const members = results.map((r) => ({
      ns: 0,
      title: String(r.title).split("/")[0]
    }));
    return resolveWorks(members);
  },
  async parseNovel(novelPath) {
    const title = pathToTitle(novelPath);
    const page = await parsePage(title);
    const realTitle = page.title;
    const author = extractAuthor(page.html);
    const linked = extractSubpageLinks(page.html, realTitle);
    const { titles: all, cover } = await allSubpages(realTitle);
    const parents = linked.filter((t) => all.some((x) => x.startsWith(t + "/"))).slice(0, 15);
    const childLinks = {};
    for (const parent of parents) {
      try {
        const parsed = await parsePage(parent);
        childLinks[parent] = extractSubpageLinks(parsed.html, parent);
      } catch {
      }
    }
    const ordered = orderSubpages(linked, all, childLinks);
    const chapters = [];
    if (!ordered.length || ownTextLength(page.html) >= OWN_TEXT_MIN) {
      const parts = splitMainPage(page);
      parts.forEach(
        (p, i) => chapters.push({
          name: parts.length === 1 ? realTitle : p.title,
          path: `${titleToPath(realTitle)}#sard-part-${i + 1}`
        })
      );
    }
    ordered.forEach(
      (t) => chapters.push({ name: subpageLabel(t, realTitle), path: titleToPath(t) })
    );
    chapters.forEach((c, i) => c.chapterNumber = i + 1);
    const genres = page.categories.filter(
      (c) => !/^(صفحات|نصوص|مؤلفات|أعمال|Pages|CS1)/.test(c)
    );
    const summary = [
      summaryIntro(page.html),
      `${SARD_SOURCE_STRINGS.licenseLabel}: ${SARD_SOURCE_STRINGS.wikisourceLicense}`,
      page.categories.length ? SARD_SOURCE_STRINGS.wsLicenseCategoryNote(page.categories.join("، ")) : "",
      `${SARD_SOURCE_STRINGS.sourceLabel}: ${SITE}/wiki/${titleToPath(realTitle)}`
    ].filter(Boolean).join("\n\n");
    return {
      id: void 0,
      name: realTitle,
      path: titleToPath(realTitle),
      cover,
      author,
      genres: genres.join(", "),
      status: import_novelStatus.NovelStatus.Completed,
      summary,
      chapters
    };
  },
  async parseChapter(chapterPath) {
    const partMatch = chapterPath.match(/^(.*)#sard-part-(\d+)$/);
    if (partMatch) {
      const page2 = await parsePage(pathToTitle(partMatch[1]));
      const part = splitMainPage(page2)[Number(partMatch[2]) - 1];
      if (!part) throw new SourceError(SARD_SOURCE_STRINGS.errChapterMissing, 404);
      return wrapChapter(part.html, page2.title);
    }
    const page = await parsePage(pathToTitle(chapterPath));
    return wrapChapter(cleanArticleHtml(page.html), page.title);
  },
  resolveUrl(path) {
    const clean = path.replace(/#sard-part-\d+$/, "");
    return `${SITE}/wiki/${encodeURI(clean)}`;
  }
};
var arWikisource_default = arWikisourcePlugin;
exports.default = module.exports.default;
