import type { ProviderSeriesBook, RegionCode } from "../../domain/audiobook";
import { findManualBookMatch, type ManualBookMatch } from "../../domain/manualBookMatches";
import type { MissingBookGroup } from "../../domain/missingBooks";
import { normaliseText, parseSeriesPosition } from "../../domain/normalise";
import { isHiddenBook, isHiddenSeries, type HiddenItem } from "../storage/hiddenItemsStore";
import {
  filterBooksByRelease,
  getLatestReleaseDate,
  getNextReleaseDate,
  type ResultsReleaseFilter,
} from "./releaseStatus";

export type VisibleMissingBookGroup = MissingBookGroup & {
  isHidden: boolean;
};

export type ResultsSortOrder =
  | "seriesAsc"
  | "seriesDesc"
  | "authorAsc"
  | "authorDesc"
  | "missingDesc"
  | "missingAsc"
  | "releaseNext"
  | "releaseNewest"
  | "listenedRecent"
  | "scanOrder";

/**
 * Purpose: Apply hidden item state to scan result groups.
 *
 * @param groups - Missing-book groups from the completed scan.
 * @param hiddenItems - Hidden books and series saved locally.
 * @param manualBookMatches - Books the user manually marked as already owned.
 * @param region - Region used by the completed scan.
 * @param showHiddenItems - Whether hidden books and series should remain
 * visible in the result output.
 * @param sortOrder - Display ordering for visible series groups.
 * @param releaseFilter - Whether to show all, only released, or only upcoming
 * books. Groups left without books are removed.
 * @param now - Current date, supplied by tests when needed.
 * @returns Missing-book groups filtered for current visibility settings.
 */
export function buildVisibleMissingGroups(
  groups: MissingBookGroup[],
  hiddenItems: HiddenItem[],
  manualBookMatches: ManualBookMatch[],
  region: RegionCode,
  showHiddenItems: boolean,
  sortOrder: ResultsSortOrder = "seriesAsc",
  releaseFilter: ResultsReleaseFilter = "all",
  now = new Date()
): VisibleMissingBookGroup[] {
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      books: filterBooksByRelease(group.books, releaseFilter, now),
    }))
    .filter((group) => group.books.length > 0)
    .map((group) => {
      const groupIsHidden = isHiddenSeries(hiddenItems, group);
      const visibleBooks = showHiddenItems
        ? group.books
        : group.books.filter(
            (book) =>
              !isHiddenBook(hiddenItems, group, book) &&
              !findManualBookMatch(book, buildProviderSeriesReference(group), region, manualBookMatches)
          );

      return {
        ...group,
        books: sortBooksBySeriesPosition(visibleBooks, group),
        isHidden: groupIsHidden,
      };
    })
    .filter((group) => showHiddenItems || (!group.isHidden && group.books.length > 0));

  return sortVisibleGroups(visibleGroups, sortOrder, now);
}

/**
 * Purpose: Build the provider-series shape needed for manual owned-book checks
 * from a visible missing-book group.
 *
 * @param group - Missing-book group currently being filtered.
 * @returns Provider-series reference for manual match comparison.
 */
function buildProviderSeriesReference(group: MissingBookGroup) {
  return {
    name: group.seriesName,
    seriesAsin: group.seriesAsin,
    providerId: group.providerId ?? "audible",
    providerName: group.providerName ?? "Audible catalogue",
  };
}

/**
 * Purpose: Sort visible result groups for display without mutating the scan
 * result stored in memory.
 *
 * @param groups - Visible groups after hidden-item filtering.
 * @param sortOrder - Requested display sort order.
 * @param now - Current date used by release-date ordering.
 * @returns A sorted copy of the visible groups.
 */
function sortVisibleGroups(
  groups: VisibleMissingBookGroup[],
  sortOrder: ResultsSortOrder,
  now: Date
): VisibleMissingBookGroup[] {
  if (sortOrder === "scanOrder") return groups;

  return [...groups].sort((first, second) => {
    if (sortOrder === "releaseNext") {
      return (
        compareByReleaseDate(
          getNextReleaseDate(first.books, now),
          getNextReleaseDate(second.books, now),
          "earliest"
        ) || compareText(first.seriesName, second.seriesName)
      );
    }

    if (sortOrder === "releaseNewest") {
      return (
        compareByReleaseDate(
          getLatestReleaseDate(first.books, now),
          getLatestReleaseDate(second.books, now),
          "latest"
        ) || compareText(first.seriesName, second.seriesName)
      );
    }

    if (sortOrder === "listenedRecent") {
      return (
        compareByLastListened(first, second) || compareText(first.seriesName, second.seriesName)
      );
    }

    if (sortOrder === "missingDesc") {
      return (
        second.books.length - first.books.length || compareText(first.seriesName, second.seriesName)
      );
    }

    if (sortOrder === "missingAsc") {
      return (
        first.books.length - second.books.length || compareText(first.seriesName, second.seriesName)
      );
    }

    if (sortOrder === "authorAsc") {
      return compareByPrimaryAuthor(first, second);
    }

    if (sortOrder === "authorDesc") {
      return compareByPrimaryAuthor(second, first);
    }

    if (sortOrder === "seriesDesc") {
      return compareText(second.seriesName, first.seriesName);
    }

    return compareText(first.seriesName, second.seriesName);
  });
}

