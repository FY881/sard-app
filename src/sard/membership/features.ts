/**
 * FEATURES registry — single source of truth for every gated or new Sard 1.1
 * feature: minimum tier, category, Arabic/English title + description, an
 * optional numeric limit, and the screen that hosts it.
 * The remote-config flags use the same keys.
 */
import type { L10n, LimitKey, Tier } from './tiers';

export type FeatureCategory =
  | 'reading'
  | 'library'
  | 'offline'
  | 'motivation'
  | 'custom'
  | 'localAi'
  | 'privacy'
  | 'tools'
  | 'premium';

export const CATEGORY_META: Record<FeatureCategory, { title: L10n; icon: string }> = {
  reading: { title: { ar: 'القراءة', en: 'Reading' }, icon: 'book-open-variant' },
  library: { title: { ar: 'المكتبة والتنظيم', en: 'Library & organising' }, icon: 'bookshelf' },
  offline: { title: { ar: 'التنزيل والأوفلاين', en: 'Downloads & offline' }, icon: 'download-circle-outline' },
  motivation: { title: { ar: 'الإحصاءات والتحفيز', en: 'Stats & motivation' }, icon: 'trophy-outline' },
  custom: { title: { ar: 'التخصيص والمظهر', en: 'Look & feel' }, icon: 'palette-outline' },
  localAi: { title: { ar: 'الذكاء الاصطناعي المحلي', en: 'On-device AI' }, icon: 'brain' },
  privacy: { title: { ar: 'الخصوصية والأمان', en: 'Privacy & security' }, icon: 'shield-lock-outline' },
  tools: { title: { ar: 'الأدوات والنسخ الاحتياطي', en: 'Tools & backup' }, icon: 'toolbox-outline' },
  premium: { title: { ar: 'مزايا العضوية', en: 'Membership perks' }, icon: 'crown-outline' },
};

export const CATEGORY_ORDER: FeatureCategory[] = [
  'reading',
  'library',
  'offline',
  'motivation',
  'custom',
  'localAi',
  'privacy',
  'tools',
  'premium',
];

export interface FeatureDef {
  tier: Tier;
  category: FeatureCategory;
  title: L10n;
  desc: L10n;
  icon: string;
  limit?: LimitKey;
  /** MoreStack route that hosts it (feature directory link). */
  route?: string;
}

const f = (
  tier: Tier,
  category: FeatureCategory,
  icon: string,
  title: L10n,
  desc: L10n,
  extra: Partial<FeatureDef> = {},
): FeatureDef => ({ tier, category, icon, title, desc, ...extra });

