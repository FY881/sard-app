import {
  cancelSleep,
  consumeChapterEnd,
  extendSleep,
  formatRemaining,
  getSleepState,
  isSleepExpired,
  nextStateOnChapterEnd,
  startSleepChapters,
  startSleepMinutes,
} from '../ttsSleep';
import { isArabicVoice, pickArabicVoice, sortArabicVoices } from '../voices';
import { groupHighlightsByNovel, highlightsToText } from '../highlightsLogic';
import { buildQuoteShareText, quoteFontSize, truncateQuote } from '../quoteCard';
import { requestHighlightJump, takeHighlightJump } from '../jump';
import {
  allReaderFonts,
  arabicReaderFonts,
  availableWeights,
  buildFontFaceCss,
  findArabicFont,
} from '../fonts';
import { defaultSardReaderSettings, sanitizeSardSettings } from '../settings';

jest.mock('react-native-mmkv', () => ({ useMMKVObject: () => [undefined, jest.fn()] }), {
  virtual: true,
});
jest.mock('@utils/mmkv/mmkv', () => ({ getMMKVObject: () => undefined, setMMKVObject: jest.fn() }), {
  virtual: true,
});

describe('TTS sleep timer', () => {
  afterEach(() => cancelSleep());

  it('expires after the chosen minutes', () => {
    startSleepMinutes(15, true, 1000);
    const s = getSleepState();
    expect(s.mode).toBe('minutes');
    expect(isSleepExpired(s, 1000 + 14 * 60000)).toBe(false);
    expect(isSleepExpired(s, 1000 + 15 * 60000)).toBe(true);
  });

  it('extends a running timer from its end, or starts one', () => {
    startSleepMinutes(10, false, 0);
    extendSleep(10, 60000);
    const s = getSleepState();
    expect(s.mode === 'minutes' && s.endsAt).toBe(20 * 60000);
    cancelSleep();
    extendSleep(5, 0);
    expect(getSleepState()).toMatchObject({ mode: 'minutes', minutes: 5 });
  });

  it('stops after N chapters', () => {
    startSleepChapters(2);
    expect(consumeChapterEnd()).toBe(true);
    expect(getSleepState()).toEqual({ mode: 'chapters', chaptersLeft: 1 });
    expect(consumeChapterEnd()).toBe(false);
    expect(getSleepState()).toEqual({ mode: 'off' });
    expect(consumeChapterEnd()).toBe(true);
  });

  it('chapter end is pure for non-chapter modes', () => {
    const s = { mode: 'off' } as const;
    expect(nextStateOnChapterEnd(s)).toEqual({ continuePlayback: true, next: s });
  });

  it('formats remaining time', () => {
    expect(formatRemaining(65000)).toBe('01:05');
    expect(formatRemaining(3600000 + 61000)).toBe('1:01:01');
    expect(formatRemaining(-5)).toBe('00:00');
  });
});

describe('Arabic voices', () => {
  const voices = [
    { identifier: 'en-us-x-sfg-local', name: 'English', language: 'en-US' },
    { identifier: 'ar-xa-x-arz-network', name: 'Arabic net', language: 'ar-XA' },
    { identifier: 'ar-xa-x-arz-local', name: 'Arabic local', language: 'ar-XA' },
    { identifier: 'ar-eg-x-1', name: 'Egypt', language: 'ar-EG' },
    { identifier: 'arm-1', name: 'Armenian', language: 'hy-AM' },
  ];

  it('detects Arabic voices only', () => {
    expect(voices.filter(isArabicVoice).map(v => v.name)).toEqual([
      'Arabic net',
      'Arabic local',
      'Egypt',
    ]);
  });

  it('prefers MSA offline voices, honouring a preferred region', () => {
    expect(pickArabicVoice(voices)?.name).toBe('Arabic local');
    expect(sortArabicVoices(voices).map(v => v.name)).toEqual(['Arabic local', 'Arabic net', 'Egypt']);
    expect(pickArabicVoice(voices, 'eg')?.name).toBe('Egypt');
    expect(pickArabicVoice([voices[0]])).toBeUndefined();
  });
});

