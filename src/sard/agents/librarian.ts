/**
 * Librarian agent (device, local only): smart shelves, dedupe, organize.
 */
import {
  createCategory,
  getCategoriesFromDb,
} from '@database/queries/CategoryQueries';
import {
  removeNovelsFromLibrary,
  updateNovelCategoryById,
} from '@database/queries/NovelQueries';
import { AGENT_STRINGS } from '../ai/strings';
import { addAgentLog } from '../ai/db';
import { findDuplicateGroups, type DuplicateGroup } from './dedupe';
import { loadLibraryNovels, loadShelfNovels, type LibraryNovel } from './library';
import { getShelfRules } from './settings';
import {
  computeShelves,
  SHELF_ORDER,
  type ShelfId,
  type ShelfItem,
} from './shelves';

export const loadSmartShelves = async (): Promise<
  Record<ShelfId, ShelfItem[]>
> => computeShelves(await loadShelfNovels(), getShelfRules());

export const loadDuplicates = async (): Promise<
  DuplicateGroup<LibraryNovel>[]
> => findDuplicateGroups(await loadLibraryNovels());

/** Removes the other copies of a duplicate group from the library. */
export const removeDuplicateCopies = async (
  group: DuplicateGroup<LibraryNovel>,
  keepId: number,
) => {
  const ids = group.novels.filter(n => n.id !== keepId).map(n => n.id);
  if (!ids.length) return 0;
  await removeNovelsFromLibrary(ids);
  await addAgentLog({
    agent: 'librarian',
    action: 'dedupe',
    detail: `${group.novels.find(n => n.id === keepId)?.name ?? ''} (−${ids.length})`,
  });
  return ids.length;
};

/**
 * Adds every library novel to smart-shelf categories (creating them once).
 * Purely additive: nothing is removed from existing categories.
 */
export const organizeLibraryIntoCategories = async () => {
  const shelves = await loadSmartShelves();
  const existing = await getCategoriesFromDb();
  const byName = new Map(existing.map(c => [c.name, c.id]));
  let placed = 0;
  const touched = new Set<number>();
  for (const shelf of SHELF_ORDER) {
    const items = shelves[shelf];
    if (!items.length) continue;
    const name = AGENT_STRINGS.librarian.shelves[shelf];
    let id = byName.get(name);
    if (id === undefined) {
      const row = await createCategory(name);
      id = row.id;
      byName.set(name, id);
    }
    for (const item of items) {
      await updateNovelCategoryById(item.novel.id, [id]);
      touched.add(item.novel.id);
    }
  }
  placed = touched.size;
  await addAgentLog({
    agent: 'librarian',
    action: 'organize',
    detail: AGENT_STRINGS.librarian.organizeDone(placed),
  });
  return placed;
};
