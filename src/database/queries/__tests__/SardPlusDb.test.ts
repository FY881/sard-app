/**
 * Sard 1.1 tables against a real in-memory SQLite database
 * (bookmarks, vocabulary + Leitner review, tags, novel meta, backup dump/restore).
 */
import './mockDb';
import { setupTestDatabase, teardownTestDatabase } from './setup';

const mockKv = new Map<string, unknown>();
jest.mock('@utils/mmkv/mmkv', () => ({
  MMKVStorage: { addOnValueChangedListener: () => ({ remove: () => {} }), getString: () => undefined, set: () => {} },
  getMMKVObject: (k: string) => mockKv.get(k),
  setMMKVObject: (k: string, v: unknown) => mockKv.set(k, v),
}));

import {
  addBookmark, addVocab, chapterBookmarks, deleteBookmark, deleteTag, dueVocab, dumpPlusTables, getAllNovelMeta,
  listBookmarks, listTags, listVocab, resetSardPlusTablesFlag, restorePlusTables, reviewVocab, setHidden,
  setNovelMeta, setNovelTags, tagNovels, updateBookmarkNote, vocabCounts,
} from '../../../sard/plus/db';

describe('Sard plus tables', () => {
  beforeEach(() => {
    setupTestDatabase();
    resetSardPlusTablesFlag();
    mockKv.clear();
  });
  afterAll(() => teardownTestDatabase());

  it('stores bookmarks with notes', async () => {
    const b = await addBookmark({ novelId: 1, chapterId: 10, progress: 0.4, note: ' هنا مشهد مهم ', excerpt: 'نص' });
    expect(b.note).toBe('هنا مشهد مهم');
    await addBookmark({ novelId: 1, chapterId: 10, progress: 1.7 });
    const list = await chapterBookmarks(10);
    expect(list.map(x => x.progress)).toEqual([0.4, 1]);
    await updateBookmarkNote(b.id, 'جديد');
    expect((await listBookmarks(1)).find(x => x.id === b.id)?.note).toBe('جديد');
    await deleteBookmark(b.id);
    expect(await listBookmarks()).toHaveLength(1);
  });

  it('deduplicates vocabulary and schedules reviews', async () => {
    const a = await addVocab({ word: 'الفَارِس', sentence: 'وقف الفارس', novelId: 1 });
    expect(a.existed).toBe(false);
    expect((await addVocab({ word: 'الفارس' })).existed).toBe(true);
    await addVocab({ word: 'قنديل' });
    expect(await listVocab()).toHaveLength(2);
    const due = await dueVocab(Date.now() + 1);
    expect(due).toHaveLength(2);
    const next = await reviewVocab(due[0], true);
    expect(next.box).toBe(2);
    expect(await dueVocab(Date.now() + 1000)).toHaveLength(1);
    expect((await vocabCounts()).total).toBe(2);
  });

  it('tags, meta, hidden shelf and bulk tagging', async () => {
    await setNovelTags(1, ['مفضلة', '#طويلة', 'مفضلة']);
    await tagNovels('مفضلة', [2, 3]);
    await tagNovels('مفضلة', [3], false);
    await setNovelMeta([1, 2], { status: 'reading', rating: 4 });
    setHidden([2], true);
    const meta = await getAllNovelMeta();
    expect(meta.get(1)?.tags?.sort()).toEqual(['طويلة', 'مفضلة'].sort());
    expect(meta.get(2)).toMatchObject({ status: 'reading', rating: 4, hidden: true, tags: ['مفضلة'] });
    expect(meta.get(3)?.tags ?? []).toEqual([]);
    const tags = await listTags();
    expect(tags.find(t => t.name === 'مفضلة')?.count).toBe(2);
    await deleteTag(tags.find(t => t.name === 'طويلة')!.id);
    expect((await listTags()).map(t => t.name)).toEqual(['مفضلة']);
  });

  it('dumps and restores into a fresh database', async () => {
    await addBookmark({ novelId: 5, chapterId: 50, progress: 0.2, note: 'n' });
    await addVocab({ word: 'كلمة', meaning: 'معنى' });
    await setNovelTags(5, ['وسم']);
    await setNovelMeta([5], { status: 'finished', note: 'رائعة' });
    const dump = JSON.parse(JSON.stringify(await dumpPlusTables()));
    setupTestDatabase();
    resetSardPlusTablesFlag();
    await restorePlusTables(dump);
    expect(await listBookmarks()).toHaveLength(1);
    expect((await listVocab())[0].meaning).toBe('معنى');
    expect((await getAllNovelMeta()).get(5)).toMatchObject({ status: 'finished', note: 'رائعة', tags: ['وسم'] });
  });
});
