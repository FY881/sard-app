import { Font, readerFonts } from '@utils/constants/readerConstants';

/**
 * Bundled Arabic reader fonts (all SIL Open Font License 1.1, from
 * github.com/google/fonts `ofl/*`; license texts ship in
 * assets/reader/fonts/licenses). Files live in assets/reader/fonts and are
 * copied to android_asset/fonts by plugins/withReaderAssets.js, which also
 * makes the regular face available to React Native `fontFamily` by name.
 *
 * `fontFamily` is the file name of the regular face, which is what the
 * LNReader core.js loads. `faces` lists every extra weight/style file so the
 * WebView can use real bold/light glyphs instead of synthesising them.
 * Variable fonts carry every weight in one file (`variable: true`).
 */
export interface ArabicFont extends Font {
  style: 'naskh' | 'sans' | 'kufi' | 'display';
  description: string;
  variable?: boolean;
  /** weight range for variable fonts */
  weightRange?: [number, number];
  faces?: { file: string; weight: number; italic?: boolean }[];
  /** Comfortable default line height for this face. */
  lineHeight?: number;
}

export const arabicReaderFonts: ArabicFont[] = [
  {
    fontFamily: 'amiri',
    name: 'أميري',
    style: 'naskh',
    description: 'نسخ كلاسيكي بطابع الكتب المطبوعة',
    lineHeight: 1.9,
    faces: [
      { file: 'amiri-bold', weight: 700 },
      { file: 'amiri-italic', weight: 400, italic: true },
      { file: 'amiri-bold-italic', weight: 700, italic: true },
    ],
  },
  {
    fontFamily: 'noto-naskh-arabic',
    name: 'نوتو نسخ',
    style: 'naskh',
    description: 'نسخ واضح مريح للقراءة الطويلة',
    variable: true,
    weightRange: [400, 700],
    lineHeight: 1.8,
  },
  {
    fontFamily: 'scheherazade-new',
    name: 'شهرزاد',
    style: 'naskh',
    description: 'نسخ تقليدي بحركات واضحة',
    lineHeight: 2,
    faces: [
      { file: 'scheherazade-new-medium', weight: 500 },
      { file: 'scheherazade-new-semibold', weight: 600 },
      { file: 'scheherazade-new-bold', weight: 700 },
    ],
  },
  {
    fontFamily: 'markazi-text',
    name: 'مركزي',
    style: 'naskh',
    description: 'نسخ صحفي أنيق',
    variable: true,
    weightRange: [400, 700],
    lineHeight: 1.7,
  },
  {
    fontFamily: 'ibm-plex-sans-arabic',
    name: 'IBM Plex عربي',
    style: 'sans',
    description: 'حديث متوازن بسبعة أوزان',
    lineHeight: 1.8,
    faces: [
      { file: 'ibm-plex-sans-arabic-thin', weight: 100 },
      { file: 'ibm-plex-sans-arabic-extralight', weight: 200 },
      { file: 'ibm-plex-sans-arabic-light', weight: 300 },
      { file: 'ibm-plex-sans-arabic-medium', weight: 500 },
      { file: 'ibm-plex-sans-arabic-semibold', weight: 600 },
      { file: 'ibm-plex-sans-arabic-bold', weight: 700 },
    ],
  },
  {
    fontFamily: 'noto-sans-arabic',
    name: 'نوتو سانس عربي',
    style: 'sans',
    description: 'بسيط وواضح على الشاشات الصغيرة',
    variable: true,
    weightRange: [100, 900],
    lineHeight: 1.75,
  },
  {
    fontFamily: 'cairo',
    name: 'القاهرة',
    style: 'sans',
    description: 'عصري عريض',
    variable: true,
    weightRange: [200, 1000],
    lineHeight: 1.7,
  },
  {
    fontFamily: 'tajawal',
    name: 'تجوّل',
    style: 'sans',
    description: 'خفيف بسبعة أوزان',
    lineHeight: 1.75,
    faces: [
      { file: 'tajawal-extralight', weight: 200 },
      { file: 'tajawal-light', weight: 300 },
      { file: 'tajawal-medium', weight: 500 },
      { file: 'tajawal-bold', weight: 700 },
      { file: 'tajawal-extrabold', weight: 800 },
      { file: 'tajawal-black', weight: 900 },
    ],
  },
  {
    fontFamily: 'almarai',
    name: 'المراعي',
    style: 'sans',
    description: 'هادئ ومستدير',
    lineHeight: 1.75,
    faces: [
      { file: 'almarai-light', weight: 300 },
      { file: 'almarai-bold', weight: 700 },
      { file: 'almarai-extrabold', weight: 800 },
    ],
  },
  {
    fontFamily: 'noto-kufi-arabic',
    name: 'نوتو كوفي',
    style: 'kufi',
    description: 'كوفي هندسي للعناوين والقراءة',
    variable: true,
    weightRange: [100, 900],
    lineHeight: 1.8,
  },
  {
    fontFamily: 'reem-kufi',
    name: 'ريم كوفي',
    style: 'display',
    description: 'كوفي فني مميز',
    variable: true,
    weightRange: [400, 700],
    lineHeight: 1.8,
  },
];