export const FEATURES = {
  /* ------------------------------------------------------------ القراءة */
  'reading.chapterTime': f('free', 'reading', 'timer-sand', { ar: 'وقت قراءة الفصل', en: 'Chapter reading time' }, { ar: 'تقدير الدقائق والكلمات لكل فصل والوقت المتبقي أثناء القراءة', en: 'Minutes and words per chapter plus time left while reading' }),
  'reading.personalWpm': f('free', 'reading', 'speedometer', { ar: 'سرعتك الشخصية', en: 'Personal reading speed' }, { ar: 'يتعلّم سَرد سرعة قراءتك (كلمة/دقيقة) لتصبح التقديرات دقيقة لك', en: 'Learns your words-per-minute so estimates fit you' }, { route: 'SardReadingTools' }),
  'reading.bookmarks': f('free', 'reading', 'bookmark-multiple-outline', { ar: 'علامات بملاحظات', en: 'Bookmarks with notes' }, { ar: 'ضع علامة عند أي موضع في الفصل مع ملاحظة وارجع إليه بلمسة', en: 'Bookmark any spot in a chapter with a note and jump back' }, { route: 'SardBookmarks' }),
  'reading.vocabulary': f('free', 'reading', 'alphabetical-variant', { ar: 'دفتر المفردات', en: 'Vocabulary notebook' }, { ar: 'حدّد كلمة أثناء القراءة واحفظها مع جملتها ومعناها', en: 'Save a selected word with its sentence and meaning' }, { route: 'SardVocabulary' }),
  'reading.vocabReview': f('plus', 'reading', 'cards-outline', { ar: 'مراجعة المفردات', en: 'Vocabulary review' }, { ar: 'بطاقات مراجعة بنظام لايتنر للتكرار المتباعد', en: 'Leitner spaced-repetition flashcards' }, { route: 'SardVocabulary' }),
  'reading.blueLight': f('free', 'reading', 'weather-night', { ar: 'فلتر الضوء الأزرق', en: 'Blue-light filter' }, { ar: 'طبقة دافئة بقوة قابلة للضبط فوق القارئ', en: 'Adjustable warm overlay over the reader' }),
  'reading.nightSchedule': f('free', 'reading', 'clock-time-ten-outline', { ar: 'جدول الوضع الليلي', en: 'Night schedule' }, { ar: 'تشغيل ثيم ليلي وفلتر دافئ تلقائيًا بين ساعتين تختارهما', en: 'Auto night theme and warm filter between two hours' }),
  'reading.pageHaptics': f('free', 'reading', 'vibrate', { ar: 'اهتزاز التقليب', en: 'Page-turn haptics' }, { ar: 'نقرة اهتزاز خفيفة عند تقليب الصفحة أو الانتقال لفصل', en: 'A light tap when turning a page or chapter' }),
  'reading.pageSounds': f('plus', 'reading', 'volume-high', { ar: 'أصوات التقليب', en: 'Page-turn sounds' }, { ar: 'صوت ورق أو نقرة أو جرس خفيف مع كل صفحة', en: 'Paper, click or chime sound on every page' }),
  'reading.readerProfiles': f('free', 'reading', 'account-cog-outline', { ar: 'ملفات قارئ لكل رواية', en: 'Per-novel reader profiles' }, { ar: 'احفظ إعدادات القارئ باسم واربطها برواية فتُطبّق عند فتحها', en: 'Save reader settings as a profile and bind it to a novel' }, { limit: 'readerProfiles', route: 'SardReadingTools' }),
  'reading.sessionTimer': f('free', 'reading', 'timer-outline', { ar: 'مؤقّت جلسة القراءة', en: 'Reading session timer' }, { ar: 'حدّد مدة جلسة (مثل ٢٥ دقيقة) وتلقَّ تنبيهًا عند انتهائها', en: 'Set a session length and get a nudge when it ends' }),

  /* ------------------------------------------------------- المكتبة */
  'library.tags': f('free', 'library', 'tag-multiple-outline', { ar: 'وسوم الروايات', en: 'Novel tags' }, { ar: 'وسوم حرة ملوّنة لكل رواية مع بحث وتصفية', en: 'Free-form coloured tags with search and filtering' }, { route: 'SardLibraryTools' }),
  'library.smartFilters': f('plus', 'library', 'filter-variant-plus', { ar: 'فلاتر ذكية محفوظة', en: 'Saved smart filters' }, { ar: 'اجمع الوسوم والحالة والتقدّم والتقييم في فلتر محفوظ', en: 'Combine tags, status, progress and rating into saved filters' }, { limit: 'smartFilters', route: 'SardLibraryTools' }),
  'library.surpriseMe': f('free', 'library', 'dice-5-outline', { ar: 'فاجئني', en: 'Surprise me' }, { ar: 'رواية أو فصل غير مقروء عشوائي من مكتبتك', en: 'A random novel or unread chapter from your library' }, { route: 'SardLibraryTools' }),
  'library.bulkActions': f('free', 'library', 'checkbox-multiple-marked-outline', { ar: 'إجراءات جماعية', en: 'Bulk actions' }, { ar: 'وسم أو إخفاء أو تغيير حالة عدة روايات مرة واحدة', en: 'Tag, hide or set status for many novels at once' }, { route: 'SardLibraryTools' }),
  'library.notesRating': f('free', 'library', 'star-half-full', { ar: 'تقييم وملاحظة شخصية', en: 'Personal rating & note' }, { ar: 'نجوم من ١ إلى ٥ وملاحظة خاصة لكل رواية', en: '1–5 stars and a private note per novel' }, { route: 'SardLibraryTools' }),
  'library.readingStatus': f('free', 'library', 'list-status', { ar: 'حالة القراءة', en: 'Reading status' }, { ar: 'أقرأها، مخطط لها، أنهيتها، متوقفة، تركتها', en: 'Reading, planned, finished, paused, dropped' }, { route: 'SardLibraryTools' }),
  'library.upNext': f('free', 'library', 'playlist-play', { ar: 'التالي للقراءة', en: 'Up next queue' }, { ar: 'قائمة مرتبة بالروايات التي ستقرؤها بعد ذلك', en: 'An ordered queue of what you will read next' }, { route: 'SardLibraryTools' }),
  'library.shareList': f('free', 'library', 'share-variant-outline', { ar: 'مشاركة قائمة المكتبة', en: 'Share library list' }, { ar: 'نص مرتب بأسماء رواياتك وحالتها وتقييمك', en: 'A tidy text list of your novels, status and rating' }, { route: 'SardLibraryTools' }),

  /* ------------------------------------------------------- الأوفلاين */
  'offline.scheduler': f('plus', 'offline', 'calendar-clock', { ar: 'جدولة التنزيل', en: 'Download scheduler' }, { ar: 'نزّل فقط على واي فاي أو أثناء الشحن أو في ساعات تحددها', en: 'Download only on Wi-Fi, while charging or in chosen hours' }, { route: 'SardStorage' }),
  'offline.storageManager': f('free', 'offline', 'harddisk', { ar: 'مدير التخزين', en: 'Storage manager' }, { ar: 'حجم كل رواية على الجهاز وحذف الفصول المقروءة بلمسة', en: 'Size per novel and one-tap removal of read chapters' }, { route: 'SardStorage' }),
  'offline.smartCleanup': f('plus', 'offline', 'broom', { ar: 'تنظيف ذكي', en: 'Smart cleanup' }, { ar: 'حذف تلقائي للفصول المقروءة المنزّلة بعد عدد أيام تختاره', en: 'Auto-delete downloaded chapters read more than N days ago' }, { route: 'SardStorage' }),
  'offline.integrityCheck': f('free', 'offline', 'file-check-outline', { ar: 'فحص سلامة التنزيلات', en: 'Download integrity check' }, { ar: 'يكتشف الفصول المنزّلة الفارغة أو المفقودة ويعيد جدولتها', en: 'Finds empty or missing downloads and re-queues them' }, { route: 'SardStorage' }),
  'offline.bulkByTag': f('plus', 'offline', 'tag-arrow-down-outline', { ar: 'تنزيل حسب الوسم', en: 'Download by tag' }, { ar: 'نزّل الفصول غير المقروءة لكل روايات وسم معيّن', en: 'Download unread chapters of every novel with a tag' }, { route: 'SardStorage' }),
  'offline.unlimited': f('plus', 'offline', 'infinity', { ar: 'تنزيل بلا حد', en: 'Unlimited offline' }, { ar: 'المجاني يحتفظ حتى ٣٠٠ فصل منزّل، والعضوية بلا حد', en: 'Free keeps up to 300 downloaded chapters; members unlimited' }, { limit: 'offlineChapters', route: 'SardStorage' }),

  /* ------------------------------------------------------- التحفيز */
  'motivation.achievements': f('free', 'motivation', 'medal-outline', { ar: 'الإنجازات والشارات', en: 'Achievements & badges' }, { ar: 'أكثر من ٣٠ شارة للقراءة والسلاسل والتظليل والتنظيم', en: '30+ badges for reading, streaks, highlights and organising' }, { route: 'SardAchievements' }),
  'motivation.dailyChallenge': f('free', 'motivation', 'flag-checkered', { ar: 'تحدي اليوم', en: 'Daily challenge' }, { ar: 'تحدٍّ جديد كل يوم يناسب مستواك', en: 'A fresh challenge every day that fits your level' }, { route: 'SardAchievements' }),
  'motivation.xpLevels': f('free', 'motivation', 'chevron-triple-up', { ar: 'المستوى والخبرة', en: 'Reader level & XP' }, { ar: 'نقاط خبرة من دقائق القراءة والفصول والإنجازات', en: 'XP from minutes, chapters and achievements' }, { route: 'SardAchievements' }),
  'motivation.monthlyWrap': f('free', 'motivation', 'calendar-month-outline', { ar: 'ملخص الشهر', en: 'Monthly wrap-up' }, { ar: 'دقائقك وفصولك وأكثر رواياتك قراءة وأفضل يوم في الشهر', en: 'Your minutes, chapters, top novels and best day of the month' }, { route: 'SardWrap' }),
  'motivation.yearlyWrap': f('plus', 'motivation', 'calendar-star', { ar: 'ملخص السنة', en: 'Yearly wrap-up' }, { ar: 'ملخص كامل للسنة مع المقارنة بالشهور', en: 'A full year summary with month-by-month comparison' }, { route: 'SardWrap' }),
  'motivation.wrapShareCard': f('pro', 'motivation', 'card-account-details-star-outline', { ar: 'بطاقة مشاركة الملخص', en: 'Wrap-up share card' }, { ar: 'بطاقة صورة جميلة لملخصك تشاركها', en: 'A beautiful image card of your wrap-up to share' }, { route: 'SardWrap' }),
  'motivation.wrapArchive': f('legend', 'motivation', 'archive-star-outline', { ar: 'أرشيف الملخصات', en: 'Wrap-up archive' }, { ar: 'تصفح كل الشهور والسنوات السابقة', en: 'Browse every past month and year' }, { route: 'SardWrap' }),
  'motivation.quoteOfDay': f('free', 'motivation', 'format-quote-open', { ar: 'اقتباس اليوم', en: 'Quote of the day' }, { ar: 'بطاقة في المكتبة باقتباس من تظليلاتك كل يوم', en: 'A daily card in the library with a quote from your highlights' }),
  'motivation.customChallenges': f('plus', 'motivation', 'target', { ar: 'تحدياتك الخاصة', en: 'Personal challenges' }, { ar: 'تحدٍّ بهدف ومدة: فصول أو دقائق أو روايات', en: 'Goal + deadline challenges: chapters, minutes or novels' }, { limit: 'customChallenges', route: 'SardAchievements' }),
  'motivation.streakFreeze': f('pro', 'motivation', 'snowflake', { ar: 'تجميد السلسلة', en: 'Streak freeze' }, { ar: 'تحمي سلسلة القراءة يومًا فاتك؛ تكسب تجميدًا كل ٧ أيام', en: 'Protects your streak for a missed day; earn one every 7 days' }, { limit: 'streakFreezes', route: 'SardAchievements' }),

  /* ------------------------------------------------------- التخصيص */
  'custom.premiumThemes': f('plus', 'custom', 'palette-swatch-variant', { ar: 'ثيمات مميزة', en: 'Premium themes' }, { ar: 'ثمانية ثيمات قراءة مدروسة الألوان', en: 'Eight carefully tuned reading themes' }),
  'custom.exclusiveThemes': f('legend', 'custom', 'palette-advanced', { ar: 'ثيمات حصرية', en: 'Exclusive themes' }, { ar: 'ثيمات أسطورة الحصرية بخلفيات متدرجة', en: 'Legend-only gradient themes' }),
  'custom.paperTextures': f('plus', 'custom', 'texture-box', { ar: 'خامات الورق', en: 'Paper textures' }, { ar: 'خلفية ورق قديم أو كتان أو رَقّ خفيفة', en: 'Subtle aged-paper, linen or parchment backgrounds' }),
  'custom.sceneOrnaments': f('free', 'custom', 'flower-outline', { ar: 'زخارف فواصل المشاهد', en: 'Scene-break ornaments' }, { ar: 'تحويل *** و ـــ إلى زخرفة عربية أنيقة', en: 'Turns *** and ---- into an elegant ornament' }),
  'custom.dropCap': f('pro', 'custom', 'format-letter-case', { ar: 'الحرف الأول المزخرف', en: 'Decorative first letter' }, { ar: 'أول حرف في الفصل كبير وملوّن كالكتب', en: 'A large coloured first letter like printed books' }),
  'custom.progressBar': f('free', 'custom', 'progress-check', { ar: 'شريط تقدّم الفصل', en: 'Chapter progress bar' }, { ar: 'شريط رفيع أعلى القارئ يوضح موضعك', en: 'A thin bar at the top showing where you are' }),
  'custom.memberBadge': f('plus', 'custom', 'shield-star-outline', { ar: 'شارة العضوية', en: 'Membership badge' }, { ar: 'إطار فضي أو ذهبي أو أسطوري متحرك في صفحة المزيد', en: 'Silver, gold or animated legend frame on the More page' }, { route: 'SardMembership' }),

  /* --------------------------------------------------- الذكاء المحلي */
  'localAi.summary': f('free', 'localAi', 'text-short', { ar: 'ملخص محلي للفصل', en: 'On-device chapter summary' }, { ar: 'أهم الجمل في الفصل بلا إنترنت ولا مفتاح', en: 'Key sentences of a chapter, offline, no key' }, { route: 'SardLocalAi' }),
  'localAi.keywords': f('free', 'localAi', 'key-outline', { ar: 'الكلمات المفتاحية', en: 'Keywords' }, { ar: 'أكثر الكلمات دلالة في الفصل', en: 'The most telling words of a chapter' }, { route: 'SardLocalAi' }),
  'localAi.characters': f('plus', 'localAi', 'account-group-outline', { ar: 'من في الفصل؟', en: "Who's in this chapter" }, { ar: 'استخراج الأسماء المتكررة وعدد ظهورها محليًا', en: 'Extracts recurring names and how often they appear' }, { route: 'SardLocalAi' }),
  'localAi.search': f('free', 'localAi', 'text-search', { ar: 'بحث داخل الرواية', en: 'Search inside a novel' }, { ar: 'بحث نصي كامل في الفصول المنزّلة مع المقطع', en: 'Full-text search across downloaded chapters with snippets' }, { route: 'SardLocalAi' }),
  'localAi.recap': f('plus', 'localAi', 'history', { ar: 'ما سبق (محلي)', en: 'Previously on (offline)' }, { ar: 'ملخص آخر الفصول المقروءة بلا إنترنت', en: 'Recap of your last read chapters, offline' }, { route: 'SardLocalAi' }),
  'localAi.quiz': f('pro', 'localAi', 'help-circle-outline', { ar: 'اختبر فهمك', en: 'Comprehension quiz' }, { ar: 'أسئلة إكمال فراغ تُولَّد من الفصل', en: 'Fill-in-the-blank questions generated from the chapter' }, { route: 'SardLocalAi' }),
  'localAi.readingLevel': f('free', 'localAi', 'chart-bell-curve', { ar: 'مستوى صعوبة النص', en: 'Text difficulty' }, { ar: 'طول الجمل وتنوع المفردات وتقدير الصعوبة', en: 'Sentence length, vocabulary richness and difficulty' }, { route: 'SardLocalAi' }),

  /* ------------------------------------------------------- الخصوصية */
  'privacy.appLock': f('free', 'privacy', 'fingerprint', { ar: 'قفل التطبيق', en: 'App lock' }, { ar: 'بصمة أو رمز PIN عند الفتح وبعد الخروج بمدة تحددها', en: 'Biometric or PIN on open and after a timeout' }, { route: 'SardPrivacy' }),
  'privacy.hideRecents': f('free', 'privacy', 'eye-off-outline', { ar: 'إخفاء من التطبيقات الأخيرة', en: 'Hide in recents' }, { ar: 'يمنع لقطات الشاشة ويخفي المحتوى في قائمة التطبيقات الأخيرة', en: 'Blocks screenshots and hides content in recent apps' }, { route: 'SardPrivacy' }),
  'privacy.hiddenShelf': f('plus', 'privacy', 'archive-lock-outline', { ar: 'الرف المخفي', en: 'Hidden shelf' }, { ar: 'روايات لا تظهر في المكتبة إلا بعد فتح القفل', en: 'Novels that only appear after unlocking' }, { route: 'SardPrivacy' }),
  'privacy.encryptedBackup': f('plus', 'privacy', 'file-lock-outline', { ar: 'نسخ احتياطي مشفّر', en: 'Encrypted backup' }, { ar: 'تصدير واستيراد بيانات سَرد بكلمة مرور (AES-256-GCM)', en: 'Export/import Sard data with a password (AES-256-GCM)' }, { route: 'SardBackupTools' }),
  'privacy.clearTraces': f('free', 'privacy', 'eraser', { ar: 'مسح الآثار', en: 'Clear traces' }, { ar: 'مسح السجل وروابط وضع القراءة الأخيرة بلمسة', en: 'Clear history and recent reader-mode links in one tap' }, { route: 'SardPrivacy' }),

  /* ------------------------------------------------------- الأدوات */
  'tools.sardBackup': f('free', 'tools', 'backup-restore', { ar: 'نسخة بيانات سَرد', en: 'Sard data backup' }, { ar: 'ملف واحد بالعلامات والمفردات والوسوم والإعدادات والإنجازات', en: 'One file with bookmarks, vocabulary, tags, settings and badges' }, { route: 'SardBackupTools' }),
  'tools.autoBackup': f('plus', 'tools', 'cloud-sync-outline', { ar: 'نسخ تلقائي', en: 'Auto backup' }, { ar: 'نسخة تلقائية لبيانات سَرد في مجلد التطبيق كل يوم أو أسبوع', en: 'Automatic daily or weekly copy of Sard data' }, { route: 'SardBackupTools' }),
  'tools.exportNotes': f('free', 'tools', 'file-document-outline', { ar: 'تصدير الملاحظات', en: 'Export notes' }, { ar: 'العلامات والمفردات والتقييمات كنص Markdown للمشاركة', en: 'Bookmarks, vocabulary and ratings as Markdown' }, { route: 'SardBackupTools' }),
  'tools.diagnostics': f('free', 'tools', 'stethoscope', { ar: 'التشخيص الذاتي', en: 'Self-diagnostics' }, { ar: 'فحص قاعدة البيانات والتخزين والإضافات وتقرير يُنسخ', en: 'Checks database, storage, plugins; copyable report' }, { route: 'SardDiagnostics' }),
  'tools.changelog': f('free', 'tools', 'newspaper-variant-outline', { ar: 'ما الجديد', en: "What's new" }, { ar: 'سجل تغييرات الإصدار داخل التطبيق', en: 'In-app release notes' }, { route: 'SardChangelog' }),
  'tools.featureDirectory': f('free', 'tools', 'view-grid-plus-outline', { ar: 'دليل المميزات', en: 'Feature directory' }, { ar: 'كل مميزات سَرد مع البحث والمستوى المطلوب', en: 'Every Sard feature with search and required tier' }, { route: 'SardFeatures' }),
  'tools.resetSettings': f('free', 'tools', 'restore', { ar: 'إعادة ضبط انتقائية', en: 'Selective reset' }, { ar: 'أرجع إعدادات قسم واحد للافتراضي دون لمس البيانات', en: 'Reset one settings area without touching data' }, { route: 'SardDiagnostics' }),

  /* --------------------------------------------- مزايا العضوية الحالية */
  'export.fullNovel': f('plus', 'premium', 'file-export-outline', { ar: 'تصدير رواية/مجلد/مدى', en: 'Export novel / volume / range' }, { ar: 'المجاني يصدّر فصلًا واحدًا؛ بلس يصدّر الرواية كاملة أو مجلدًا أو مدى فصول', en: 'Free exports one chapter; Plus exports a whole novel, volume or range' }, { limit: 'exportChapters' }),
  'export.templates': f('pro', 'premium', 'file-image-outline', { ar: 'قوالب التصدير وغلاف مخصص', en: 'Export templates & custom cover' }, { ar: 'ورق بني أو داكن وغلاف من صورة تختارها', en: 'Sepia or dark paper and a cover from your own image' }),
  'export.batch': f('legend', 'premium', 'layers-triple-outline', { ar: 'دفعات تصدير بالخلفية', en: 'Background export batches' }, { ar: 'أكثر من مهمة تصدير في الطابور في الوقت نفسه', en: 'Several export jobs queued at once' }, { limit: 'exportJobs' }),
  'ai.cloud': f('free', 'premium', 'creation', { ar: 'حصة الذكاء الاصطناعي اليومية', en: 'Daily AI quota' }, { ar: 'بمفتاحك: مجاني ٥، بلس ٥٠، برو ٢٠٠، أسطورة بلا حد يوميًا', en: 'Your key: Free 5, Plus 50, Pro 200, Legend unlimited per day' }, { limit: 'aiDaily', route: 'SardAiSettings' }),
  'agents.basic': f('free', 'premium', 'robot-outline', { ar: 'وكيلان مجانًا', en: 'Two free agents' }, { ar: 'الرفوف الذكية والترشيحات متاحة للجميع', en: 'Smart shelves and recommendations for everyone' }, { route: 'SardAgents' }),
  'agents.all': f('plus', 'premium', 'robot-happy-outline', { ar: 'كل الوكلاء', en: 'All agents' }, { ar: 'محادثة الوكيل ومراقب الفصول والمكتبي', en: 'Agent chat, chapter watcher and librarian' }, { route: 'SardAgents' }),
  'agents.schedule': f('pro', 'premium', 'calendar-sync-outline', { ar: 'جدولة الوكلاء', en: 'Agent scheduling' }, { ar: 'تشغيل تلقائي يومي أو أسبوعي للمراقب والترشيحات وتنظيم المكتبة', en: 'Daily or weekly automatic runs of watcher, picks and tidy-up' }, { route: 'SardAgents' }),
  'agents.custom': f('legend', 'premium', 'robot-love-outline', { ar: 'وكلاء مخصصون', en: 'Custom agents' }, { ar: 'أنشئ وكيلًا باسمك من أوامر محفوظة وشغّله بلمسة', en: 'Create named agents from saved commands and run them in a tap' }, { limit: 'customAgents', route: 'SardAgents' }),
} satisfies Record<string, FeatureDef>;

export type FeatureKey = keyof typeof FEATURES;

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export const getFeature = (key: FeatureKey): FeatureDef => FEATURES[key];

export const featuresByCategory = (): { category: FeatureCategory; items: (FeatureDef & { key: FeatureKey })[] }[] =>
  CATEGORY_ORDER.map(category => ({
    category,
    items: FEATURE_KEYS.filter(k => FEATURES[k].category === category).map(k => ({ key: k, ...FEATURES[k] })),
  }));

/** Matrix rows for the comparison table (`Infinity` → "بلا حد"). */
export const featuresForTier = (tier: Tier) =>
  FEATURE_KEYS.filter(k => {
    const order = ['free', 'plus', 'pro', 'legend'];
    return order.indexOf(FEATURES[k].tier) <= order.indexOf(tier);
  });
