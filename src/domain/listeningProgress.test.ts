import { describe, expect, it } from "vitest";
import type { LocalBookEvidence } from "./audiobook";
import {
  buildListeningProgressIndex,
  mergeListeningStatus,
  summariseSeriesListening,
} from "./listeningProgress";
import { mergeMissingBookGroups } from "./missingGroupMerge";
import type { MissingBookGroup } from "./missingBookTypes";

describe("listeningProgress", () => {
  const index = buildListeningProgressIndex([
    { libraryItemId: "book-1", isFinished: true, progress: 1, lastUpdate: 100 },
    {
      libraryItemId: "book-2",
      isFinished: false,
      progress: 0.4,
      lastUpdate: 300,
    },
    {
      libraryItemId: "book-3",
      isFinished: false,
      progress: 0,
      lastUpdate: 500,
    },
  ]);

  it("ignores items that were opened but never started", () => {
    expect([...index.keys()]).toEqual(["book-1", "book-2"]);
  });

  it("counts finished and in-progress owned books and keeps the latest listen", () => {
    expect(
      summariseSeriesListening(
        [buildBook("book-1"), buildBook("book-2"), buildBook("book-3")],
        index
      )
    ).toEqual({ finishedCount: 1, inProgressCount: 1, lastListenedAt: 300 });
  });

  it("returns nothing for a series the user has not started", () => {
    expect(
      summariseSeriesListening([buildBook("book-3"), buildBook("book-4")], index)
    ).toBeUndefined();
  });

  it("counts a book listed twice only once", () => {
    expect(summariseSeriesListening([buildBook("book-1"), buildBook("book-1")], index)).toEqual({
      finishedCount: 1,
      inProgressCount: 0,
      lastListenedAt: 100,
    });
  });

  it("merges two statuses using the larger counts and the latest time", () => {
    expect(
      mergeListeningStatus(
        { finishedCount: 2, inProgressCount: 0, lastListenedAt: 50 },
        { finishedCount: 1, inProgressCount: 1, lastListenedAt: null }
      )
    ).toEqual({ finishedCount: 2, inProgressCount: 1, lastListenedAt: 50 });
    expect(mergeListeningStatus(undefined, undefined)).toBeUndefined();
  });

  it("keeps listening status when result groups are merged", () => {
    const merged = mergeMissingBookGroups([
      buildGroup("A", {
        finishedCount: 3,
        inProgressCount: 0,
        lastListenedAt: 10,
      }),
      buildGroup("A"),
      buildGroup("B"),
    ]);

    expect(merged.find((group) => group.seriesName === "A")?.listening).toEqual({
      finishedCount: 3,
      inProgressCount: 0,
      lastListenedAt: 10,
    });
    expect(merged.find((group) => group.seriesName === "B")).not.toHaveProperty("listening");
  });
});

/**
 * Purpose: Build a minimal owned-book fixture.
 *
 * @param id - Library item id.
 * @returns Local book evidence.
 */
function buildBook(id: string): LocalBookEvidence {
  return {
    id,
    title: id,
    authors: [],
    narrators: [],
    position: { raw: null, numeric: null },
  };
}

/**
 * Purpose: Build a missing-book group with one book unique to the series.
 *
 * @param seriesName - Series name, also used as the series ASIN.
 * @param listening - Optional listening status.
 * @returns Missing-book group fixture.
 */
function buildGroup(
  seriesName: string,
  listening?: MissingBookGroup["listening"]
): MissingBookGroup {
  return {
    seriesName,
    seriesAsin: `series-${seriesName}`,
    books: [
      {
        asin: `B-${seriesName}-${listening ? "1" : "2"}`,
        title: `${seriesName} ${listening ? "one" : "two"}`,
        authors: [],
        narrators: [],
        series: [
          {
            asin: `series-${seriesName}`,
            name: seriesName,
            position: listening ? "1" : "2",
          },
        ],
      },
    ],
    diagnosticsByAsin: {},
    debugDecisions: [],
    ...(listening ? { listening } : {}),
  };
}
