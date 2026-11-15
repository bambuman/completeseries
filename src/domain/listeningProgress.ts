import type { LocalBookEvidence } from "./audiobook";

/**
 * Listening progress for one Audiobookshelf library item, read from the
 * signed-in user's media progress.
 */
export type ListeningProgressEntry = {
  libraryItemId: string;
  isFinished: boolean;
  progress: number;
  lastUpdate: number | null;
};

/**
 * How far the user has got with the owned books of one series.
 */
export type SeriesListeningStatus = {
  finishedCount: number;
  inProgressCount: number;
  lastListenedAt: number | null;
};

export type ListeningProgressIndex = Map<string, ListeningProgressEntry>;

/**
 * Purpose: Index listening progress by library item id, keeping only books the
 * user has finished or actually started.
 *
 * @param entries - Progress entries from Audiobookshelf.
 * @returns Progress entries keyed by library item id.
 */
export function buildListeningProgressIndex(
  entries: ListeningProgressEntry[]
): ListeningProgressIndex {
  const index: ListeningProgressIndex = new Map();

  for (const entry of entries) {
    if (!entry.libraryItemId) continue;
    if (!entry.isFinished && entry.progress <= 0) continue;
    index.set(entry.libraryItemId, entry);
  }

  return index;
}

/**
 * Purpose: Summarise how many owned books of a series the user has finished or
 * is listening to.
 *
 * @param books - Owned books of one local series.
 * @param index - Listening progress keyed by library item id.
 * @returns The series listening status, or `undefined` when no book has been
 * started.
 */
export function summariseSeriesListening(
  books: LocalBookEvidence[],
  index: ListeningProgressIndex
): SeriesListeningStatus | undefined {
  let finishedCount = 0;
  let inProgressCount = 0;
  let lastListenedAt: number | null = null;
  const seenIds = new Set<string>();

  for (const book of books) {
    if (seenIds.has(book.id)) continue;
    seenIds.add(book.id);

    const entry = index.get(book.id);
    if (!entry) continue;

    if (entry.isFinished) finishedCount += 1;
    else inProgressCount += 1;

    if (
      entry.lastUpdate !== null &&
      (lastListenedAt === null || entry.lastUpdate > lastListenedAt)
    ) {
      lastListenedAt = entry.lastUpdate;
    }
  }

  if (finishedCount === 0 && inProgressCount === 0) return undefined;
  return { finishedCount, inProgressCount, lastListenedAt };
}

/**
 * Purpose: Combine the listening status of two result groups that are merged
 * into one.
 *
 * @param first - Listening status of the first group.
 * @param second - Listening status of the second group.
 * @returns The larger counts and the most recent listening time, or
 * `undefined` when neither group has been started.
 */
export function mergeListeningStatus(
  first: SeriesListeningStatus | undefined,
  second: SeriesListeningStatus | undefined
): SeriesListeningStatus | undefined {
  if (!first) return second;
  if (!second) return first;

  return {
    finishedCount: Math.max(first.finishedCount, second.finishedCount),
    inProgressCount: Math.max(first.inProgressCount, second.inProgressCount),
    lastListenedAt: latestTime(first.lastListenedAt, second.lastListenedAt),
  };
}

/**
 * Purpose: Pick the later of two optional timestamps.
 *
 * @param first - First timestamp, or `null`.
 * @param second - Second timestamp, or `null`.
 * @returns The later timestamp, or `null` when both are missing.
 */
function latestTime(first: number | null, second: number | null): number | null {
  if (first === null) return second;
  if (second === null) return first;
  return Math.max(first, second);
}