/**
 * Purpose: Compare two optional `YYYY-MM-DD` dates, keeping groups without a
 * date after groups that have one.
 *
 * @param firstDate - First group's date, or `null`.
 * @param secondDate - Second group's date, or `null`.
 * @param direction - `earliest` puts sooner dates first, `latest` puts more
 * recent dates first.
 * @returns Standard sort comparison value.
 */
function compareByReleaseDate(
  firstDate: string | null,
  secondDate: string | null,
  direction: "earliest" | "latest"
): number {
  if (firstDate && secondDate) {
    return direction === "earliest"
      ? firstDate.localeCompare(secondDate)
      : secondDate.localeCompare(firstDate);
  }

  if (firstDate) return -1;
  if (secondDate) return 1;
  return 0;
}

/**
 * Purpose: Order groups by when the user last listened to a book in the series,
 * most recent first, with series the user has not started last.
 *
 * @param first - First visible result group to compare.
 * @param second - Second visible result group to compare.
 * @returns Standard sort comparison value.
 */
function compareByLastListened(
  first: VisibleMissingBookGroup,
  second: VisibleMissingBookGroup
): number {
  const firstTime = first.listening ? (first.listening.lastListenedAt ?? 0) : -1;
  const secondTime = second.listening ? (second.listening.lastListenedAt ?? 0) : -1;
  return secondTime - firstTime;
}

/**
 * Purpose: Keep only result groups for series the user has finished or started
 * a book in.
 *
 * @param groups - Missing-book groups.
 * @returns Groups that carry listening progress.
 */
export function filterListeningGroups<T extends MissingBookGroup>(groups: T[]): T[] {
  return groups.filter((group) => Boolean(group.listening));
}

/**
 * Purpose: Sort result groups by the first useful author attached to their
 * visible missing books.
 *
 * @param first - First visible result group to compare.
 * @param second - Second visible result group to compare.
 * @returns Standard sort comparison with series name as the tie-breaker.
 */
function compareByPrimaryAuthor(
  first: VisibleMissingBookGroup,
  second: VisibleMissingBookGroup
): number {
  return (
    compareText(getPrimaryAuthor(first), getPrimaryAuthor(second)) ||
    compareText(first.seriesName, second.seriesName)
  );
}

/**
 * Purpose: Find a stable author label for a visible result group.
 *
 * @param group - Visible result group whose books may contain author metadata.
 * @returns The first non-empty author from the group's visible books, or an
 * empty string when no author metadata is available.
 */
function getPrimaryAuthor(group: VisibleMissingBookGroup): string {
  for (const book of group.books) {
    const author = book.authors.find((authorName) => normaliseText(authorName));
    if (author) return author;
  }

  return "";
}

/**
 * Purpose: Sort books within a visible series by the provider position shown to
 * the user, falling back to title when position metadata is missing.
 *
 * @param books - Visible missing books for one series group.
 * @param group - Series group that provides the matched series identity.
 * @returns A sorted copy of the visible books.
 */
function sortBooksBySeriesPosition(
  books: ProviderSeriesBook[],
  group: MissingBookGroup
): ProviderSeriesBook[] {
  return [...books].sort((first, second) => {
    const firstPosition = getBookGroupPosition(first, group);
    const secondPosition = getBookGroupPosition(second, group);

    if (firstPosition.numeric !== null && secondPosition.numeric !== null) {
      return firstPosition.numeric - secondPosition.numeric || compareText(first.title, second.title);
    }

    if (firstPosition.numeric !== null) return -1;
    if (secondPosition.numeric !== null) return 1;

    if (firstPosition.raw && secondPosition.raw) {
      return (
        compareText(firstPosition.raw, secondPosition.raw) || compareText(first.title, second.title)
      );
    }

    if (firstPosition.raw) return -1;
    if (secondPosition.raw) return 1;

    return compareText(first.title, second.title);
  });
}

/**
 * Purpose: Find the provider-series position that belongs to the visible result
 * group rather than another crossover series on the same book.
 *
 * @param book - Provider book being sorted.
 * @param group - Visible result group containing the book.
 * @returns Parsed series position for the matching group.
 */
function getBookGroupPosition(book: ProviderSeriesBook, group: MissingBookGroup) {
  const matchingSeries =
    book.series.find((series) => series.asin && series.asin === group.seriesAsin) ??
    book.series.find(
      (series) => normaliseText(series.name) === normaliseText(group.seriesName)
    ) ??
    book.series[0];

  return parseSeriesPosition(matchingSeries?.position);
}

/**
 * Purpose: Compare display text consistently for human-facing alphabetical
 * ordering.
 *
 * @param firstValue - First text value to compare.
 * @param secondValue - Second text value to compare.
 * @returns Standard sort comparison result.
 */
function compareText(
  firstValue: string | null | undefined,
  secondValue: string | null | undefined
): number {
  return (firstValue ?? "").localeCompare(secondValue ?? "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Purpose: Count how many scanned missing result entries are currently hidden.
 *
 * @param groups - Missing-book groups from the completed scan.
 * @param hiddenItems - Hidden books and series saved locally.
 * @returns Counts of hidden series and books represented in the current result.
 */
export function countHiddenResultItems(
  groups: MissingBookGroup[],
  hiddenItems: HiddenItem[]
): { series: number; books: number } {
  return {
    series: groups.filter((group) => isHiddenSeries(hiddenItems, group)).length,
    books: groups.reduce(
      (total, group) =>
        total + group.books.filter((book) => isHiddenBook(hiddenItems, group, book)).length,
      0
    ),
  };
}
