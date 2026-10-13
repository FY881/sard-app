import {
  AUTO_SPLIT_SIZE,
  mergeSegments,
  normalizeDigits,
  parseRangeExpression,
  partFileName,
  sanitizeFileName,
  selectChapters,
  sortChaptersForReading,
  splitIntoParts,
} from '../selection';

const chapters = Array.from({ length: 10 }, (_, i) => ({
  id: 100 + i,
  name: `Chapter ${i + 1}`,
  // even-numbered chapters are downloaded
  isDownloaded: i % 2 === 1,
  page: '1',
  position: i,
}));

describe('parseRangeExpression', () => {
  it('parses numbers and ranges, merging overlaps', () => {
    expect(parseRangeExpression('1-3, 2-5, 8')).toEqual({
      ok: true,
      segments: [
        { from: 1, to: 5 },
        { from: 8, to: 8 },
      ],
    });
  });

  it('accepts Arabic-Indic digits, Arabic comma, dashes and «إلى»', () => {
    expect(parseRangeExpression('١-٣، ٧ إلى ٩', 20)).toEqual({
      ok: true,
      segments: [
        { from: 1, to: 3 },
        { from: 7, to: 9 },
      ],
    });
    expect(parseRangeExpression('2–4')).toEqual({
      ok: true,
      segments: [{ from: 2, to: 4 }],
    });
  });

  it('supports open-ended ranges when the total is known', () => {
    expect(parseRangeExpression('5-', 9)).toEqual({
      ok: true,
      segments: [{ from: 5, to: 9 }],
    });
    expect(parseRangeExpression('5-')).toEqual({ ok: false, reason: 'syntax' });
  });

  it('rejects bad input', () => {
    expect(parseRangeExpression('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseRangeExpression('abc')).toEqual({
      ok: false,
      reason: 'syntax',
    });
    expect(parseRangeExpression('9-3')).toEqual({ ok: false, reason: 'order' });
    expect(parseRangeExpression('0-3')).toEqual({
      ok: false,
      reason: 'bounds',
    });
    expect(parseRangeExpression('1-30', 10)).toEqual({
      ok: false,
      reason: 'bounds',
    });
  });
});

describe('selectChapters', () => {
  it('selects all chapters in reading order and splits downloaded/missing', () => {
    const result = selectChapters([...chapters].reverse(), { scope: 'all' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selected.map(i => i.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(result.selected[0].chapter.id).toBe(100);
    expect(result.downloaded).toHaveLength(5);
    expect(result.missing).toHaveLength(5);
  });

  it('selects only downloaded chapters', () => {
    const result = selectChapters(chapters, { scope: 'downloaded' });
    expect(result.ok && result.selected.map(i => i.position)).toEqual([
      2, 4, 6, 8, 10,
    ]);
    expect(result.ok && result.missing).toEqual([]);
  });

  it('selects a range by position', () => {
    const result = selectChapters(chapters, {
      scope: 'range',
      range: '3-5, 9',
    });
    expect(result.ok && result.selected.map(i => i.position)).toEqual([
      3, 4, 5, 9,
    ]);
    expect(result.ok && result.firstPosition).toBe(3);
    expect(result.ok && result.lastPosition).toBe(9);
  });

  it('reports bounds and empty selections', () => {
    expect(selectChapters(chapters, { scope: 'range', range: '1-11' })).toEqual(
      { ok: false, reason: 'bounds' },
    );
    expect(selectChapters([], { scope: 'all' })).toEqual({
      ok: false,
      reason: 'noChapters',
    });
    const none = chapters.map(c => ({ ...c, isDownloaded: false }));
    expect(selectChapters(none, { scope: 'downloaded' })).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('orders by numeric page, then position', () => {
    const rows = [
      { id: 1, name: 'a', isDownloaded: true, page: '10', position: 0 },
      { id: 2, name: 'b', isDownloaded: true, page: '2', position: 5 },
      { id: 3, name: 'c', isDownloaded: true, page: '2', position: 1 },
    ];
    expect(sortChaptersForReading(rows).map(r => r.id)).toEqual([3, 2, 1]);
  });
});

describe('helpers', () => {
  it('normalizes digits', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩ ۴۵')).toBe('0123456789 45');
  });

  it('merges adjacent segments', () => {
    expect(
      mergeSegments([
        { from: 4, to: 6 },
        { from: 1, to: 3 },
      ]),
    ).toEqual([{ from: 1, to: 6 }]);
  });

  it('splits into parts and auto-splits huge exports', () => {
    expect(splitIntoParts([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(splitIntoParts([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
    const parts = splitIntoParts(
      Array.from({ length: 900 }, (_, i) => i),
      0,
    );
    expect(parts).toHaveLength(Math.ceil(900 / AUTO_SPLIT_SIZE));
    expect(parts[0]).toHaveLength(AUTO_SPLIT_SIZE);
  });

  it('sanitizes file names', () => {
    expect(sanitizeFileName('  لورد: الغوامض? / ج1.pdf ')).toBe(
      'لورد الغوامض ج1',
    );
    expect(sanitizeFileName('...')).toBe('novel');
    expect(partFileName('رواية', 2, 3, p => `الجزء ${p}`)).toBe(
      'رواية - الجزء 2',
    );
    expect(partFileName('رواية', 1, 1, p => `الجزء ${p}`)).toBe('رواية');
  });
});
