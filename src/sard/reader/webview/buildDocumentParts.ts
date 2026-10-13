import { TASHKEEL_CHARS } from '../arabic';
import { arabicReaderFonts, buildFontFaceCss } from '../fonts';
import { HIGHLIGHT_COLORS, type SardReaderSettings } from '../settings';
import { SARD_READER_STRINGS as S } from '../strings';
import { SARD_READER_SCRIPT } from './sardReaderScript';

/** Same character class as tashkeel removal minus the shadda (U+0651). */
export const TASHKEEL_NO_SHADDA = TASHKEEL_CHARS.replace(
  '\u064B-\u0652',
  '\u064B-\u0650\u0652',
);

let fontFacesCache: Record<string, string> | null = null;
export const getFontFaces = () => {
  if (!fontFacesCache) {
    fontFacesCache = {};
    for (const f of arabicReaderFonts) {
      fontFacesCache[f.fontFamily] = buildFontFaceCss(f.fontFamily);
    }
  }
  return fontFacesCache;
};

/** `<style>` for `<head>`: every weight of every bundled Arabic font. */
export const buildSardHeadStyle = () =>
  `<style id="sard-font-faces">${Object.values(getFontFaces()).join('\n')}</style>`;

/** `<script>`s for the end of `<body>`, after LNReader's own scripts. */
export const buildSardBodyScript = (
  settings: SardReaderSettings,
  sourceDir: 'rtl' | 'ltr',
  scrollToHighlight?: number,
) => {
  const init = {
    settings,
    sourceDir,
    tashkeelChars: TASHKEEL_CHARS,
    tashkeelCharsNoShadda: TASHKEEL_NO_SHADDA,
    fontFaces: getFontFaces(),
    highlightColors: HIGHLIGHT_COLORS,
    highlights: [],
    scrollToHighlight,
    strings: {
      highlight: S.highlight,
      note: S.note,
      copy: S.copy,
      share: S.share,
      vocab: 'مفردة',
      slower: S.slower,
      faster: S.faster,
      pause: S.pause,
    },
  };
  // `</script` inside JSON would end the tag early.
  const json = JSON.stringify(init).replace(/<\//g, '<\\/');
  return `<script id="sard-init">window.__SARD_INIT__ = ${json};</script>
<script id="sard-reader">${SARD_READER_SCRIPT}</script>`;
};

/** Fully-vowelled Arabic sample for the settings preview. */
export const ARABIC_PREVIEW_HTML = `<h2>الفصل الأول: بِدايةُ الرِّحْلة</h2>
<p>وَقَفَ الفارِسُ عَلى التَّلِّ يَتَأَمَّلُ المَدينةَ البَعيدةَ، وَقَدْ أَضاءَتْ قَناديلُها واحِدًا تِلْوَ الآخَرِ كَأَنَّها نُجومٌ هَبَطَتْ إلى الأَرْضِ.</p>
<p>قالَ لِرَفيقِهِ: «إِنَّ الطَّريقَ طَويلٌ، لكِنَّ مَنْ سارَ عَلى الدَّرْبِ وَصَلَ». ثُمَّ مَضى في الساعةِ ٩ مَساءً، بَعْدَ أَنْ قَطَعَ ١٢ مِيلًا في يَوْمِهِ الأَوَّلِ.</p>
<p>The rider looked back once, then smiled — the journey had only begun.</p>`;
