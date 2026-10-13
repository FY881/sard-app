/**
 * Byte -> string decoding for reader mode. Many Arabic sites still serve
 * windows-1256 / ISO-8859-6, which fetch().text() would garble, so the page
 * is fetched as bytes and decoded here using the charset from the HTTP
 * header, a BOM, or the <meta charset> tag.
 *
 * Tables generated from Python's codecs (cp1256, iso8859_6, cp1252).
 */

const CP1256 =
  '\u20ac\u067e\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0679\u2039\u0152\u0686\u0698\u0688\u06af\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u06a9\u2122\u0691\u203a\u0153\u200c\u200d\u06ba\u00a0\u060c\u00a2\u00a3\u00a4\u00a5\u00a6\u00a7\u00a8\u00a9\u06be\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00b8\u00b9\u061b\u00bb\u00bc\u00bd\u00be\u061f\u06c1\u0621\u0622\u0623\u0624\u0625\u0626\u0627\u0628\u0629\u062a\u062b\u062c\u062d\u062e\u062f\u0630\u0631\u0632\u0633\u0634\u0635\u0636\u00d7\u0637\u0638\u0639\u063a\u0640\u0641\u0642\u0643\u00e0\u0644\u00e2\u0645\u0646\u0647\u0648\u00e7\u00e8\u00e9\u00ea\u00eb\u0649\u064a\u00ee\u00ef\u064b\u064c\u064d\u064e\u00f4\u064f\u0650\u00f7\u0651\u00f9\u0652\u00fb\u00fc\u200e\u200f\u06d2';
const ISO_8859_6 =
  '\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008a\u008b\u008c\u008d\u008e\u008f\u0090\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009a\u009b\u009c\u009d\u009e\u009f\u00a0\ufffd\ufffd\ufffd\u00a4\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\u060c\u00ad\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\u061b\ufffd\ufffd\ufffd\u061f\ufffd\u0621\u0622\u0623\u0624\u0625\u0626\u0627\u0628\u0629\u062a\u062b\u062c\u062d\u062e\u062f\u0630\u0631\u0632\u0633\u0634\u0635\u0636\u0637\u0638\u0639\u063a\ufffd\ufffd\ufffd\ufffd\ufffd\u0640\u0641\u0642\u0643\u0644\u0645\u0646\u0647\u0648\u0649\u064a\u064b\u064c\u064d\u064e\u064f\u0650\u0651\u0652\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd\ufffd';
const CP1252 =
  '\u20ac\ufffd\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\ufffd\u017d\ufffd\ufffd\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\ufffd\u017e\u0178\u00a0\u00a1\u00a2\u00a3\u00a4\u00a5\u00a6\u00a7\u00a8\u00a9\u00aa\u00ab\u00ac\u00ad\u00ae\u00af\u00b0\u00b1\u00b2\u00b3\u00b4\u00b5\u00b6\u00b7\u00b8\u00b9\u00ba\u00bb\u00bc\u00bd\u00be\u00bf\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5\u00c6\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf\u00d0\u00d1\u00d2\u00d3\u00d4\u00d5\u00d6\u00d7\u00d8\u00d9\u00da\u00db\u00dc\u00dd\u00de\u00df\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u00f0\u00f1\u00f2\u00f3\u00f4\u00f5\u00f6\u00f7\u00f8\u00f9\u00fa\u00fb\u00fc\u00fd\u00fe\u00ff';

export type SupportedCharset =
  | 'utf-8'
  | 'windows-1256'
  | 'iso-8859-6'
  | 'windows-1252';

const ALIASES: Record<string, SupportedCharset> = {
  'utf-8': 'utf-8',
  utf8: 'utf-8',
  'unicode-1-1-utf-8': 'utf-8',
  'windows-1256': 'windows-1256',
  cp1256: 'windows-1256',
  'x-cp1256': 'windows-1256',
  'iso-8859-6': 'iso-8859-6',
  'iso8859-6': 'iso-8859-6',
  'iso_8859-6': 'iso-8859-6',
  arabic: 'iso-8859-6',
  'asmo-708': 'iso-8859-6',
  'ecma-114': 'iso-8859-6',
  'windows-1252': 'windows-1252',
  cp1252: 'windows-1252',
  'iso-8859-1': 'windows-1252',
  latin1: 'windows-1252',
  'us-ascii': 'windows-1252',
  ascii: 'windows-1252',
};

