import type { ProviderSeriesBook } from "../../domain/audiobook";
import { isFutureReleaseDate } from "../../domain/providerBookChecks";

export type ResultsReleaseFilter = "all" | "released" | "upcoming";

export const RESULTS_RELEASE_FILTERS: ResultsReleaseFilter[] = ["all", "released", "upcoming"];

/**
 * Purpose: Decide whether a provider book is announced but not released yet.
 *
 * @param book - Provider book shown in the results.
 * @param now - Current date, supplied by tests when needed.
 * @returns `true` when the book has a release date after today.
 */
export function isUpcomingBook(book: ProviderSeriesBook, now = new Date()): boolean {
  return isFutureReleaseDate(book.releaseDate, now);
}

/**
 * Purpose: Keep only the books that match the selected release filter.
 *
 * @param books - Provider books for one result group.
 * @param releaseFilter - Selected release filter.
 * @param now - Current date, supplied by tests when needed.
 * @returns Books that are released, upcoming, or all books. Books without a
 * release date count as released.
 */
export function filterBooksByRelease(
  books: ProviderSeriesBook[],
  releaseFilter: ResultsReleaseFilter,
  now = new Date()
): ProviderSeriesBook[] {
  if (releaseFilter === "all") return books;

  const wantUpcoming = releaseFilter === "upcoming";
  return books.filter((book) => isUpcomingBook(book, now) === wantUpcoming);
}

/**
 * Purpose: Split a result group's books into available and upcoming lists
 * while keeping their existing order.
 *
 * @param books - Provider books for one result group.
 * @param now - Current date, supplied by tests when needed.
 * @returns Books that can be bought now and books that are not released yet.
 */
export function splitBooksByRelease(
  books: ProviderSeriesBook[],
  now = new Date()
): { available: ProviderSeriesBook[]; upcoming: ProviderSeriesBook[] } {
  const available: ProviderSeriesBook[] = [];
  const upcoming: ProviderSeriesBook[] = [];

  for (const book of books) {
    (isUpcomingBook(book, now) ? upcoming : available).push(book);
  }

  return { available, upcoming };
}

/**
 * Purpose: Count the books behind each release filter option.
 *
 * @param groups - Result groups whose books should be counted.
 * @param now - Current date, supplied by tests when needed.
 * @returns Book counts for all, released, and upcoming books.
 */
export function countBooksByRelease(
  groups: Array<{ books: ProviderSeriesBook[] }>,
  now = new Date()
): Record<ResultsReleaseFilter, number> {
  const books = groups.flatMap((group) => group.books);
  const upcoming = books.filter((book) => isUpcomingBook(book, now)).length;

  return { all: books.length, released: books.length - upcoming, upcoming };
}

/**
 * Purpose: Find the soonest release date among a group's upcoming books.
 *
 * @param books - Provider books for one result group.
 * @param now - Current date, supplied by tests when needed.
 * @returns The earliest future release date as `YYYY-MM-DD`, or `null`.
 */
export function getNextReleaseDate(books: ProviderSeriesBook[], now = new Date()): string | null {
  return pickReleaseDate(books.filter((book) => isUpcomingBook(book, now)), "earliest");
}

/**
 * Purpose: Find the most recent release date among a group's released books.
 *
 * @param books - Provider books for one result group.
 * @param now - Current date, supplied by tests when needed.
 * @returns The latest past release date as `YYYY-MM-DD`, or `null`.
 */
export function getLatestReleaseDate(
  books: ProviderSeriesBook[],
  now = new Date()
): string | null {
  return pickReleaseDate(books.filter((book) => !isUpcomingBook(book, now)), "latest");
}

/**
 * Purpose: Describe a book's release date for display under its title.
 *
 * @param book - Provider book shown in the results.
 * @param now - Current date, supplied by tests when needed.
 * @returns `Releases <date>` for upcoming books, `Released <date>` for
 * released books, or `null` when no usable release date exists.
 */
export function getReleaseLabel(book: ProviderSeriesBook, now = new Date()): string | null {
  const formattedDate = formatReleaseDate(book.releaseDate);
  if (!formattedDate) return null;

  return `${isUpcomingBook(book, now) ? "Releases" : "Released"} ${formattedDate}`;
}

/**
 * Purpose: Format a provider release date for display in the viewer's locale.
 *
 * @param releaseDate - Provider release date, usually `YYYY-MM-DD`.
 * @returns A short date such as `Dec 8, 2026`, or `null` for missing or
 * unparseable dates.
 */
export function formatReleaseDate(releaseDate: string | null | undefined): string | null {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(releaseDate?.trim() ?? "");
  if (!dateParts) return null;

  const [, year, month, day] = dateParts;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Purpose: Pick the earliest or latest `YYYY-MM-DD` release date from books.
 *
 * @param books - Books whose release dates should be compared.
 * @param direction - Whether to return the earliest or latest date.
 * @returns The selected date-only string, or `null` when no book has one.
 */
function pickReleaseDate(
  books: ProviderSeriesBook[],
  direction: "earliest" | "latest"
): string | null {
  const dates = books
    .map((book) => /^\d{4}-\d{2}-\d{2}/.exec(book.releaseDate?.trim() ?? "")?.[0])
    .filter((date): date is string => Boolean(date))
    .sort();

  return (direction === "earliest" ? dates[0] : dates.at(-1)) ?? null;
}
