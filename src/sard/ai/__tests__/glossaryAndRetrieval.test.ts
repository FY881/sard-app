import {
  extractJson,
  filterGlossary,
  mergeGlossary,
  parseGlossaryResponse,
  visibleGlossary,
} from '../glossaryLogic';
import {
  buildRetrievalIndex,
  queryWantsRecent,
  searchIndex,
  toContextBlocks,
} from '../retrieval';

describe('glossary parsing', () => {
  it('parses fenced JSON with entries and normalizes categories', () => {
    const reply =
      '```json\n{"entries":[{"name":"سونغ جين وو","category":"شخصية","description":"صياد ضعيف","aliases":["جين وو"]},{"name":"البوابة","category":"location","description":"مكان خطر"},{"name":"","description":"x"}]}\n```';
    const items = parseGlossaryResponse(reply);
    expect(items).toHaveLength(2);
    expect(items[0].category).toBe('character');
    expect(items[1].category).toBe('place');
    expect(items[0].aliases).toEqual(['جين وو']);
  });
  it('extracts JSON surrounded by prose', () => {
    expect(extractJson('هذه النتيجة: [{"a":1}] شكرا')).toEqual([{ a: 1 }]);
    expect(extractJson('no json')).toBeUndefined();
  });
});

describe('glossary merge + spoiler-safe view', () => {
  const b1 = parseGlossaryResponse(
    JSON.stringify({
      entries: [
        { name: 'ليلى', category: 'character', description: 'فتاة من القرية' },
        { name: 'القلعة', category: 'place', description: 'قلعة مهجورة' },
      ],
    }),
  );
  const b2 = parseGlossaryResponse(
    JSON.stringify({
      entries: [
        {
          name: 'ليلى',
          category: 'character',
          description: 'فتاة اكتشفت أنها ساحرة',
          aliases: ['الساحرة'],
        },
        { name: 'الملك', category: 'character', description: 'حاكم المملكة' },
      ],
    }),
  );
  const e1 = mergeGlossary([], b1, { order: 4, chapterName: 'Ch 5' });
  const e2 = mergeGlossary(e1, b2, { order: 9, chapterName: 'Ch 10' });

  it('keeps one entry per name with history', () => {
    expect(e2).toHaveLength(3);
    const layla = e2.find(e => e.name === 'ليلى')!;
    expect(layla.history).toHaveLength(2);
    expect(layla.aliases).toContain('الساحرة');
    expect(layla.firstSeenOrder).toBe(4);
    expect(layla.lastSeenOrder).toBe(9);
  });
  it('does not mutate the previous state', () => {
    expect(e1.find(e => e.name === 'ليلى')!.history).toHaveLength(1);
  });
  it('matches by alias on later batches', () => {
    const e3 = mergeGlossary(
      e2,
      [
        {
          name: 'الساحرة',
          category: 'character',
          description: 'وصف أحدث',
          aliases: [],
        },
      ],
      { order: 12 },
    );
    expect(e3).toHaveLength(3);
    expect(e3.find(e => e.name === 'ليلى')!.history).toHaveLength(3);
  });
  it('hides later entries and later descriptions below the cutoff', () => {
    const atCh7 = visibleGlossary(e2, 6);
    expect(atCh7.map(e => e.name).sort()).toEqual(['القلعة', 'ليلى'].sort());
    expect(atCh7.find(e => e.name === 'ليلى')!.description).toBe(
      'فتاة من القرية',
    );
    const atCh10 = visibleGlossary(e2, 9);
    expect(atCh10).toHaveLength(3);
    expect(atCh10.find(e => e.name === 'ليلى')!.description).toContain('ساحرة');
    expect(visibleGlossary(e2, 2)).toEqual([]);
  });
  it('filters by query and category', () => {
    const v = visibleGlossary(e2, 9);
    expect(filterGlossary(v, 'ليلي').map(e => e.name)).toEqual(['ليلى']);
    expect(filterGlossary(v, '', 'place').map(e => e.name)).toEqual([
      'القلعة',
    ]);
  });
});

describe('retrieval', () => {
  const docs = [
    {
      chapterId: 1,
      chapterName: 'الفصل 1',
      order: 0,
      text: 'التقى أحمد بالتنين الأحمر عند الجبل.\n\nكان الجو باردا.',
    },
    {
      chapterId: 2,
      chapterName: 'الفصل 2',
      order: 1,
      text: 'سافرت ليلى إلى المدينة لتبحث عن السيف.',
    },
    {
      chapterId: 3,
      chapterName: 'الفصل 3',
      order: 2,
      text: 'في النهاية عاد الجميع إلى القرية.',
    },
  ];
  const index = buildRetrievalIndex(docs, { chunkChars: 200, overlapChars: 0 });

  it('finds the chunk that mentions the entity', () => {
    const r = searchIndex(index, 'ماذا حدث مع التنين؟', { topK: 2 });
    expect(r[0].chunk.chapterId).toBe(1);
  });
  it('adds recent chunks for "last chapter" questions', () => {
    expect(queryWantsRecent('ماذا حدث في آخر فصل؟')).toBe(true);
    const r = searchIndex(index, 'ماذا حدث في آخر فصل؟', { topK: 2 });
    expect(r.some(x => x.chunk.chapterId === 3)).toBe(true);
  });
  it('orders context blocks by story order within budget', () => {
    const r = searchIndex(index, 'ليلى التنين', { topK: 3 });
    const ids = toContextBlocks(r, 10000).map(b => b.chapterId);
    expect([...ids].sort()).toEqual(ids);
    expect(toContextBlocks(r, 5)).toEqual([]);
  });
});