export const normalizeCharset = (
  name?: string | null,
): SupportedCharset | undefined => {
  if (!name) return undefined;
  return ALIASES[
    name
      .trim()
      .replace(/^["']|["']$/g, '')
      .toLowerCase()
  ];
};

export const charsetFromContentType = (contentType?: string | null) =>
  normalizeCharset(/charset\s*=\s*([^;\s]+)/i.exec(contentType ?? '')?.[1]);

/** Looks for <meta charset> / http-equiv in the first 4KB (ASCII-safe). */
export const charsetFromMeta = (
  bytes: Uint8Array,
): SupportedCharset | undefined => {
  let head = '';
  const end = Math.min(bytes.length, 4096);
  for (let i = 0; i < end; i++) head += String.fromCharCode(bytes[i]);
  const match =
    /<meta[^>]+charset\s*=\s*["']?\s*([a-zA-Z0-9_\-]+)/i.exec(head) ??
    /<\?xml[^>]+encoding\s*=\s*["']([a-zA-Z0-9_\-]+)/i.exec(head);
  return normalizeCharset(match?.[1]);
};

const decodeSingleByte = (
  bytes: Uint8Array,
  table: string,
  offset = 0,
): string => {
  let out = '';
  const chunk: string[] = [];
  for (let i = offset; i < bytes.length; i++) {
    const b = bytes[i];
    chunk.push(b < 0x80 ? String.fromCharCode(b) : table[b - 0x80]);
    if (chunk.length >= 8192) {
      out += chunk.join('');
      chunk.length = 0;
    }
  }
  return out + chunk.join('');
};

/** Spec-compliant enough UTF-8 decoder (replacement char on bad input). */
export const decodeUtf8 = (bytes: Uint8Array, offset = 0): string => {
  const parts: string[] = [];
  const units: number[] = [];
  const flush = () => {
    parts.push(String.fromCharCode.apply(null, units as unknown as number[]));
    units.length = 0;
  };
  let i = offset;
  while (i < bytes.length) {
    const b0 = bytes[i];
    let cp = 0xfffd;
    let size = 1;
    if (b0 < 0x80) {
      cp = b0;
    } else if (
      b0 >= 0xc2 &&
      b0 <= 0xdf &&
      i + 1 < bytes.length &&
      (bytes[i + 1] & 0xc0) === 0x80
    ) {
      cp = ((b0 & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      size = 2;
    } else if (
      b0 >= 0xe0 &&
      b0 <= 0xef &&
      i + 2 < bytes.length &&
      (bytes[i + 1] & 0xc0) === 0x80 &&
      (bytes[i + 2] & 0xc0) === 0x80
    ) {
      cp =
        ((b0 & 0x0f) << 12) |
        ((bytes[i + 1] & 0x3f) << 6) |
        (bytes[i + 2] & 0x3f);
      size = 3;
      if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) cp = 0xfffd;
    } else if (
      b0 >= 0xf0 &&
      b0 <= 0xf4 &&
      i + 3 < bytes.length &&
      (bytes[i + 1] & 0xc0) === 0x80 &&
      (bytes[i + 2] & 0xc0) === 0x80 &&
      (bytes[i + 3] & 0xc0) === 0x80
    ) {
      cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      size = 4;
      if (cp < 0x10000 || cp > 0x10ffff) cp = 0xfffd;
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      units.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      units.push(cp);
    }
    if (units.length >= 8192) flush();
    i += size;
  }
  flush();
  return parts.join('');
};

/** Counts invalid UTF-8 sequences in a sample, to sniff legacy encodings. */
const looksLikeValidUtf8 = (bytes: Uint8Array): boolean => {
  const sample = decodeUtf8(bytes.subarray(0, Math.min(bytes.length, 65536)));
  const bad = (sample.match(/\uFFFD/g) ?? []).length;
  return bad <= 2;
};

export interface DecodeResult {
  text: string;
  charset: SupportedCharset;
}

export const decodeHtmlBytes = (
  bytes: Uint8Array,
  contentType?: string | null,
): DecodeResult => {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return { text: decodeUtf8(bytes, 3), charset: 'utf-8' };
  }
  let charset = charsetFromContentType(contentType) ?? charsetFromMeta(bytes);
  if (!charset) {
    charset = looksLikeValidUtf8(bytes) ? 'utf-8' : 'windows-1256';
  } else if (charset === 'utf-8' && !looksLikeValidUtf8(bytes)) {
    // Mislabelled legacy Arabic pages are common; trust the bytes.
    charset = 'windows-1256';
  }
  switch (charset) {
    case 'windows-1256':
      return { text: decodeSingleByte(bytes, CP1256), charset };
    case 'iso-8859-6':
      return { text: decodeSingleByte(bytes, ISO_8859_6), charset };
    case 'windows-1252':
      return { text: decodeSingleByte(bytes, CP1252), charset };
    default:
      return { text: decodeUtf8(bytes), charset: 'utf-8' };
  }
};
