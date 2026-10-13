/**
 * Arabic UI strings for Sard's reader track (fonts, tashkeel, focus,
 * auto-scroll, highlights, TTS extras, goals/streaks). Kept here instead of
 * the shared i18n locale files.
 */
export const SARD_READER_STRINGS = {
  // Sections
  arabicSection: 'العربية',
  typographySection: 'الطباعة',
  focusSection: 'التركيز',
  autoScrollSection: 'التمرير التلقائي',
  highlightsSection: 'التظليلات والملاحظات',
  goalsSection: 'الأهداف',

  // Fonts
  fontWeight: 'سُمك الخط',
  fontWeightDefault: 'افتراضي',
  autoLineHeight: 'تباعد أسطر مناسب للخط',
  autoLineHeightDesc: 'يضبط تباعد الأسطر تلقائيًا عند اختيار خط عربي',
  weightNames: {
    100: 'رفيع جدًا',
    200: 'رفيع',
    300: 'خفيف',
    400: 'عادي',
    500: 'متوسط',
    600: 'شبه عريض',
    700: 'عريض',
    800: 'عريض جدًا',
    900: 'أسود',
    1000: 'أسود',
  } as Record<number, string>,

  // Tashkeel
  tashkeel: 'التشكيل (الحركات)',
  tashkeelShow: 'إظهار',
  tashkeelHide: 'إخفاء',
  tashkeelKeepShadda: 'الشدّة فقط',
  tashkeelDesc: 'إخفاء الحركات يسهّل قراءة النصوص المشكولة بالكامل',
  stripTatweel: 'إزالة التطويل (ـ)',
  stripTatweelDesc: 'يحذف حروف الكشيدة المضافة يدويًا في النص',

  // Direction & digits
  direction: 'اتجاه النص',
  directionAuto: 'تلقائي',
  directionRtl: 'يمين ← يسار',
  directionLtr: 'يسار → يمين',
  directionSource: 'حسب المصدر',
  directionDesc: 'التلقائي يكتشف العربية في كل فصل وكل فقرة',
  digits: 'الأرقام',
  digitsDefault: 'كما في النص',
  digitsArabic: '١٢٣ هندية',
  digitsWestern: '123 عربية',

  // Typography
  kashida: 'ضبط عربي محسّن',
  kashidaDesc:
    'عند المحاذاة بالضبط: توزيع بين الكلمات دون كسر اتصال الحروف، وآخر سطر من البداية',
  hyphenate: 'تقسيم الكلمات اللاتينية',
  wordSpacing: 'تباعد الكلمات',
  paragraphSpacing: 'تباعد الفقرات',
  textIndent: 'إزاحة أول السطر',
  defaultValue: 'افتراضي',
  resetArabic: 'استعادة الإعدادات العربية الافتراضية',

  // Focus
  focusMode: 'وضع التركيز',
  focusOff: 'إيقاف',
  focusRuler: 'مسطرة',
  focusLine: 'خط إرشادي',
  focusParagraph: 'فقرة',
  focusDesc: 'يعتّم ما حول السطر الذي تقرؤه. اسحب المقبض الجانبي لتحريكه',
  focusLines: 'ارتفاع المسطرة (أسطر)',
  focusDim: 'شدة التعتيم',
  focusPosition: 'موضع المسطرة',

  // Auto-scroll
  autoScrollMode: 'نوع التمرير التلقائي',
  autoScrollSmooth: 'انسيابي',
  autoScrollPage: 'صفحة صفحة',
  autoScrollSpeed: 'السرعة',
  autoScrollSpeedUnit: 'بكسل/ث',
  autoScrollNext: 'الانتقال للفصل التالي تلقائيًا',
  autoScrollPauseOnTouch: 'إيقاف مؤقت عند اللمس',
  autoScrollPageOnlyNote:
    'التمرير الانسيابي يعمل في وضع التمرير فقط؛ في وضع الصفحات يُستخدم «صفحة صفحة».',
  slower: 'أبطأ',
  faster: 'أسرع',
  pause: 'إيقاف مؤقت',

  // Highlights
  highlight: 'تظليل',
  note: 'ملاحظة',
  copy: 'نسخ',
  share: 'مشاركة',
  copied: 'تم النسخ',
  highlights: 'التظليلات والملاحظات',
  highlightsEnabled: 'إظهار التظليلات في النص',
  defaultColor: 'اللون الافتراضي',
  addNote: 'إضافة ملاحظة',
  editNote: 'تعديل الملاحظة',
  notePlaceholder: 'اكتب ملاحظتك…',
  save: 'حفظ',
  cancel: 'إلغاء',
  delete: 'حذف',
  deleteConfirm: 'تأكيد الحذف',
  deleteConfirmMany: (n: number) => `حذف ${n} من التظليلات؟`,
  saved: 'تم الحفظ',
  highlightSaved: 'تم التظليل',
  noHighlights: 'لا توجد تظليلات بعد',
  noHighlightsHint: 'حدّد نصًا أثناء القراءة ثم اضغط «تظليل» أو «ملاحظة».',
  noResults: 'لا نتائج مطابقة',
  searchHighlights: 'ابحث في التظليلات والملاحظات',
  filterAll: 'الكل',
  filterNotes: 'بملاحظات',
  sortNewest: 'الأحدث',
  sortOldest: 'الأقدم',
  sortPosition: 'حسب الموضع',
  orphaned: 'لم يعد هذا النص موجودًا في الفصل',
  chapterMissing: 'لم يعد هذا الفصل موجودًا في المكتبة',
  thisNovel: 'هذه الرواية',
  allNovels: 'كل الروايات',
  exportHighlights: 'تصدير كنص',
  highlightCount: (n: number) =>
    n === 0
      ? 'لا تظليلات'
      : n === 1
        ? 'تظليل واحد'
        : n === 2
          ? 'تظليلان'
          : n <= 10
            ? `${n} تظليلات`
            : `${n} تظليلًا`,
  selectedCount: (n: number) => `${n} محدد`,

  // Quote card
  quoteCard: 'بطاقة اقتباس',
  shareImage: 'مشاركة كصورة',
  shareText: 'مشاركة كنص',
  cardStyle: 'التصميم',
  cardFont: 'الخط',
  cardStyles: {
    paper: 'ورقي',
    night: 'ليلي',
    olive: 'زيتوني',
    rose: 'وردي',
    ink: 'حبر',
  } as Record<string, string>,
  quoteFooter: 'من تطبيق سَرد',
  shareFailed: 'تعذّرت المشاركة كصورة، ستتم المشاركة كنص.',

  // TTS
  sleepTimer: 'مؤقت النوم',
  sleepOff: 'إيقاف',
  sleepEndOfChapter: 'نهاية الفصل',
  sleepChapters: (n: number) => (n === 2 ? 'فصلان' : `${n} فصول`),
  sleepMinutes: (n: number) => `${n} دقيقة`,
  sleepRemaining: (s: string) => `يتوقف بعد ${s}`,
  sleepAfterChapters: (n: number) =>
    n <= 1 ? 'يتوقف في نهاية هذا الفصل' : `يتوقف بعد ${n} فصول`,
  sleepFinishParagraph: 'إكمال الفقرة قبل الإيقاف',
  sleepExtend: '+10 دقائق',
  sleepCancel: 'إلغاء المؤقت',
  preferArabicVoice: 'تفضيل صوت عربي',
  preferArabicVoiceDesc:
    'يختار صوتًا عربيًا تلقائيًا للفصول العربية إذا لم تختر صوتًا',
  arabicVoices: 'أصوات عربية',
  noArabicVoices:
    'لا توجد أصوات عربية مثبّتة. ثبّت حزمة العربية من إعدادات تحويل النص إلى كلام في أندرويد.',
  testVoice: 'تجربة الصوت',
  voiceSample: 'مرحبًا، هذا مثال على صوت القراءة في سَرد.',
  ratePresets: 'سرعات سريعة',
  resetRatePitch: 'إعادة السرعة والنبرة',

  // Goals & stats
  goalsTab: 'الأهداف',
  dailyGoal: 'الهدف اليومي',
  dailyGoalMinutes: (n: number) => (n === 0 ? 'أي قراءة' : `${n} دقيقة`),
  todayProgress: 'قراءة اليوم',
  goalReached: 'أحسنت! حققت هدف اليوم',
  goalRemaining: (s: string) => `باقٍ ${s} لتحقيق هدف اليوم`,
  streak: 'سلسلة الأيام',
  currentStreak: 'السلسلة الحالية',
  longestStreak: 'أطول سلسلة',
  days: (n: number) =>
    n === 0
      ? '٠ يوم'
      : n === 1
        ? 'يوم واحد'
        : n === 2
          ? 'يومان'
          : n <= 10
            ? `${n} أيام`
            : `${n} يومًا`,
  streakAtRisk: 'اقرأ اليوم لتحافظ على سلسلتك',
  streakStart: 'ابدأ سلسلة جديدة بالقراءة اليوم',
  last15Weeks: 'آخر ١٥ أسبوعًا',
  less: 'أقل',
  more: 'أكثر',
  thisWeek: 'هذا الأسبوع',
  lastWeek: 'الأسبوع الماضي',
  weekChange: (pct: number) =>
    pct === 0
      ? 'مثل الأسبوع الماضي'
      : pct > 0
        ? `أكثر بـ ${pct}٪ من الأسبوع الماضي`
        : `أقل بـ ${Math.abs(pct)}٪ من الأسبوع الماضي`,
  yearWrap: (y: number) => `حصاد ${y}`,
  wrapTotal: 'وقت القراءة',
  wrapActiveDays: 'أيام القراءة',
  wrapChapters: 'فصول مكتملة',
  wrapLongest: 'أطول سلسلة',
  wrapBestDay: 'أفضل يوم',
  wrapBestMonth: 'أفضل شهر',
  wrapFavoriteDay: 'يومك المفضل',
  wrapGoalDays: 'أيام حققت فيها الهدف',
  wrapAverage: 'المتوسط في يوم القراءة',
  wrapTopNovels: 'الأكثر قراءة',
  wrapEmpty: 'لا توجد قراءة مسجلة في هذا العام بعد',
  shareWrap: 'مشاركة الحصاد',
  months: [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ],
  weekdays: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  weekdaysShort: ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'],
  historyNote: 'الأيام السابقة لتثبيت الميزة تقديرية (من سجل القراءة).',
};

export type SardReaderStrings = typeof SARD_READER_STRINGS;