export const ARABIC_FONT_STYLE_LABELS: Record<ArabicFont['style'], string> = {
  naskh: 'نسخ',
  sans: 'حديث',
  kufi: 'كوفي',
  display: 'زخرفي',
};

/** Arabic fonts first (Sard is Arabic-first), then the LNReader originals. */
export const allReaderFonts: Font[] = [
  readerFonts[0],
  ...arabicReaderFonts,
  ...readerFonts.slice(1),
];

export const findArabicFont = (fontFamily?: string) =>
  arabicReaderFonts.find(f => f.fontFamily === fontFamily);

export const isArabicFont = (fontFamily?: string) =>
  !!findArabicFont(fontFamily);

const FONT_BASE = 'file:///android_asset/fonts/';

/**
 * Extra @font-face rules (all weights/styles) for the selected font. The
 * regular face is declared by LNReader's core.js; declaring it again with an
 * explicit weight range lets variable fonts render every weight.
 */
export const buildFontFaceCss = (fontFamily?: string): string => {
  const font = findArabicFont(fontFamily);
  if (!font) return '';
  const fam = font.fontFamily;
  const rules: string[] = [];
  if (font.variable && font.weightRange) {
    rules.push(
      `@font-face{font-family:'${fam}';src:url("${FONT_BASE}${fam}.ttf");font-weight:${font.weightRange[0]} ${font.weightRange[1]};font-style:normal;font-display:block;}`,
    );
  } else {
    rules.push(
      `@font-face{font-family:'${fam}';src:url("${FONT_BASE}${fam}.ttf");font-weight:400;font-style:normal;font-display:block;}`,
    );
  }
  for (const face of font.faces ?? []) {
    rules.push(
      `@font-face{font-family:'${fam}';src:url("${FONT_BASE}${face.file}.ttf");font-weight:${face.weight};font-style:${face.italic ? 'italic' : 'normal'};font-display:block;}`,
    );
  }
  return rules.join('\n');
};

/** Weights that the font actually has glyphs for (for the weight picker). */
export const availableWeights = (fontFamily?: string): number[] => {
  const font = findArabicFont(fontFamily);
  if (!font) return [400, 700];
  if (font.variable && font.weightRange) {
    const [lo, hi] = font.weightRange;
    return [100, 200, 300, 400, 500, 600, 700, 800, 900].filter(
      w => w >= lo && w <= hi,
    );
  }
  const set = new Set([400, ...(font.faces ?? []).filter(f => !f.italic).map(f => f.weight)]);
  return [...set].sort((a, b) => a - b);
};
