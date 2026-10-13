import {
  charsetFromContentType,
  charsetFromMeta,
  decodeHtmlBytes,
  decodeUtf8,
} from '../charset';
import {
  extractFirstUrl,
  hostOf,
  normalizeUserUrl,
  resolveHttpUrl,
  sameSite,
} from '../url';

const utf8 = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));
// "مرحبا" encoded as windows-1256
const CP1256_MARHABA = [0xe3, 0xd1, 0xcd, 0xc8, 0xc7];

describe('charset decoding', () => {
  it('decodes utf-8 including astral characters and a BOM', () => {
    expect(decodeUtf8(utf8('سَرد 📚 ok'))).toBe('سَرد 📚 ok');
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('نص')]);
    expect(decodeHtmlBytes(bom)).toEqual({ text: 'نص', charset: 'utf-8' });
  });

  it('honors the content-type header and <meta charset> for windows-1256', () => {
    expect(charsetFromContentType('text/html; charset=windows-1256')).toBe(
      'windows-1256',
    );
    expect(
      decodeHtmlBytes(
        new Uint8Array(CP1256_MARHABA),
        'text/html; charset=windows-1256',
      ).text,
    ).toBe('مرحبا');
    const bytes = new Uint8Array([
      ...utf8('<html><head><meta charset="windows-1256"></head><body>'),
      ...CP1256_MARHABA,
    ]);
    expect(charsetFromMeta(bytes)).toBe('windows-1256');
    expect(decodeHtmlBytes(bytes).text).toContain('مرحبا');
  });

  it('sniffs legacy Arabic pages mislabelled as utf-8', () => {
    const bytes = new Uint8Array(
      Array.from({ length: 20 }, () => [...CP1256_MARHABA, 0x20]).flat(),
    );
    const result = decodeHtmlBytes(bytes, 'text/html; charset=utf-8');
    expect(result.charset).toBe('windows-1256');
    expect(result.text.startsWith('مرحبا')).toBe(true);
  });
});

describe('url helpers', () => {
  it('extracts urls from shared text', () => {
    expect(extractFirstUrl('اقرأ هذا: https://example.com/a/b?x=1، رائع')).toBe(
      'https://example.com/a/b?x=1',
    );
    expect(extractFirstUrl('no url here')).toBeUndefined();
  });

  it('normalizes what the user typed', () => {
    expect(normalizeUserUrl('example.com/story')).toBe(
      'https://example.com/story',
    );
    expect(normalizeUserUrl(' https://Example.com/a#frag ')).toBe(
      'https://example.com/a',
    );
    expect(normalizeUserUrl('ftp://example.com')).toBeUndefined();
    expect(normalizeUserUrl('hello')).toBeUndefined();
    expect(normalizeUserUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('resolves and compares sites', () => {
    expect(resolveHttpUrl('/x#y', 'https://a.com/b')).toBe('https://a.com/x');
    expect(resolveHttpUrl('mailto:a@b.c', 'https://a.com')).toBeUndefined();
    expect(sameSite('https://www.a.com/x', 'https://a.com/y')).toBe(true);
    expect(sameSite('https://a.com', 'https://b.com')).toBe(false);
    expect(hostOf('https://www.a.com/x')).toBe('a.com');
  });
});
