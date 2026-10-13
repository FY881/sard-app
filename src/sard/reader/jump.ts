/**
 * One-shot "scroll to this highlight when its chapter opens" request, set by
 * the highlights screen right before it navigates to the reader. Kept in
 * memory so no navigator params have to change.
 */
let pending: { chapterId: number; highlightId: number; at: number } | null = null;

export const requestHighlightJump = (chapterId: number, highlightId: number) => {
  pending = { chapterId, highlightId, at: Date.now() };
};

/** Returns and clears the pending jump for this chapter (valid for 2 minutes). */
export const takeHighlightJump = (
  chapterId: number,
  now = Date.now(),
): number | undefined => {
  if (!pending || pending.chapterId !== chapterId) return undefined;
  const id = now - pending.at < 120000 ? pending.highlightId : undefined;
  pending = null;
  return id;
};
