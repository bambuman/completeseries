import { describe, expect, it } from "vitest";
import type { ProviderSeriesBook } from "../../domain/audiobook";
import {
  countBooksByRelease,
  filterBooksByRelease,
  formatReleaseDate,
  getLatestReleaseDate,
  getNextReleaseDate,
  getReleaseLabel,
  isUpcomingBook,
  splitBooksByRelease,
} from "./releaseStatus";

const NOW = new Date(2026, 10, 15);

const released = buildBook("RELEASED", "2026-03-03");
const releasedToday = buildBook("TODAY", "2026-11-15");
const upcomingSoon = buildBook("SOON", "2026-12-08");
const upcomingLater = buildBook("LATER", "2027-02-01");
const noDate = buildBook("NO_DATE", null);

describe("releaseStatus", () => {
  it("treats only books released after today as upcoming", () => {
    expect(isUpcomingBook(upcomingSoon, NOW)).toBe(true);
    expect(isUpcomingBook(releasedToday, NOW)).toBe(false);
    expect(isUpcomingBook(released, NOW)).toBe(false);
    expect(isUpcomingBook(noDate, NOW)).toBe(false);
  });

  it("filters and splits books by release status, counting undated books as released", () => {
    const books = [upcomingLater, released, noDate, upcomingSoon];

    expect(filterBooksByRelease(books, "all", NOW)).toEqual(books);
    expect(filterBooksByRelease(books, "released", NOW).map((book) => book.asin)).toEqual([
      "RELEASED",
      "NO_DATE",
    ]);
    expect(filterBooksByRelease(books, "upcoming", NOW).map((book) => book.asin)).toEqual([
      "LATER",
      "SOON",
    ]);
    expect(splitBooksByRelease(books, NOW)).toEqual({
      available: [released, noDate],
      upcoming: [upcomingLater, upcomingSoon],
    });
  });

  it("finds the next upcoming and the latest released dates", () => {
    const books = [upcomingLater, released, releasedToday, upcomingSoon, noDate];

    expect(getNextReleaseDate(books, NOW)).toBe("2026-12-08");
    expect(getLatestReleaseDate(books, NOW)).toBe("2026-11-15");
    expect(getNextReleaseDate([released], NOW)).toBeNull();
    expect(getLatestReleaseDate([upcomingSoon], NOW)).toBeNull();
  });

  it("labels release dates for display", () => {
    expect(getReleaseLabel(upcomingSoon, NOW)).toBe(`Releases ${formatReleaseDate("2026-12-08")}`);
    expect(getReleaseLabel(released, NOW)).toBe(`Released ${formatReleaseDate("2026-03-03")}`);
    expect(getReleaseLabel(noDate, NOW)).toBeNull();
    expect(formatReleaseDate("2026-12-08")).toContain("2026");
    expect(formatReleaseDate("not a date")).toBeNull();
  });

  it("counts books behind each release filter option", () => {
    expect(
      countBooksByRelease([{ books: [released, upcomingSoon] }, { books: [noDate] }], NOW)
    ).toEqual({ all: 3, released: 2, upcoming: 1 });
  });
});

/**
 * Purpose: Build a provider book fixture with a release date.
 *
 * @param asin - Book ASIN.
 * @param releaseDate - Release date, or `null` when unknown.
 * @returns Provider book fixture.
 */
function buildBook(asin: string, releaseDate: string | null): ProviderSeriesBook {
  return {
    asin,
    title: asin,
    authors: [],
    narrators: [],
    releaseDate,
    series: [],
  };
}
