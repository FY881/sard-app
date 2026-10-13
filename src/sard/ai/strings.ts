/**
 * Arabic UI strings for Sard AI + «وكلاء سَرد».
 * Kept here (not in i18n locale files) per track ownership; the main agent may
 * migrate them into the locale files later without changing call sites.
 */
import type { AIError, AIFeature } from '@services/ai';

export const AI_STRINGS = {
  common: {
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    save: 'حفظ',
    close: 'إغلاق',
    retry: 'إعادة المحاولة',
    loading: 'جارٍ التحميل…',
    working: 'جارٍ العمل…',
    done: 'تم',
    copy: 'نسخ',
    copied: 'تم النسخ',
    refresh: 'تحديث',
    regenerate: 'إعادة التوليد',
    open: 'فتح',
    clear: 'مسح',
    settings: 'الإعدادات',
    chapter: 'الفصل',
    chapters: 'فصول',
    fromCache: 'من الذاكرة المحلية',
    generatedAt: 'أُنشئ',
    unknownNovel: 'رواية غير معروفة',
    stop: 'إيقاف',
    back: 'رجوع',
    yes: 'نعم',
    no: 'لا',
  },
  features: {
    recap: 'ما سبق',
    summary: 'ملخص الفصل',
    glossary: 'الشخصيات والأماكن',
    ask: 'اسأل الرواية',
    agent: 'محادثة الوكيل',
    test: 'اختبار',
  } as Record<AIFeature, string>,
  settings: {
    title: 'الذكاء الاصطناعي',
    subtitle: 'يعمل بمفتاحك الشخصي المجاني مباشرة من جهازك',
    enabled: 'تفعيل ميزات الذكاء الاصطناعي',
    enabledDesc: 'ما سبق، الملخصات، دليل الشخصيات، اسأل الرواية، ووكلاء سَرد',
    provider: 'المزوّد',
    providerGemini: 'Google Gemini (مجاني)',
    providerOpenAI: 'متوافق مع OpenAI (مثل OpenRouter)',
    apiKey: 'مفتاح API',
    apiKeyPlaceholderGemini: 'الصق مفتاح Gemini هنا (يبدأ عادة بـ AIza)',
    apiKeyPlaceholderOpenAI: 'الصق المفتاح هنا',
    apiKeySaved: 'تم حفظ المفتاح على جهازك فقط',
    apiKeyRemoved: 'تم حذف المفتاح',
    apiKeyMissing: 'لم يُضَف مفتاح بعد',
    apiKeyStored: 'المفتاح محفوظ',
    apiKeyLooksWrong: 'شكل المفتاح غير معتاد، تأكد من نسخه كاملاً',
    getFreeKey: 'احصل على مفتاح Gemini مجاني',
    getFreeKeyDesc: 'من Google AI Studio — لا يحتاج بطاقة دفع',
    removeKey: 'حذف المفتاح',
    removeKeyConfirm: 'سيتوقف الذكاء الاصطناعي حتى تضيف مفتاحاً جديداً.',
    showKey: 'إظهار',
    hideKey: 'إخفاء',
    model: 'النموذج',
    modelDesc: 'اختر نموذجاً مجانياً سريعاً',
    baseUrl: 'عنوان الخادم (Base URL)',
    test: 'اختبار الاتصال',
    testing: 'جارٍ الاختبار…',
    testOk: (ms: number, model: string) =>
      `يعمل ✓ خلال ${(ms / 1000).toFixed(1)} ث — ${model}`,
    privacyTitle: 'الخصوصية',
    privacy:
      'لا يوجد خادم لسَرد. النص يُرسل من جهازك مباشرة إلى المزوّد الذي اخترته، ومفتاحك مخزّن مشفّراً على الجهاز فقط ولا يُضمَّن في النسخ الاحتياطية.',
    contextSection: 'السياق والجودة',
    contextBudget: 'حجم النص المرسل في الطلب',
    contextBudgetDesc: (n: number) => `حتى ${Math.round(n / 1000)} ألف حرف`,
    recapChapters: 'عدد الفصول في «ما سبق»',
    recapChaptersDesc: (n: number) => `آخر ${n} فصول محمّلة قبل الفصل الحالي`,
    summaryLength: 'طول الملخص',
    summaryShort: 'قصير',
    summaryMedium: 'متوسط',
    summaryLong: 'مفصّل',
    askChapters: 'الفصول المفهرسة لـ«اسأل الرواية»',
    autoRecap: 'اعرض «ما سبق» قبل الفصل تلقائياً',
    autoRecapDesc: 'عند فتح فصل بعد انقطاع عن الرواية',
    autoRetry: 'إعادة المحاولة تلقائياً عند ضغط الطلبات',
    temperature: 'درجة الإبداع',
    quotaSection: 'حماية الحصة المجانية',
    quotaDesc:
      'عدّاد محلي يومي يمنع استهلاك حصتك المجانية. 0 = بلا حد محلي.',
    quotaTotal: 'الحد اليومي الكلي',
    quotaUsedToday: (used: number, limit: number) =>
      limit > 0 ? `${used} من ${limit} اليوم` : `${used} اليوم (بلا حد)`,
    quotaReset: 'تصفير عدّاد اليوم',
    quotaResetDone: 'تم تصفير عدّاد اليوم',
    quotaHistory: 'آخر الأيام',
    unlimited: 'بلا حد',
  },
  noKey: {
    title: 'أضف مفتاحك المجاني أولاً',
    body: 'ميزات الذكاء الاصطناعي في سَرد تعمل بمفتاح Gemini مجاني خاص بك. احصل عليه من Google AI Studio خلال دقيقة ثم الصقه في الإعدادات.',
    action: 'فتح إعدادات الذكاء الاصطناعي',
  },
  disabled: {
    title: 'ميزات الذكاء الاصطناعي متوقفة',
    body: 'فعّلها من إعدادات الذكاء الاصطناعي.',
  },
  recap: {
    title: 'ما سبق',
    intro: 'تذكير سريع بما حدث قبل هذا الفصل',
    generate: 'ذكّرني بما سبق',
    noPrevious: 'هذا أول فصل، لا يوجد ما سبق.',
    noDownloaded:
      'لا توجد فصول سابقة محمّلة. حمّل الفصول السابقة ليُكتب «ما سبق» منها.',
    downloadPrevious: (n: number) => `تحميل آخر ${n} فصول سابقة`,
    basedOn: (n: number, names: string) => `مبني على ${n} فصول: ${names}`,
    beforeChapter: (name: string) => `قبل: ${name}`,
  },
  summary: {
    title: 'ملخص الفصل',
    generate: 'لخّص هذا الفصل',
    notDownloaded: 'هذا الفصل غير محمّل، سيُجلب نصه من المصدر مرة واحدة.',
    spoilerWarnTitle: 'تنبيه حرق',
    spoilerWarn:
      'لم تقرأ هذا الفصل بعد. قد يكشف الملخص أحداثاً لم تصلها. هل تريد المتابعة؟',
    pickChapter: 'اختر فصلاً',
    volume: 'ملخص مجلد / نطاق',
    volumeRange: (from: string, to: string) => `من «${from}» إلى «${to}»`,
  },
  glossary: {
    title: 'الشخصيات والأماكن',
    spoilerSafe: 'آمن من الحرق: مبني فقط من الفصول التي قرأتها',
    build: 'بناء الدليل',
    update: (n: number) => `تحديث من ${n} فصول جديدة`,
    upToDate: 'الدليل محدّث حتى آخر فصل قرأته',
    builtUpTo: (name: string) => `محدّث حتى: ${name}`,
    empty: 'لم يُبنَ الدليل بعد. اقرأ بعض الفصول ثم اضغط «بناء الدليل».',
    noRead: 'لم تقرأ أي فصل محمّل بعد.',
    search: 'ابحث عن شخصية أو مكان…',
    progress: (done: number, total: number) => `معالجة ${done} / ${total}`,
    partial: (left: number) =>
      `توقّف مؤقتاً لحماية حصتك — بقي ${left} فصول، اضغط تحديث للمتابعة.`,
    firstSeen: (name: string) => `أول ظهور: ${name}`,
    reset: 'إعادة بناء الدليل من الصفر',
    resetConfirm: 'سيُحذف الدليل الحالي لهذه الرواية ويُبنى من جديد.',
    pinned: 'مثبّت',
    aliases: 'أسماء أخرى',
    categories: {
      character: 'شخصيات',
      place: 'أماكن',
      power: 'قدرات',
      item: 'أدوات',
      faction: 'جماعات',
      term: 'مصطلحات',
    } as Record<string, string>,
  },
  ask: {
    title: 'اسأل الرواية',
    placeholder: 'اسأل عن حدث أو شخصية… (بدون حرق)',
    send: 'إرسال',
    intro:
      'اسأل أي سؤال عن الرواية. الإجابات من الفصول التي قرأتها فقط، ولن تُكشف أحداث لاحقة.',
    indexing: (done: number, total: number) =>
      `فهرسة الفصول المقروءة ${done} / ${total}`,
    noContext: 'لم أجد فصولاً مقروءة ومحمّلة لأجيب منها.',
    sources: 'المصادر',
    clearChat: 'مسح المحادثة',
    suggestions: [
      'من هي الشخصيات الرئيسية حتى الآن؟',
      'ماذا حدث في آخر فصل قرأته؟',
      'ما هدف البطل حالياً؟',
    ],
  },
  errors: {
    NO_KEY: 'لم تُضِف مفتاح الذكاء الاصطناعي بعد. افتح الإعدادات وأضف مفتاح Gemini المجاني.',
    DISABLED: 'ميزات الذكاء الاصطناعي متوقفة من الإعدادات.',
    LOCAL_QUOTA: 'وصلت للحد اليومي المحلي لهذه الميزة لحماية حصتك المجانية. يمكنك تعديله من الإعدادات.',
    LOCAL_QUOTA_TOTAL: 'وصلت للحد اليومي الكلي للذكاء الاصطناعي. يتجدد غداً أو عدّله من الإعدادات.',
    RATE_LIMIT: 'المزوّد يطلب الانتظار قليلاً (حد الطلبات المجاني). حاول بعد دقيقة.',
    RATE_LIMIT_WAIT: (s: number) =>
      `حد الطلبات المجاني مؤقتاً. حاول بعد ${s} ثانية.`,
    INVALID_KEY: 'المفتاح غير صالح أو لا يملك صلاحية. تأكد منه في الإعدادات.',
    MODEL_NOT_FOUND: 'النموذج المختار غير متاح لمفتاحك. اختر نموذجاً آخر من الإعدادات.',
    BAD_REQUEST: 'رفض المزوّد الطلب. جرّب نموذجاً آخر أو قلّل حجم السياق.',
    SAFETY: 'رفض النموذج الرد لأسباب تتعلق بسياسة المحتوى.',
    EMPTY: 'لم يُرجع النموذج أي نص. حاول مرة أخرى.',
    NETWORK: 'تعذّر الاتصال. تحقق من الإنترنت.',
    TIMEOUT: 'انتهت مهلة الطلب. حاول مرة أخرى أو قلّل حجم السياق.',
    ABORTED: 'تم الإلغاء.',
    SERVER: 'خطأ مؤقت لدى المزوّد. حاول بعد قليل.',
    PARSE: 'تعذّر قراءة رد النموذج.',
    generic: 'حدث خطأ غير متوقع.',
  },
};

