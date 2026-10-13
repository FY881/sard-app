import {
  buildEpubStylesheet,
  buildPdfHtml,
  cleanChapterHtml,
  detectDirection,
  escapeHtml,
  mimeFromBase64,
  rewriteImages,
  toDataUri,
  wrapEpubChapter,
  type PdfDocumentOptions,
} from '../html';
import { fontFaceCss, getExportFont } from '../fonts';

const options: PdfDocumentOptions = {
  fontId: 'amiri',
  fontSize: 13,
  lineHeight: 1.8,
  pageSize: 'A5',
  margins: 'normal',
  paperTheme: 'sepia',
  justify: true,
  includeCover: true,
  includeToc: true,
  pageBreakPerChapter: true,
  watermark: 'للاستخدام الشخصي',
};

describe('cleanChapterHtml', () => {
  it('keeps body content and strips scripts, handlers, embeds and javascript urls', () => {
    const html = `<html><head><title>x</title><script>bad()</script></head><body>
      <p onclick="steal()">نص <a href="javascript:alert(1)">رابط</a></p>
      <script>evil()</script><iframe src="https://x"></iframe><style>p{}</style>
      <div style="position:fixed;top:0">ad</div><p>فقرة ثانية</p></body></html>`;
    const out = cleanChapterHtml(html);
    expect(out).toContain('<p>نص');
    expect(out).toContain('فقرة ثانية');
    expect(out).not.toMatch(
      /script|onclick|iframe|javascript:|<style|position:fixed|<head|<body/i,
    );
  });

  it('drops a leading heading that repeats the chapter title (ignoring tashkeel)', () => {
    expect(
      cleanChapterHtml('<h1>الفَصْلُ الأول</h1><p>بداية</p>', 'الفصل الأول'),
    ).toBe('<p>بداية</p>');
    expect(
      cleanChapterHtml('<h1>مقدمة</h1><p>بداية</p>', 'الفصل الأول'),
    ).toContain('<h1>مقدمة</h1>');
  });
});

describe('direction and escaping', () => {
  it('detects RTL for Arabic and LTR for English', () => {
    expect(detectDirection('كان يا ما كان في قديم الزمان')).toBe('rtl');
    expect(detectDirection('Once upon a time in a land far away')).toBe('ltr');
    // short mixed title: first strong character decides
    expect(detectDirection('الفصل 12: Lord of Mysteries')).toBe('rtl');
    expect(detectDirection('<p>Chapter 1: البداية</p>')).toBe('ltr');
  });

  it('escapes html', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('images', () => {
  it('detects mime types and builds data uris from stored base64', () => {
    expect(mimeFromBase64('iVBORw0KGgo')).toBe('image/png');
    expect(mimeFromBase64('/9j/4AAQSk')).toBe('image/jpeg');
    expect(toDataUri('iVBORw0KGgoAAAANSUhEUgAAAAE')).toBe(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE',
    );
    expect(toDataUri('<html>not an image</html>')).toBeUndefined();
  });

  it('rewrites resolvable images and removes broken ones', async () => {
    const html =
      '<p><img src="file:///a.b64.png" alt="أ"><img src="https://x/broken.png"></p>';
    const out = await rewriteImages(html, async src =>
      src.startsWith('file://') ? 'data:image/png;base64,AAAA' : undefined,
    );
    expect(out).toBe('<p><img src="data:image/png;base64,AAAA" alt="أ"/></p>');
    expect(await rewriteImages(html, async () => 'data:x', false)).toBe(
      '<p></p>',
    );
  });
});

describe('buildPdfHtml', () => {
  const doc = buildPdfHtml({
    title: 'لورد الغوامض',
    author: 'كاتب',
    summary: 'ملخص <قصير>',
    exportedAt: new Date(2026, 9, 11),
    chapters: [
      { title: 'البداية', position: 1, html: '<p>نص الفصل الأول</p>' },
      { title: 'الطريق', position: 2, html: '<p>نص الفصل الثاني</p>' },
      { title: 'مفقود', position: 3 },
    ],
    options: { ...options, fontBase: 'file:///fonts' },
  });

  it('is an RTL Arabic document with the chosen font', () => {
    expect(doc).toContain('<html lang="ar" dir="rtl">');
    expect(doc).toContain('src: url("file:///fonts/amiri.ttf")');
    expect(doc).toContain('src: url("file:///fonts/amiri-bold.ttf")');
    expect(doc).toContain("font-family: 'amiri'");
    expect(doc).toContain('size: A5');
    expect(doc).toContain('text-align: justify');
  });

  it('has a cover, a linked table of contents, chapters and a missing placeholder', () => {
    expect(doc).toContain('class="sard-cover"');
    expect(doc).toContain('<h1>لورد الغوامض</h1>');
    expect(doc).toContain('ملخص &lt;قصير&gt;');
    expect(doc).toContain('الفصول 1 – 3');
    expect(doc).toContain('href="#sard-ch-0"');
    expect(doc).toContain('id="sard-ch-2"');
    expect(doc).toContain('نص الفصل الثاني');
    expect(doc).toContain('لم يكن هذا الفصل محمّلًا وقت التصدير.');
    expect(doc).toContain('2026/10/11');
  });

  it('adds the personal-use footer only when requested', () => {
    expect(doc).toContain('<div class="sard-watermark">للاستخدام الشخصي</div>');
    const clean = buildPdfHtml({
      title: 'x',
      chapters: [{ title: 'a', position: 1, html: '<p>a</p>' }],
      options: { ...options, watermark: undefined, includeCover: false },
    });
    expect(clean).not.toContain('<div class="sard-watermark">');
    expect(clean).not.toContain('<section class="sard-cover">');
    // a single chapter gets no table of contents
    expect(clean).not.toContain('<nav class="sard-toc">');
  });

  it('respects a forced LTR direction', () => {
    const ltr = buildPdfHtml({
      title: 'Book',
      chapters: [{ title: 'One', position: 1, html: '<p>Hello</p>' }],
      options: { ...options, direction: 'ltr' },
    });
    expect(ltr).toContain('<html lang="en" dir="ltr">');
  });
});

describe('epub helpers', () => {
  it('wraps chapters RTL and builds the stylesheet', () => {
    const wrapped = wrapEpubChapter(
      '<body><p>نص</p><script>x</script></body>',
      'عنوان & فصل',
      'rtl',
    );
    expect(wrapped).toContain('dir="rtl" lang="ar"');
    expect(wrapped).toContain('عنوان &amp; فصل');
    expect(wrapped).not.toContain('<script');
    const css = buildEpubStylesheet('cairo', 'rtl', true);
    expect(css).toContain('direction: rtl');
    expect(css).toContain("font-family: 'cairo'");
  });

  it('falls back to the default font', () => {
    expect(getExportFont('nope').id).toBe('amiri');
    expect(fontFaceCss(getExportFont('cairo'))).not.toContain('bold');
  });
});
