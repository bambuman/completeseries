import type {
  LocalBookEvidence,
  LocalSeriesEvidence,
  ProviderSeriesBook,
} from "../../domain/audiobook";
import { normaliseIdentifier, normaliseText, parseSeriesPosition } from "../../domain/normalise";
import { getMetadataProvidersById } from "../../integrations/metadata/metadataProviderRegistry";
import type { MetadataDiscoveryOptions } from "./metadataDiscoveryTypes";

/**
 * Purpose: Build local series for Audiobookshelf books that have an ASIN but
 * no series metadata, using the series the metadata provider lists for each
 * book, so those series can be scanned like any other local series.
 *
 * @param localSeries - Series already returned by Audiobookshelf.
 * @param libraryBooks - Every book item returned by Audiobookshelf.
 * @param options - Scan settings that control providers, region, subseries
 * handling, and cache usage.
 * @param progress - Optional callback for lookup status messages.
 * @returns Extra local series built from series-less books. Series that
 * Audiobookshelf already lists are left out because they are scanned anyway.
 */
export async function discoverSeriesForSeriesLessBooks(
  localSeries: LocalSeriesEvidence[],
  libraryBooks: LocalBookEvidence[],
  options: MetadataDiscoveryOptions,
  progress?: (message: string) => void
): Promise<LocalSeriesEvidence[]> {
  const seriesLessBooks = findSeriesLessBooks(localSeries, libraryBooks);
  const knownSeriesNames = new Set(localSeries.map((series) => normaliseText(series.name)));
  const discoveredSeries = new Map<string, LocalSeriesEvidence>();

  for (let bookIndex = 0; bookIndex < seriesLessBooks.length; bookIndex += 1) {
    const localBook = seriesLessBooks[bookIndex];
    progress?.(
      `Looking up series for books without series metadata ${bookIndex + 1} / ${seriesLessBooks.length}...`
    );

    const providerBook = await getProviderBookForAsin(localBook, options);
    const seriesEntries = (providerBook?.series ?? []).filter((seriesEntry) =>
      normaliseText(seriesEntry.name)
    );
    const selectedEntries = options.includeSubSeries ? seriesEntries : seriesEntries.slice(0, 1);

    for (const seriesEntry of selectedEntries) {
      const seriesNameKey = normaliseText(seriesEntry.name);
      if (knownSeriesNames.has(seriesNameKey)) continue;

      const seriesKey = normaliseIdentifier(seriesEntry.asin) || seriesNameKey;
      const series = discoveredSeries.get(seriesKey) ?? {
        id: `series-less:${seriesKey}`,
        name: seriesEntry.name,
        books: [],
      };

      series.books.push({
        ...localBook,
        seriesNames: [seriesEntry.name],
        position: parseSeriesPosition(seriesEntry.position),
      });
      discoveredSeries.set(seriesKey, series);
    }
  }

  return [...discoveredSeries.values()];
}

/**
 * Purpose: Find Audiobookshelf books that can be looked up by ASIN but are
 * not part of any Audiobookshelf series.
 *
 * @param localSeries - Series already returned by Audiobookshelf.
 * @param libraryBooks - Every book item returned by Audiobookshelf.
 * @returns Books with a usable ASIN, no series metadata, and no copy in a
 * listed series, de-duplicated by ASIN.
 */
function findSeriesLessBooks(
  localSeries: LocalSeriesEvidence[],
  libraryBooks: LocalBookEvidence[]
): LocalBookEvidence[] {
  const seriesAsins = new Set(
    localSeries.flatMap((series) => series.books.map((book) => normaliseIdentifier(book.asin)))
  );
  const booksByAsin = new Map<string, LocalBookEvidence>();

  for (const book of libraryBooks) {
    const asin = normaliseIdentifier(book.asin);
    if (!isUsableAsin(asin) || seriesAsins.has(asin) || booksByAsin.has(asin)) continue;
    if ((book.seriesNames ?? []).some((seriesName) => normaliseText(seriesName))) continue;

    booksByAsin.set(asin, book);
  }

  return [...booksByAsin.values()];
}

/**
 * Purpose: Fetch provider metadata for one local ASIN from the first selected
 * provider that returns it.
 *
 * @param localBook - Local book containing the ASIN to look up.
 * @param options - Scan settings that control providers, region, and cache.
 * @returns Provider book metadata, or `null` when no provider returns it.
 */
async function getProviderBookForAsin(
  localBook: LocalBookEvidence,
  options: MetadataDiscoveryOptions
): Promise<ProviderSeriesBook | null> {
  for (const metadataProvider of getMetadataProvidersById(options.metadataProviderIds)) {
    if (!metadataProvider.capabilities.supportsBookLookup) continue;

    try {
      const providerBook = await metadataProvider.getBookByAsin({
        asin: localBook.asin ?? "",
        region: options.region,
        cache: options.cacheMetadata,
        googleBooksApiKey: options.googleBooksApiKey,
      });

      if (providerBook) return providerBook;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Purpose: Reject empty and placeholder ASIN values before provider lookups.
 *
 * @param asin - Normalised ASIN value.
 * @returns `true` when the ASIN can be sent to a provider.
 */
function isUsableAsin(asin: string): boolean {
  return Boolean(asin) && asin !== normaliseIdentifier("Unknown ASIN");
}
