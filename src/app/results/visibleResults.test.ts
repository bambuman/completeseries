import { describe, expect, it } from "vitest";
import type { ProviderSeriesBook } from "../../domain/audiobook";
import type { MissingBookGroup } from "../../domain/missingBooks";
import { buildVisibleMissingGroups, filterListeningGroups } from "./visibleResults";

describe("buildVisibleMissingGroups", () => {
  it("sorts visible series alphabetically by default", () => {
    const groups = [
      buildGroup("Zeta", "SERIES_Z", [buildBook("Zeta Book", "Z_BOOK", "1")]),
      buildGroup("Alpha", "SERIES_A", [buildBook("Alpha Book", "A_BOOK", "1")]),
    ];

    const result = buildVisibleMissingGroups(groups, [], [], "uk", false);

    expect(result.map((group) => group.seriesName)).toEqual(["Alpha", "Zeta"]);
  });

  it("sorts visible series in reverse alphabetical order when requested", () => {
    const groups = [
      buildGroup("Alpha", "SERIES_A", [buildBook("Alpha Book", "A_BOOK", "1")]),
      buildGroup("Zeta", "SERIES_Z", [buildBook("Zeta Book", "Z_BOOK", "1")]),
    ];

    const result = buildVisibleMissingGroups(groups, [], [], "uk", false, "seriesDesc");

    expect(result.map((group) => group.seriesName)).toEqual(["Zeta", "Alpha"]);
  });

  it("can preserve original scan order when requested", () => {
    const groups = [
      buildGroup("Zeta", "SERIES_Z", [buildBook("Zeta Book", "Z_BOOK", "1")]),
      buildGroup("Alpha", "SERIES_A", [buildBook("Alpha Book", "A_BOOK", "1")]),
    ];

    const result = buildVisibleMissingGroups(groups, [], [], "uk", false, "scanOrder");

    expect(result.map((group) => group.seriesName)).toEqual(["Zeta", "Alpha"]);
  });

  it("sorts by visible missing-book count when requested", () => {
    const groups = [
      buildGroup("One Missing", "SERIES_ONE", [buildBook("Book One", "ONE", "1")]),
      buildGroup("Two Missing", "SERIES_TWO", [
        buildBook("Book Two", "TWO", "2"),
        buildBook("Book Three", "THREE", "3"),
      ]),
    ];

    const result = buildVisibleMissingGroups(groups, [], [], "uk", false, "missingDesc");

    expect(result.map((group) => group.seriesName)).toEqual(["Two Missing", "One Missing"]);
  });

  it("sorts by primary missing-book author when requested", () => {
    const groups = [
      buildGroup("Series B", "SERIES_B", [
        buildBook("Book B", "BOOK_B", "1", ["Zadie Smith"]),
      ]),
      buildGroup("Series A", "SERIES_A", [
        buildBook("Book A", "BOOK_A", "1", ["Agatha Christie"]),
      ]),
    ];

    const ascending = buildVisibleMissingGroups(groups, [], [], "uk", false, "authorAsc");
    const descending = buildVisibleMissingGroups(groups, [], [], "uk", false, "authorDesc");

    expect(ascending.map((group) => group.seriesName)).toEqual(["Series A", "Series B"]);
    expect(descending.map((group) => group.seriesName)).toEqual(["Series B", "Series A"]);
  });

  it("sorts books inside each visible group by matched series position", () => {
    const groups = [
      buildGroup("Discworld", "DISC_ASIN", [
        buildBook("Book Three", "BOOK_3", "3"),
        buildBook("Book One", "BOOK_1", "1"),
      ]),
    ];

    const result = buildVisibleMissingGroups(groups, [], [], "uk", false);

    expect(result[0].books.map((book) => book.title)).toEqual(["Book One", "Book Three"]);
  });

  it("filters out books manually marked as owned", () => {
    const groups = [
      buildGroup("Discworld", "DISC_ASIN", [
        buildBook("Book One", "BOOK_1", "1"),
        buildBook("Book Two", "BOOK_2", "2"),
      ]),
    ];

    const result = buildVisibleMissingGroups(
      groups,
      [],
      [
        {
          createdAt: "2026-05-27T00:00:00.000Z",
          providerId: "audible",
          region: "uk",
          seriesAsin: "DISC_ASIN",
          seriesName: "Discworld",
          asin: "BOOK_1",
          title: "Book One",
          authors: [],
        },
      ],
      "uk",
      false
    );

    expect(result[0].books.map((book) => book.title)).toEqual(["Book Two"]);
  });

  it("uses the group provider when filtering manual owned-book matches", () => {
    const groups = [
      {
        ...buildGroup("Apple Series", "APPLE_SERIES", [buildBook("Apple Book", "APPLE_BOOK", "1")]),
        providerId: "appleBooks",
        providerName: "Apple Books",
      },
    ];

    const result = buildVisibleMissingGroups(
      groups,
      [],
      [
        {
          createdAt: "2026-06-12T00:00:00.000Z",
          providerId: "appleBooks",
          region: "uk",
          seriesAsin: "APPLE_SERIES",
          seriesName: "Apple Series",
          asin: "APPLE_BOOK",
          title: "Apple Book",
          authors: [],
        },
      ],
      "uk",
      false
    );

    expect(result).toEqual([]);
  });
});