export const aiErrorMessage = (e: unknown): string => {
  const err = e as AIError | undefined;
  if (err && err.name === 'AIError') {
    if (err.code === 'LOCAL_QUOTA' && err.detail?.startsWith('tier')) {
      const limit = err.detail.split('/')[1];
      return `وصلت إلى حد عضويتك اليومي للذكاء الاصطناعي (${limit} طلبات). بلس ٥٠، برو ٢٠٠، أسطورة بلا حد — من «العضوية» في المزيد.`;
    }
    if (err.code === 'LOCAL_QUOTA' && err.detail?.startsWith('total')) {
      return AI_STRINGS.errors.LOCAL_QUOTA_TOTAL;
    }
    if (err.code === 'RATE_LIMIT' && err.retryAfterSec) {
      return AI_STRINGS.errors.RATE_LIMIT_WAIT(err.retryAfterSec);
    }
    return AI_STRINGS.errors[err.code] ?? AI_STRINGS.errors.generic;
  }
  if (e instanceof Error && e.message) return e.message;
  return AI_STRINGS.errors.generic;
};

// ======================================================= «وكلاء سَرد»

export const AGENT_STRINGS = {
  hubTitle: 'وكلاء سَرد',
  hubSubtitle: 'مساعدون يعملون على جهازك لتنظيم قراءتك',
  activity: 'سجل الوكلاء',
  activityEmpty: 'لا يوجد نشاط بعد.',
  clearActivity: 'مسح السجل',
  runNow: 'تشغيل الآن',
  lastRun: (t: string) => `آخر تشغيل: ${t}`,
  never: 'لم يعمل بعد',
  watcher: {
    title: 'مراقب الفصول',
    desc: 'يتابع الفصول الجديدة في مكتبتك ويحمّل الفصول التالية تلقائياً',
    enabledNovels: (n: number) => `${n} رواية بالتحميل التلقائي`,
    autoDownload: 'تحميل الفصول التالية تلقائياً',
    autoDownloadDesc: (n: number) =>
      `يبقي ${n} فصول جاهزة بعد آخر فصل قرأته`,
    count: 'عدد الفصول المحمّلة مسبقاً',
    wifiOnly: 'على الواي فاي فقط',
    checkUpdates: 'تحقق من الفصول الجديدة الآن',
    checkUpdatesStarted: 'بدأ التحقق من الفصول الجديدة',
    searchNovels: 'ابحث في مكتبتك…',
    queued: (n: number, novel: string) => `أُضيف ${n} فصل من «${novel}» للتحميل`,
    nothingToQueue: 'كل الفصول التالية محمّلة بالفعل',
    skipped: {
      disabled: 'متوقف',
      offline: 'لا يوجد اتصال',
      not_wifi: 'بانتظار الواي فاي',
      unknown_network:
        'تعذّر التحقق من نوع الشبكة — فعّل «أي شبكة» أو أضف مكتبة NetInfo',
    } as Record<string, string>,
    summary: (queued: number, novels: number) =>
      queued
        ? `تم جدولة ${queued} فصل من ${novels} رواية`
        : 'لا يوجد فصول جديدة للتحميل',
    battery:
      'يعمل بعد تحديث المكتبة (التلقائي أو اليدوي) عبر نظام المهام الخلفية في LNReader، فلا يستهلك بطارية إضافية.',
  },
  librarian: {
    title: 'أمين المكتبة',
    desc: 'رفوف ذكية، كشف المكرر، وترتيب المكتبة — محلياً بالكامل',
    shelvesTitle: 'الرفوف الذكية',
    shelves: {
      paused: 'متوقفة',
      near_finish: 'قربت تخلص',
      binge_ready: 'جاهزة للقراءة المتواصلة',
      not_started: 'لم تبدأ',
      finished: 'منتهية',
    } as Record<string, string>,
    shelfEmpty: 'لا توجد روايات في هذا الرف.',
    duplicates: 'المكررات',
    duplicatesDesc: 'نفس الرواية من أكثر من مصدر',
    noDuplicates: 'لا توجد روايات مكررة 👌',
    keepSuggestion: 'المقترح الإبقاء عليها',
    removeOthers: 'إزالة الباقي من المكتبة',
    removeOthersConfirm: (n: number) =>
      `ستُزال ${n} نسخة من المكتبة (تبقى الفصول المحمّلة حتى تحذفها). متابعة؟`,
    organize: 'رتّب مكتبتي في فئات',
    organizeConfirm:
      'سيُنشئ فئات «متوقفة، قربت تخلص، جاهزة للقراءة المتواصلة، لم تبدأ، منتهية» ويضيف الروايات إليها. لن تُحذف أي فئة أو رواية.',
    organizeDone: (n: number) => `تم ترتيب ${n} رواية في الفئات الذكية`,
    rules: 'قواعد الرفوف',
    pausedDays: 'متوقفة بعد (أيام بلا قراءة)',
    nearFinishRemaining: 'قربت تخلص عند بقاء (فصول)',
    bingeMin: 'جاهزة للمتواصل عند (فصول محمّلة غير مقروءة)',
    total: (n: number) => `${n} رواية`,
  },
  recommender: {
    title: 'المرشّح',
    desc: 'ترشيحات حسب ذوقك من مصادرك المثبتة فقط',
    taste: 'ذوقك',
    noTaste: 'أضف روايات لمكتبتك واقرأ قليلاً ليتعرّف المرشّح على ذوقك.',
    noSources: 'لا توجد مصادر مثبتة. الترشيحات تأتي فقط من المصادر المثبتة لديك.',
    scanning: (done: number, total: number, name: string) =>
      `يفحص «${name}» (${done}/${total})`,
    refresh: 'ترشيحات جديدة',
    empty: 'لم أجد ترشيحات جديدة الآن. جرّب لاحقاً.',
    sourcesUsed: (n: number) => `من ${n} مصدر مثبت`,
    deepScan: 'تحليل أعمق (يجلب تصنيفات أكثر — أبطأ)',
    failedSources: (n: number) => `تعذّر الوصول إلى ${n} مصدر`,
  },
  chat: {
    title: 'محادثة الوكيل',
    placeholder: 'اكتب أمراً… مثل: نزّل آخر 20 فصل من …',
    welcome:
      'أهلاً! أنا وكيل سَرد. أستطيع تنزيل الفصول، تلخيص فصل أو مجلد، كتابة «ما سبق»، ترتيب مكتبتك، كشف المكرر، وترشيح روايات من مصادرك المثبتة.',
    suggestions: [
      'نزّل آخر 20 فصل من …',
      'لخّص المجلد التاني من …',
      'رتّب مكتبتي',
      'إيه الروايات اللي قربت أخلصها؟',
      'رشّحلي روايات',
      'فيه روايات مكررة؟',
    ],
    thinking: 'يفكّر…',
    working: 'ينفّذ…',
    clear: 'مسح المحادثة',
    clearConfirm: 'ستُحذف كل رسائل المحادثة.',
    confirmTitle: 'تأكيد الإجراء',
    confirmAction: 'نفّذ',
    cancelled: 'تم الإلغاء، لم يتغير شيء.',
    whichNovel: 'أي رواية تقصد؟',
    novelNotFound: (q: string) => `لم أجد «${q}» في مكتبتك.`,
    unknownTool: 'هذا الإجراء غير متاح للوكيل.',
    invalidArgs: 'لم أفهم تفاصيل الأمر، جرّب صياغة أوضح.',
    offlineHint:
      'فهمت الأوامر الأساسية بدون ذكاء اصطناعي. للأوامر الحرة أضف مفتاح Gemini المجاني من الإعدادات.',
    sourceRefusal:
      'لا أستطيع البحث عن مصادر أو مواقع أو مستودعات أو إضافتها أو اقتراحها. تُضاف المصادر فقط من مستودعاتك أنت عبر الإعدادات ← المستودعات.',
    showLegal: 'عرض المصادر القانونية',
    openNovel: 'فتح الرواية',
    openShelves: 'فتح الرفوف',
    openRecommendations: 'فتح الترشيحات',
    downloadQueued: (n: number, novel: string) =>
      `تمت جدولة تنزيل ${n} فصل من «${novel}». تابع التقدم من قائمة التنزيلات.`,
    downloadNone: (novel: string) =>
      `كل الفصول المطلوبة من «${novel}» محمّلة بالفعل.`,
    confirmDownloadMany: (n: number, novel: string) =>
      `سيتم تنزيل ${n} فصل من «${novel}». متابعة؟`,
    autoDownloadSet: (novel: string, on: boolean, n: number, wifi: boolean) =>
      on
        ? `تم تفعيل التحميل التلقائي لـ«${novel}»: ${n} فصول${wifi ? ' على الواي فاي' : ''}.`
        : `تم إيقاف التحميل التلقائي لـ«${novel}».`,
    markReadConfirm: (novel: string, n: number) =>
      `سيتم تعليم ${n} فصل من «${novel}» كمقروء. متابعة؟`,
    markReadDone: (n: number) => `تم تعليم ${n} فصل كمقروء.`,
    deleteDownloadsConfirm: (novel: string, n: number) =>
      `سيتم حذف ${n} فصل محمّل من «${novel}». متابعة؟`,
    deleteDownloadsDone: (n: number) => `تم حذف ${n} فصل محمّل.`,
    removeConfirm: (novel: string) =>
      `ستُزال «${novel}» من مكتبتك. متابعة؟`,
    removeDone: (novel: string) => `أُزيلت «${novel}» من المكتبة.`,
    updatesStarted: 'بدأ التحقق من الفصول الجديدة في الخلفية.',
    volumeNotFound: (v: number, total: number) =>
      `لم أجد المجلد ${v}. عدد المجلدات المكتشفة: ${total}.`,
    chapterNotFound: 'لم أجد هذا الفصل.',
    cappedAtCutoff:
      'لخّصت حتى آخر فصل قرأته فقط لتجنّب الحرق.',
    nothingRead: 'لم تقرأ أي فصل من هذا النطاق بعد — لا أستطيع تلخيصه دون حرق.',
    usage: (used: number, limit: number) =>
      limit > 0
        ? `استهلكت اليوم ${used} من ${limit} طلب ذكاء اصطناعي.`
        : `استهلكت اليوم ${used} طلب ذكاء اصطناعي (بلا حد محلي).`,
    shelfHeader: (name: string, n: number) => `رف «${name}» (${n}):`,
    duplicatesHeader: (n: number) => `وجدت ${n} مجموعة مكررة:`,
    recommendHeader: 'ترشيحات من مصادرك المثبتة:',
    legalHeader: 'المصادر القانونية المدمجة في سَرد:',
  },
  scout: {
    title: 'المصادر القانونية',
    desc: 'قائمة المصادر القانونية المدمجة في التطبيق فقط',
    note:
      'يعرض سَرد هنا فقط المصادر القانونية المدمجة (ملكية عامة أو رخص مفتوحة). الوكلاء لا يبحثون عن مصادر أو مواقع ولا يضيفونها.',
    license: 'الرخصة',
    openLicense: 'عرض شروط الترخيص',
    browse: 'تصفّح',
  },
};
