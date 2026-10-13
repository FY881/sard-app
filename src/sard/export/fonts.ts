/**
 * Arabic fonts available to the export engine. Files are bundled by
 * plugins/withReaderAssets.js from assets/reader/fonts into
 * file:///android_asset/fonts/<file>.ttf (the same place the reader loads
 * its fonts from), so the print WebView can always reach them.
 */

export interface ExportFont {
  id: string;
  name: string;
  /** Regular weight file (without .ttf). */
  file: string;
  /** Optional bold weight file (without .ttf). */
  boldFile?: string;
  kind: 'naskh' | 'sans' | 'kufi';
}

export const EXPORT_FONTS: ExportFont[] = [
  {
    id: 'amiri',
    name: 'أميري',
    file: 'amiri',
    boldFile: 'amiri-bold',
    kind: 'naskh',
  },
  {
    id: 'noto-naskh-arabic',
    name: 'نوتو نسخ',
    file: 'noto-naskh-arabic',
    kind: 'naskh',
  },
  {
    id: 'scheherazade-new',
    name: 'شهرزاد',
    file: 'scheherazade-new',
    boldFile: 'scheherazade-new-bold',
    kind: 'naskh',
  },
  { id: 'markazi-text', name: 'مركزي', file: 'markazi-text', kind: 'naskh' },
  {
    id: 'ibm-plex-sans-arabic',
    name: 'IBM Plex عربي',
    file: 'ibm-plex-sans-arabic',
    boldFile: 'ibm-plex-sans-arabic-bold',
    kind: 'sans',
  },
  {
    id: 'noto-sans-arabic',
    name: 'نوتو سانس',
    file: 'noto-sans-arabic',
    kind: 'sans',
  },
  { id: 'cairo', name: 'القاهرة', file: 'cairo', kind: 'sans' },
  {
    id: 'tajawal',
    name: 'تجوّل',
    file: 'tajawal',
    boldFile: 'tajawal-bold',
    kind: 'sans',
  },
  {
    id: 'almarai',
    name: 'المراعي',
    file: 'almarai',
    boldFile: 'almarai-bold',
    kind: 'sans',
  },
  {
    id: 'noto-kufi-arabic',
    name: 'نوتو كوفي',
    file: 'noto-kufi-arabic',
    kind: 'kufi',
  },
  { id: 'reem-kufi', name: 'ريم كوفي', file: 'reem-kufi', kind: 'kufi' },
];

export const DEFAULT_EXPORT_FONT = 'amiri';

export const FONT_ASSET_BASE = 'file:///android_asset/fonts';

export const getExportFont = (id?: string): ExportFont =>
  EXPORT_FONTS.find(font => font.id === id) ??
  EXPORT_FONTS.find(font => font.id === DEFAULT_EXPORT_FONT)!;

const FALLBACK_STACK = {
  naskh: "'Noto Naskh Arabic', 'Amiri', serif",
  sans: "'Noto Sans Arabic', sans-serif",
  kufi: "'Noto Kufi Arabic', sans-serif",
} as const;

export const fontFamilyStack = (font: ExportFont) =>
  `'${font.id}', ${FALLBACK_STACK[font.kind]}`;

/** @font-face rules for the chosen font (regular + bold when bundled). */
export const fontFaceCss = (font: ExportFont, base = FONT_ASSET_BASE) => {
  const rules = [
    `@font-face { font-family: '${font.id}'; font-weight: 400; font-style: normal; src: url("${base}/${font.file}.ttf") format("truetype"); }`,
  ];
  if (font.boldFile) {
    rules.push(
      `@font-face { font-family: '${font.id}'; font-weight: 700; font-style: normal; src: url("${base}/${font.boldFile}.ttf") format("truetype"); }`,
    );
  }
  return rules.join('\n');
};
