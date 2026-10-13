/**
 * Arabic UI strings for Sard's bundled (built-in) legal sources.
 * Kept here (not in the i18n locale files) so this track does not touch
 * shared translation files.
 */
export const SARD_SOURCE_STRINGS = {
  sectionTitle: 'مصادر سَرد المدمجة',
  sectionSubtitle: 'مكتبات قانونية مجانية مدمجة في التطبيق',
  builtInBadge: 'مدمج',
  cannotUninstall: 'هذا المصدر مدمج في سَرد ولا يمكن إلغاء تثبيته',
  licenseLabel: 'الترخيص',

  // Generic errors
  errNetwork: 'تعذّر الاتصال بالمصدر. تحقّق من الإنترنت وحاول مجددًا.',
  errTimeout: 'انتهت مهلة الاتصال بالمصدر.',
  errHttp: (status: number) => `ردّ المصدر بخطأ (${status}).`,
  errBlocked:
    'المصدر يطلب تحققًا من المتصفح. افتح الصفحة في WebView ثم أعد المحاولة.',
  errNotFound: 'لم يُعثر على هذا العنوان في المصدر.',
  errParse: 'تعذّرت قراءة ردّ المصدر.',
  errChapterMissing: 'تعذّر العثور على هذا الفصل. حدّث قائمة الفصول.',

  // Generic labels
  untitled: 'بلا عنوان',
  unknownAuthor: 'مؤلف غير معروف',
  intro: 'المقدّمة',
  chapterN: (n: number) => `الفصل ${n}`,
  partN: (n: number) => `الجزء ${n}`,
  fullText: 'النص الكامل',
  all: 'الكل',
  sortBy: 'الترتيب',
  language: 'اللغة',
  genre: 'التصنيف',
  topic: 'الموضوع',
  category: 'القسم',
  authorLabel: 'المؤلف',
  translatorLabel: 'ترجمة',
  editorLabel: 'تحرير',
  subjectsLabel: 'الموضوعات',
  wordsLabel: 'عدد الكلمات',
  readingTimeLabel: 'مدة القراءة',
  publishedLabel: 'تاريخ النشر',
  sourceLabel: 'المصدر',

  // Project Gutenberg
  gutenbergName: 'مشروع غوتنبرغ',
  gutenbergLicense:
    'ملكية عامة في الولايات المتحدة — Project Gutenberg License. تحقّق من قوانين بلدك قبل إعادة النشر.',
  gutenbergCopyrighted:
    'تنبيه: هذا العنوان محميّ بحقوق نشر في بعض البلدان بحسب بيانات المشروع.',
  gutenbergSortPopular: 'الأكثر تحميلًا',
  gutenbergSortAscending: 'الأقدم رقمًا',
  gutenbergSortDescending: 'الأحدث إضافةً',
  gutenbergTopic: 'الموضوع/الرف',
  gutenbergAuthorYearStart: 'المؤلف عاش بعد سنة',
  gutenbergAuthorYearEnd: 'المؤلف عاش قبل سنة',
  gutenbergDownloads: 'عدد التحميلات',
  gutenbergBookshelves: 'الرفوف',

  // Standard Ebooks
  standardEbooksName: 'ستاندرد إيبوكس',
  standardEbooksLicense:
    'نُسخ Standard Ebooks مكرّسة للملك العام (CC0 1.0)، والنصوص الأصلية في الملك العام في الولايات المتحدة وقد تكون محمية في بلدان أخرى؛ تحقّق من قوانين بلدك.',
  seSortPopularity: 'الأكثر شعبية',
  seSortNewest: 'الأحدث إصدارًا',
  seSortAuthor: 'اسم المؤلف (أ → ي)',
  seSortReadingEase: 'سهولة القراءة',
  seSortLength: 'الطول (الأقصر أولًا)',
  seSortRelevance: 'الأكثر صلة',
  seReadingEase: 'سهولة القراءة',

  // Arabic Wikisource
  wikisourceName: 'ويكي مصدر العربية',
  wikisourceLicense:
    'نصوص ويكي مصدر متاحة بموجب ترخيص المشاع الإبداعي (CC BY-SA 4.0)، ومعظم الأعمال الأصلية في الملك العام. تحقّق من حالة كل نص في صفحته.',
  wsCatNovels: 'روايات',
  wsCatStories: 'قصص',
  wsCatShortStories: 'قصص قصيرة',
  wsCatPlays: 'مسرحيات',
  wsCatLiterature: 'أدب',
  wsCatPoetryCollections: 'دواوين شعرية',
  wsCatTranslated: 'أعمال مترجمة',
  wsCatChildren: 'أدب الأطفال',
  wsSortTitle: 'أبجديًا',
  wsSortRecent: 'الأحدث إضافةً',
  wsCustomCategory: 'تصنيف مخصّص (اختياري)',
  wsLicenseCategoryNote: (cats: string) => `تصنيفات الصفحة: ${cats}`,

  // OPDS
  opdsName: 'كتالوج OPDS',
  opdsCatalogUrl: 'رابط كتالوج OPDS (Calibre-web / Kavita / Komga …)',
  opdsUsername: 'اسم المستخدم (اختياري)',
  opdsPassword: 'كلمة المرور (اختياري)',
  opdsShowNavigation: 'عرض الأقسام كعناصر قابلة للفتح',
  opdsNotConfigured:
    'لم يُضبط رابط كتالوج OPDS بعد. افتح إعدادات المصدر وأدخل رابط الكتالوج الخاص بك.',
  opdsAuthRequired:
    'الكتالوج يطلب تسجيل الدخول. أدخل اسم المستخدم وكلمة المرور في إعدادات المصدر.',
  opdsFeed: 'القسم',
  opdsRoot: 'الصفحة الرئيسية للكتالوج',
  opdsCustomFeed: 'رابط قسم مخصّص (اختياري)',
  opdsSearchUnsupported: 'هذا الكتالوج لا يدعم البحث.',
  opdsFolder: 'قسم',
  opdsFolderSummary: 'هذا قسم في الكتالوج. افتح الفصول لاستعراض محتواه.',
  opdsNoEpub:
    'لا يوفّر الكتالوج نسخة EPUB لهذا الكتاب. يمكنك فتح رابط التحميل مباشرة:',
  opdsDownloadLink: 'رابط التحميل',
  opdsFormats: 'الصيغ المتاحة',
  opdsEpubFailed: 'تعذّر تنزيل ملف EPUB من الكتالوج أو فكّه.',
  opdsLicenseNote:
    'محتوى هذا المصدر يأتي من خادمك أو كتالوج اخترته بنفسك؛ أنت مسؤول عن حقوق ما تضيفه.',
  opdsEntriesInFolder: (n: number) => `يحتوي على ${n} عنصرًا`,

  // Hindawi (skipped — see docs)
} as const;

export type SardSourceStrings = typeof SARD_SOURCE_STRINGS;