/**
 * Purpose: Build a missing-book group fixture for visible-result sorting tests.
 *
 * @param seriesName - Series name to place on the group.
 * @param seriesAsin - Series ASIN to place on the group.
 * @param books - Provider books to attach to the group.
 * @returns A missing-book group fixture.
 */
function buildGroup(
  seriesName: string,
  seriesAsin: string,
  books: ProviderSeriesBook[]
): MissingBookGroup {
  return {
    seriesName,
    seriesAsin,
    books,
    diagnosticsByAsin: {},
    debugDecisions: [],
  };
}

/**
 * Purpose: Build a provider book fixture for visible-result sorting tests.
 *
 * @param title - Book title to place on the fixture.
 * @param asin - Book ASIN to place on the fixture.
 * @param position - Series position to place on the fixture.
 * @returns A provider book fixture.
 */
function buildBook(
  title: string,
  asin: string,
  position: string,
  authors: string[] = []
): ProviderSeriesBook {
  return {
    asin,
    title,
    authors,
    narrators: [],
    series: [{ asin: "DISC_ASIN", name: "Discworld", position }],
  };
}

describe("buildVisibleMissingGroups release dates", () => {
  const NOW = new Date(2026, 10, 15);

  it("keeps only released or upcoming books and drops groups left empty", () => {
    const groups = [
      buildGroup("Mixed", "SERIES_M", [
        withRelease(buildBook("Mixed 1", "M1", "1"), "2025-01-01"),
        withRelease(buildBook("Mixed 2", "M2", "2"), "2026-12-08"),
      ]),
      buildGroup("Released Only", "SERIES_R", [
        withRelease(buildBook("Released 1", "R1", "1"), "2024-05-05"),
      ]),
    ];

    const upcoming = buildVisibleMissingGroups(
      groups,
      [],
      [],
      "us",
      false,
      "seriesAsc",
      "upcoming",
      NOW
    );
    const released = buildVisibleMissingGroups(
      groups,
      [],
      [],
      "us",
      false,
      "seriesAsc",
      "released",
      NOW
    );

    expect(
      upcoming.map((group) => [group.seriesName, group.books.map((book) => book.asin)])
    ).toEqual([
      ["Mixed", ["M2"]],
    ]);
    expect(
      released.map((group) => [group.seriesName, group.books.map((book) => book.asin)])
    ).toEqual([
      ["Mixed", ["M1"]],
      ["Released Only", ["R1"]],
    ]);
  });

  it("sorts series by their next upcoming release, then series without one", () => {
    const groups = [
      buildGroup("Later", "SERIES_L", [withRelease(buildBook("L", "L1", "1"), "2027-03-01")]),
      buildGroup("None", "SERIES_N", [withRelease(buildBook("N", "N1", "1"), "2025-01-01")]),
      buildGroup("Sooner", "SERIES_S", [withRelease(buildBook("S", "S1", "1"), "2026-12-08")]),
    ];

    const result = buildVisibleMissingGroups(
      groups,
      [],
      [],
      "us",
      false,
      "releaseNext",
      "all",
      NOW
    );

    expect(result.map((group) => group.seriesName)).toEqual(["Sooner", "Later", "None"]);
  });

  it("sorts series by their most recent released book", () => {
    const groups = [
      buildGroup("Old", "SERIES_O", [withRelease(buildBook("O", "O1", "1"), "2020-01-01")]),
      buildGroup("Future Only", "SERIES_F", [withRelease(buildBook("F", "F1", "1"), "2027-01-01")]),
      buildGroup("Recent", "SERIES_R", [withRelease(buildBook("R", "R1", "1"), "2026-11-01")]),
    ];

    const result = buildVisibleMissingGroups(
      groups,
      [],
      [],
      "us",
      false,
      "releaseNewest",
      "all",
      NOW
    );

    expect(result.map((group) => group.seriesName)).toEqual(["Recent", "Old", "Future Only"]);
  });
});

/**
 * Purpose: Add a release date to a provider book fixture.
 *
 * @param book - Provider book fixture.
 * @param releaseDate - Release date to set.
 * @returns The fixture with the release date.
 */
function withRelease(book: ProviderSeriesBook, releaseDate: string): ProviderSeriesBook {
  return { ...book, releaseDate };
}

describe("listening progress in results", () => {
  const listened = (lastListenedAt: number | null) => ({
    finishedCount: 1,
    inProgressCount: 0,
    lastListenedAt,
  });

  it("keeps only series the user has started", () => {
    const groups = [
      { ...buildGroup("Started", "S1", [buildBook("A", "A1", "2")]), listening: listened(5) },
      buildGroup("Untouched", "S2", [buildBook("B", "B1", "2")]),
    ];

    expect(filterListeningGroups(groups).map((group) => group.seriesName)).toEqual(["Started"]);
  });

  it("sorts by most recently listened, with unstarted series last", () => {
    const groups = [
      buildGroup("Untouched", "S1", [buildBook("A", "A1", "2")]),
      { ...buildGroup("Older", "S2", [buildBook("B", "B1", "2")]), listening: listened(100) },
      { ...buildGroup("Newer", "S3", [buildBook("C", "C1", "2")]), listening: listened(900) },
      { ...buildGroup("No date", "S4", [buildBook("D", "D1", "2")]), listening: listened(null) },
    ];

    expect(
      buildVisibleMissingGroups(groups, [], [], "uk", false, "listenedRecent").map(
        (group) => group.seriesName
      )
    ).toEqual(["Newer", "Older", "No date", "Untouched"]);
  });
});
