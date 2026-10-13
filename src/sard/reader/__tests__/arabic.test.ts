import {
  arabicRatio,
  convertDigits,
  convertDigitsInHtml,
  detectDirection,
  estimateReadingMinutes,
  hasTashkeel,
  htmlToPlainSample,
  isMostlyArabic,
  stripTashkeel,
  stripTashkeelFromHtml,
} from '../arabic';

describe('stripTashkeel', () => {
  const vowelled = 'وَقَفَ الفارِسُ عَلى التَّلِّ';

  it('removes all harakat in hide mode', () => {
    expect(stripTashkeel(vowelled, 'hide')).toBe('وقف الفارس على التل');
  });

  it('keeps shadda in keepShadda mode', () => {
    expect(stripTashkeel('التَّلِّ', 'keepShadda')).toBe('التّلّ');
  });

  it('is a no-op in show mode', () => {
    expect(stripTashkeel(vowelled, 'show')).toBe(vowelled);
  });

  it('removes tanween, sukun and superscript alef', () => {
    expect(stripTashkeel('كِتابٌ مُسْتَقْبَلًا هٰذا', 'hide')).toBe('كتاب مستقبلا هذا');
  });

  it('removes Quranic annotation marks', () => {
    expect(stripTashkeel('ٱلرَّحْمَٰنِۚ', 'hide')).toBe('ٱلرحمن');
  });

  it('keeps hamza/madda combining marks that are part of letters', () => {
    // ا + U+0653 (madda) and ا + U+0654 (hamza above) must survive
    const decomposed = 'ا\u0653 ا\u0654';
    expect(stripTashkeel(decomposed, 'hide')).toBe(decomposed);
  });

  it('optionally strips tatweel', () => {
    expect(stripTashkeel('جـــميل', 'show', true)).toBe('جميل');
    expect(stripTashkeel('جـــميل', 'show', false)).toBe('جـــميل');
  });

  it('leaves latin text untouched', () => {
    expect(stripTashkeel('Hello, world!', 'hide')).toBe('Hello, world!');
  });

  it('detects diacritics', () => {
    expect(hasTashkeel(vowelled)).toBe(true);
    expect(hasTashkeel('وقف الفارس')).toBe(false);
  });
});

describe('stripTashkeelFromHtml', () => {
  it('only touches text nodes', () => {
    const html = '<p title="عَلَم" class="x">مَرْحَبًا <b>بِكُمْ</b></p>';
    expect(stripTashkeelFromHtml(html)).toBe('<p title="عَلَم" class="x">مرحبا <b>بكم</b></p>');
  });

  it('skips script and style contents', () => {
    const html = '<script>var a="عَلَم";</script><p>عَلَم</p><style>.a{content:"عَلَم"}</style>';
    expect(stripTashkeelFromHtml(html)).toBe(
      '<script>var a="عَلَم";</script><p>علم</p><style>.a{content:"عَلَم"}</style>',
    );
  });

  it('returns input unchanged in show mode', () => {
    const html = '<p>عَلَم</p>';
    expect(stripTashkeelFromHtml(html, 'show')).toBe(html);
  });
});

describe('direction detection', () => {
  it('detects Arabic chapters as rtl', () => {
    expect(detectDirection('<p>كان يا ما كان في قديم الزمان</p>')).toBe('rtl');
  });

  it('detects English chapters as ltr', () => {
    expect(detectDirection('<p>Once upon a time in a land far away</p>')).toBe('ltr');
  });

  it('treats mostly-Arabic mixed text as rtl', () => {
    expect(detectDirection('<p>قال البطل: OK ثم مضى في طريقه الطويل نحو المدينة</p>')).toBe('rtl');
  });

  it('ignores markup and attributes when sniffing', () => {
    expect(
      detectDirection('<div class="english words here" data-x="lots of latin">نص عربي قصير</div>'),
    ).toBe('rtl');
  });

  it('falls back when there are no strong characters', () => {
    expect(detectDirection('<p>123 456 !!!</p>', 'rtl')).toBe('rtl');
    expect(detectDirection('<img src="a.png">', 'ltr')).toBe('ltr');
  });

  it('computes ratios', () => {
    expect(arabicRatio('abc')).toBe(0);
    expect(arabicRatio('عربي')).toBe(1);
    expect(isMostlyArabic('عربي abc')).toBe(true);
  });

  it('strips scripts from plain sample', () => {
    expect(htmlToPlainSample('<script>english()</script><p>نص</p>').trim()).toBe('نص');
  });
});

describe('digits', () => {
  it('converts western to Arabic-Indic and back', () => {
    expect(convertDigits('الفصل 12', 'arabicIndic')).toBe('الفصل ١٢');
    expect(convertDigits('الفصل ١٢', 'western')).toBe('الفصل 12');
    expect(convertDigits('۱۲۳', 'western')).toBe('123');
    expect(convertDigits('abc 1', 'default')).toBe('abc 1');
  });

  it('does not touch attributes in html', () => {
    expect(convertDigitsInHtml('<p data-n="12">12</p>', 'arabicIndic')).toBe('<p data-n="12">١٢</p>');
  });
});

describe('estimateReadingMinutes', () => {
  it('estimates using language-specific speed', () => {
    const arabic = `<p>${'كلمة '.repeat(320)}</p>`;
    expect(estimateReadingMinutes(arabic)).toBe(2);
    const english = `<p>${'word '.repeat(460)}</p>`;
    expect(estimateReadingMinutes(english)).toBe(2);
    expect(estimateReadingMinutes('')).toBe(0);
  });
});
