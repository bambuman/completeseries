import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MissingBookGroup } from "../../domain/missingBooks";
import type { ProviderSeriesBook } from "../../domain/audiobook";
import { getListeningLabel, getTileCoverBook, ResultsSeriesGrid } from "./ResultsSeriesGrid";
import type { VisibleMissingBookGroup } from "./visibleResults";

describe("ResultsSeriesGrid", () => {
  it("shows a confidence badge on low-confidence result cards", () => {
    const html = renderToStaticMarkup(
      <ResultsSeriesGrid
        groups={[
          {
            ...buildGroup(),
            confidence: {
              score: 37,
              label: "Low confidence",
              reason: "Candidate scored below the confidence threshold.",
            },
            isHidden: false,
          },
        ]}
        hiddenItems={[]}
        onHideItem={() => undefined}
        onSelectGroup={() => undefined}
        onUnhideItem={() => undefined}
      />
    );

    expect(html).toContain("series-tile--low-confidence");
    expect(html).toContain("Confidence 37%");
  });

  it("shows when a result card contains merged provider series", () => {
    const html = renderToStaticMarkup(
      <ResultsSeriesGrid
        groups={[
          {
            ...buildGroup(),
            mergedFrom: [
              {
                seriesName: "Discworld",
                seriesAsin: "series-discworld",
                providerName: "Audible catalogue",
                missingBookCount: 1,
              },
              {
                seriesName: "Discworld: Industrial Revolution",
                seriesAsin: "series-industrial-revolution",
                providerName: "Audible catalogue",
                missingBookCount: 1,
              },
            ],
            isHidden: false,
          },
        ]}
        hiddenItems={[]}
        onHideItem={() => undefined}
        onSelectGroup={() => undefined}
        onUnhideItem={() => undefined}
      />
    );

    expect(html).toContain("Merged 2 series");
    expect(html).toContain("Discworld: Industrial Revolution");
  });
});

/**
 * Purpose: Build a result group with one missing book for grid rendering tests.
 *
 * @returns Missing-book group fixture.
 */
function buildGroup(): MissingBookGroup {
  return {
    seriesName: "Apple Review Series",
    seriesAsin: "apple-books:search:Apple%20Review%20Series",
    providerId: "appleBooks",
    providerName: "Apple Books",
    books: [
      {
        asin: "apple-books:track:123",
        title: "Potential Missing Book",
        authors: ["Known Author"],
        narrators: [],
        series: [
          {
            asin: "apple-books:search:Apple%20Review%20Series",
            name: "Apple Review Series",
            position: "2",
          },
        ],
      },
    ],
    diagnosticsByAsin: {},
    debugDecisions: [],
  };
}

describe("getTileCoverBook", () => {
  it("prefers a released book over an earlier-listed upcoming one", () => {
    const upcoming = buildDatedBook("UPCOMING", "2999-01-05");
    const released = buildDatedBook("RELEASED", "2025-12-02");

    expect(getTileCoverBook(buildCoverGroup([upcoming, released]))?.asin).toBe("RELEASED");
  });

  it("falls back to the first book when nothing is released yet", () => {
    const first = buildDatedBook("FIRST", "2999-01-05");
    const second = buildDatedBook("SECOND", "2999-02-05");

    expect(getTileCoverBook(buildCoverGroup([first, second]))?.asin).toBe("FIRST");
  });
});

/**
 * Purpose: Build a provider book fixture with a release date.
 *
 * @param asin - Book ASIN.
 * @param releaseDate - Release date.
 * @returns Provider book fixture.
 */
function buildDatedBook(asin: string, releaseDate: string): ProviderSeriesBook {
  return { asin, title: asin, authors: [], narrators: [], releaseDate, series: [] };
}

/**
 * Purpose: Build a visible result group around the given books.
 *
 * @param books - Books in display order.
 * @returns Visible result group fixture.
 */
function buildCoverGroup(books: ProviderSeriesBook[]): VisibleMissingBookGroup {
  return {
    seriesName: "Backyard Starship",
    seriesAsin: "series-backyard-starship",
    books,
    diagnosticsByAsin: {},
    debugDecisions: [],
    isHidden: false,
  };
}

describe("getListeningLabel", () => {
  const label = (finishedCount: number, inProgressCount: number) =>
    getListeningLabel({ listening: { finishedCount, inProgressCount, lastListenedAt: 1 } });

  it("describes started and finished books", () => {
    expect(label(3, 1)).toBe("Listening · 3 finished");
    expect(label(2, 0)).toBe("2 finished");
    expect(label(0, 1)).toBe("Listening");
    expect(getListeningLabel({})).toBeNull();
  });
});