describe('highlights list helpers', () => {
  const rows = [
    { id: 1, novelId: 7, novelName: 'رواية أ', chapterId: 2, chapterName: 'ف2', startOffset: 5, text: 'نص ثانٍ', note: null, createdAt: 3 },
    { id: 2, novelId: 9, novelName: null, chapterId: 1, chapterName: 'ف1', startOffset: 0, text: 'آخر', note: 'مهم', createdAt: 2 },
    { id: 3, novelId: 7, novelName: 'رواية أ', chapterId: 1, chapterName: 'ف1', startOffset: 9, text: ' نص أول ', note: ' فكرة ', createdAt: 1 },
  ];

  it('groups by novel preserving order', () => {
    const g = groupHighlightsByNovel(rows);
    expect(g.map(s => s.title)).toEqual(['رواية أ', 'بلا عنوان']);
    expect(g[0].data.map(r => r.id)).toEqual([1, 3]);
  });

  it('exports text sorted by chapter position', () => {
    const t = highlightsToText(rows);
    expect(t.indexOf('«نص أول»')).toBeLessThan(t.indexOf('«نص ثانٍ»'));
    expect(t).toContain('ملاحظة: فكرة');
    expect(t).toContain('📖 بلا عنوان');
  });
});

describe('quote card helpers', () => {
  it('shrinks font for long quotes and truncates', () => {
    expect(quoteFontSize(20)).toBeGreaterThan(quoteFontSize(500));
    expect(truncateQuote('a'.repeat(800)).length).toBe(701);
    expect(truncateQuote('  short  ')).toBe('short');
  });

  it('builds share text with source and note', () => {
    const t = buildQuoteShareText({ text: 'نص', novelName: 'رواية', chapterName: 'فصل', note: 'ملاحظتي' });
    expect(t).toContain('«نص»');
    expect(t).toContain('— رواية — فصل');
    expect(t).toContain('ملاحظة: ملاحظتي');
  });
});

describe('highlight jump', () => {
  it('is one-shot and chapter-scoped', () => {
    requestHighlightJump(5, 42);
    expect(takeHighlightJump(6)).toBeUndefined();
    expect(takeHighlightJump(5)).toBe(42);
    expect(takeHighlightJump(5)).toBeUndefined();
  });

  it('expires', () => {
    requestHighlightJump(5, 1);
    expect(takeHighlightJump(5, Date.now() + 5 * 60000)).toBeUndefined();
  });
});

describe('fonts', () => {
  it('lists Arabic fonts first after "Original"', () => {
    expect(allReaderFonts[0].fontFamily).toBe('');
    expect(allReaderFonts[1].fontFamily).toBe(arabicReaderFonts[0].fontFamily);
    expect(allReaderFonts.some(f => f.fontFamily === 'lora')).toBe(true);
  });

  it('builds @font-face rules for every weight', () => {
    const css = buildFontFaceCss('tajawal');
    expect(css.match(/@font-face/g)).toHaveLength(7);
    expect(css).toContain('tajawal-black.ttf');
    expect(css).toContain('font-weight:900');
    expect(buildFontFaceCss('cairo')).toContain('font-weight:200 1000');
    expect(buildFontFaceCss('lora')).toBe('');
  });

  it('reports available weights', () => {
    expect(availableWeights('amiri')).toEqual([400, 700]);
    expect(availableWeights('ibm-plex-sans-arabic')).toEqual([100, 200, 300, 400, 500, 600, 700]);
    expect(availableWeights('noto-naskh-arabic')).toEqual([400, 500, 600, 700]);
    expect(findArabicFont('reem-kufi')?.style).toBe('display');
  });

  it('every font file referenced is bundled', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const dir = path.join(__dirname, '../../../../assets/reader/fonts');
    for (const f of arabicReaderFonts) {
      expect(fs.existsSync(path.join(dir, `${f.fontFamily}.ttf`))).toBe(true);
      for (const face of f.faces ?? []) {
        expect(fs.existsSync(path.join(dir, `${face.file}.ttf`))).toBe(true);
      }
    }
  });
});

describe('settings sanitising', () => {
  it('clamps values and keeps null paragraph spacing', () => {
    const s = sanitizeSardSettings({
      focusLines: 99,
      autoScrollSpeed: -4,
      dailyGoalMinutes: Number.NaN,
      paragraphSpacing: null,
    });
    expect(s.focusLines).toBe(8);
    expect(s.autoScrollSpeed).toBe(5);
    expect(s.dailyGoalMinutes).toBe(20);
    expect(s.paragraphSpacing).toBeNull();
    expect(sanitizeSardSettings({}).tashkeel).toBe(defaultSardReaderSettings.tashkeel);
  });
});
