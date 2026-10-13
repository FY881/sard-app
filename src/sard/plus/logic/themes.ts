/** Premium / exclusive reader themes, paper textures, ornaments, drop cap. */
import type { Tier } from '../../membership/tiers';
import type { L10n } from '../../membership/tiers';

export interface SardReaderTheme {
  id: string;
  name: L10n;
  tier: Tier;
  backgroundColor: string;
  textColor: string;
  /** Optional CSS background (gradients for Legend themes). */
  backgroundCss?: string;
  accent: string;
}

export const SARD_THEMES: SardReaderTheme[] = [
  { id: 'qahwa', name: { ar: 'قهوة', en: 'Coffee' }, tier: 'plus', backgroundColor: '#2B211C', textColor: '#E8D9C5', accent: '#C08A5B' },
  { id: 'nakhla', name: { ar: 'نخلة', en: 'Palm' }, tier: 'plus', backgroundColor: '#1F2A22', textColor: '#D6E4CF', accent: '#8DBA7A' },
  { id: 'bahr', name: { ar: 'بحر', en: 'Sea' }, tier: 'plus', backgroundColor: '#0F2230', textColor: '#CFE3EE', accent: '#5FA8D3' },
  { id: 'rimal', name: { ar: 'رمال', en: 'Dunes' }, tier: 'plus', backgroundColor: '#F3E6CC', textColor: '#3E2F1C', accent: '#B8863B' },
  { id: 'warda', name: { ar: 'وردة', en: 'Rose' }, tier: 'plus', backgroundColor: '#FBEFF1', textColor: '#4A2730', accent: '#C2577A' },
  { id: 'hibr', name: { ar: 'حبر', en: 'Ink' }, tier: 'plus', backgroundColor: '#000000', textColor: '#B9B9B9', accent: '#7C8DFF' },
  { id: 'zaytun', name: { ar: 'زيتون', en: 'Olive' }, tier: 'plus', backgroundColor: '#E9EBD8', textColor: '#2F3420', accent: '#6E7B32' },
  { id: 'lail', name: { ar: 'ليل', en: 'Night' }, tier: 'plus', backgroundColor: '#14161F', textColor: '#C7CBE0', accent: '#9A8CF0' },
  { id: 'andalus', name: { ar: 'الأندلس', en: 'Andalus' }, tier: 'legend', backgroundColor: '#1B1A2E', textColor: '#EADFC8', accent: '#E0B15C', backgroundCss: 'linear-gradient(160deg,#1B1A2E 0%,#2A2346 55%,#3A2A3F 100%)' },
  { id: 'shafaq', name: { ar: 'شفق', en: 'Twilight' }, tier: 'legend', backgroundColor: '#2A1B24', textColor: '#F3E4E1', accent: '#F08A5D', backgroundCss: 'linear-gradient(170deg,#2A1B24 0%,#3B2230 60%,#4A2A2A 100%)' },
  { id: 'zumurrud', name: { ar: 'زمرّد', en: 'Emerald' }, tier: 'legend', backgroundColor: '#0E2621', textColor: '#DDEFE7', accent: '#47C49A', backgroundCss: 'linear-gradient(165deg,#0E2621 0%,#123A30 60%,#0F2E35 100%)' },
];

export type PaperTexture = 'none' | 'aged' | 'linen' | 'parchment';
export const PAPER_TEXTURES: { id: PaperTexture; name: L10n }[] = [
  { id: 'none', name: { ar: 'بدون', en: 'None' } },
  { id: 'aged', name: { ar: 'ورق قديم', en: 'Aged paper' } },
  { id: 'linen', name: { ar: 'كتان', en: 'Linen' } },
  { id: 'parchment', name: { ar: 'رَقّ', en: 'Parchment' } },
];

/** Pure-CSS textures (no image assets), layered over the theme colour. */
export const textureCss = (t: PaperTexture): string => {
  switch (t) {
    case 'aged':
      return 'radial-gradient(ellipse at 20% 10%,rgba(255,240,200,.10),transparent 60%),radial-gradient(ellipse at 80% 90%,rgba(120,80,30,.12),transparent 55%)';
    case 'linen':
      return 'repeating-linear-gradient(0deg,rgba(0,0,0,.025) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(0,0,0,.02) 0 1px,transparent 1px 3px)';
    case 'parchment':
      return 'radial-gradient(ellipse at center,rgba(255,235,190,.08) 0%,rgba(140,100,40,.16) 100%)';
    default:
      return '';
  }
};

export const ORNAMENT = '۞';
const BREAK_LINE = /^\s*(?:[*＊✱]\s*){3,}\s*$|^\s*(?:[-ـ—–_]\s*){4,}\s*$|^\s*(?:[~#=]\s*){3,}\s*$|^\s*(?:o\s*){3,}\s*$/i;

/** Replaces scene-break paragraphs (*** / ---- / ـــ) with a centred ornament. */
export const ornamentizeHtml = (html: string): string =>
  (html || '').replace(/<(p|div|center)([^>]*)>([\s\S]*?)<\/\1>/gi, (whole, tag, attrs, inner) => {
    const text = String(inner).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
    if (!BREAK_LINE.test(text)) return whole;
    return `<${tag}${attrs} class="sard-ornament" aria-hidden="true">${ORNAMENT}&nbsp;&nbsp;${ORNAMENT}&nbsp;&nbsp;${ORNAMENT}</${tag}>`;
  }).replace(/(^|<br\s*\/?>)\s*(?:\*\s*){3,}\s*(?=<br|$)/gi, `$1<span class="sard-ornament">${ORNAMENT}&nbsp;&nbsp;${ORNAMENT}&nbsp;&nbsp;${ORNAMENT}</span>`);

export interface LookSettings {
  ornaments: boolean;
  dropCap: boolean;
  progressBar: boolean;
  texture: PaperTexture;
  themeId?: string;
}

/** CSS injected into the reader for the Sard look features. */
export const buildLookCss = (s: LookSettings, theme?: SardReaderTheme): string => {
  const parts: string[] = [];
  parts.push('.sard-ornament{display:block;text-align:center!important;opacity:.7;letter-spacing:.2em;margin:1.4em 0!important;}');
  if (s.dropCap) {
    parts.push(
      '#LNReader-chapter > p:first-of-type::first-letter,#LNReader-chapter p.sard-first::first-letter{font-size:3.1em;line-height:.9;float:inline-start;margin-inline-end:.08em;margin-top:.05em;color:var(--sard-accent,currentColor);font-weight:700;}',
    );
  }
  const tex = textureCss(s.texture);
  const bg = [tex, theme?.backgroundCss].filter(Boolean).join(',');
  if (bg) parts.push(`body{background-image:${bg}!important;background-attachment:fixed!important;}`);
  if (theme) parts.push(`:root{--sard-accent:${theme.accent};}`);
  if (s.progressBar) {
    parts.push('#sard-progress{position:fixed;top:0;inset-inline-start:0;height:3px;width:0;background:var(--sard-accent,var(--theme-primary));z-index:9;transition:width .2s;}');
  }
  return parts.join('\n');
};
