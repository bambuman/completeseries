import type {
  LocalBookEvidence,
  LocalSeriesEvidence,
  RegionCode,
} from "../../domain/audiobook";
import {
  buildListeningProgressIndex,
  summariseSeriesListening,
  type ListeningProgressIndex,
} from "../../domain/listeningProgress";
import type { ManualBookMatch } from "../../domain/manualBookMatches";
import {
  matchLocalSeriesToProviderSeries,
  rankProviderSeriesCandidates,
} from "../../domain/matching";
import { mergeMissingBookGroups } from "../../domain/missingGroupMerge";
import type { MissingBookGroup } from "../../domain/missingBooks";
import {
  fetchAudiobookshelfBooksForLibraries,
  fetchAudiobookshelfLibraries,
  fetchAudiobookshelfListeningProgress,
  fetchAudiobookshelfSeriesForLibraries,
  type AudiobookshelfAuthConfig,
  type AudiobookshelfClientConfig,
  type AudiobookshelfLibrary,
} from "../../integrations/audiobookshelf/audiobookshelfClient";
import {
  discoverProviderSeriesCandidates,
  getMetadataLookupAsins,
  type MetadataLookupMode,
} from "./metadataDiscovery";
import type { MetadataLookupAnchor } from "./lookupAnchors";
import type { ProviderDiscoveryTrace } from "./providerDiscoveryTrace";
import type {
  MetadataProviderId,
  MetadataProviderSearchMode,
} from "../../integrations/metadata/metadataProviderRegistry";
import { mergeLocalBookEvidence } from "./localBookEvidence";
import type { ManualSeriesMatch } from "./manualSeriesMatches";
import {
  buildLowConfidenceMissingGroup,
  buildMissingGroup,
} from "./missingGroupBuilder";
import { enrichLocalBooksWithProviderMetadata } from "./ownedMetadataEnrichment";
import { buildAuthenticatedConfig, filterSelectedLibraries } from "./scanSession";
import { discoverSeriesForSeriesLessBooks } from "./seriesLessBookDiscovery";
import {
  buildMatchedSeriesReport,
  buildUnresolvedSeriesReport,
  type SeriesScanReport,
} from "./seriesScanReport";
export {
  createScanSession,
  filterSelectedLibraries,
  loadSelectableLibraries,
  type AuthenticatedScanSession,
  type ScanConnectionOptions,
} from "./scanSession";
export { getMetadataLookupAsins } from "./metadataDiscovery";
export type { ManualSeriesMatch } from "./manualSeriesMatches";
export type { MetadataLookupMode } from "./metadataDiscovery";
export type {
  MetadataProviderId,
  MetadataProviderSearchMode,
} from "../../integrations/metadata/metadataProviderRegistry";
export type { SeriesScanReport } from "./seriesScanReport";

export type ScanOptions = AudiobookshelfAuthConfig & {
  serverUrl: string;
  availableLibraries?: AudiobookshelfLibrary[];
  selectedLibraryIds?: string[];
  region: RegionCode;
  includeSubSeries: boolean;
  discoverSeriesForSeriesLessBooks?: boolean;
  manualSeriesMatches?: ManualSeriesMatch[];
  metadataLookupMode: MetadataLookupMode;
  metadataProviderIds: MetadataProviderId[];
  metadataProviderSearchMode: MetadataProviderSearchMode;
  googleBooksApiKey?: string;
  onlyUnabridged: boolean;
  ignoreMultiBooks: boolean;
  ignoreNoPositionBooks: boolean;
  ignoreSubPositionBooks: boolean;
  ignoreFutureDateBooks: boolean;
  ignoreFuturePlaceholders: boolean;
  ignorePastDateBooks: boolean;
  ignoreTitleSubtitle: boolean;
  ignoreSameSeriesPosition: boolean;
  ignoreTitleSubtitleInMissingArray: boolean;
  ignoreSameSeriesPositionInMissingArray: boolean;
  matchNarratorEditions: boolean;
  cacheMetadata: boolean;
  manualBookMatches?: ManualBookMatch[];
};

export type UnresolvedSeries = {
  localSeries: LocalSeriesEvidence;
  attemptedAsins: string[];
  lookupAnchors?: MetadataLookupAnchor[];
  reason: string;
};

export type ScanResult = {
  librariesScanned: number;
  localSeriesCount: number;
  matchedSeriesCount: number;
  missingBookCount: number;
  lowConfidenceMissingGroups?: MissingBookGroup[];
  missingGroups: MissingBookGroup[];
  unresolvedSeries: UnresolvedSeries[];
  seriesReports: SeriesScanReport[];
};

/**
 * Purpose: Run a full missing-book scan against an Audiobookshelf server and
 * the configured metadata provider.
 *
 * @param options - Scan settings, including the Audiobookshelf server URL,
 * authentication method, Audible region, provider cache preference, and
 * missing-book filters.
 * @param progress - Optional callback that receives short status messages for
 * display in the UI while the scan is running.
 * @returns A summary of scanned libraries, matched and unresolved series, and
 * grouped missing-book results.
 */
export async function runLibraryScan(
  options: ScanOptions,
  progress?: (message: string) => void
): Promise<ScanResult> {
  progress?.("Authenticating with Audiobookshelf...");

  const authenticatedConfig = await buildAuthenticatedConfig(options);

  progress?.("Fetching Audiobookshelf libraries...");

  const availableLibraries =
    options.availableLibraries ?? (await fetchAudiobookshelfLibraries(authenticatedConfig));
  const libraries = filterSelectedLibraries(availableLibraries, options.selectedLibraryIds);

  if (libraries.length === 0) throw new Error("No audiobook libraries were found.");

  const audiobookshelfSeries = await fetchAudiobookshelfSeriesForLibraries(
    authenticatedConfig,
    libraries,
    progress
  );

  const localLibraryBooks = await fetchAudiobookshelfBooksForLibraries(
    authenticatedConfig,
    libraries,
    progress
  );
  const localSeries = options.discoverSeriesForSeriesLessBooks
    ? [
        ...audiobookshelfSeries,
        ...(await discoverSeriesForSeriesLessBooks(
          audiobookshelfSeries,
          localLibraryBooks,
          options,
          progress
        )),
      ]
    : audiobookshelfSeries;
  const listeningProgress = await loadListeningProgress(authenticatedConfig, progress);
  const allLocalBooks = mergeLocalBookEvidence([
    ...localSeries.flatMap((series) => series.books),
    ...localLibraryBooks,
  ]);
  const lowConfidenceMissingGroups: MissingBookGroup[] = [];
  const missingGroups: MissingBookGroup[] = [];
  const unresolvedSeries: UnresolvedSeries[] = [];
  const seriesReports: SeriesScanReport[] = [];
  let enrichedOwnershipBooks: LocalBookEvidence[] = [];
  let matchedSeriesCount = 0;

  for (let seriesIndex = 0; seriesIndex < localSeries.length; seriesIndex += 1) {
    const series = localSeries[seriesIndex];
    const attemptedAsins = getMetadataLookupAsins(series.books, options.metadataLookupMode);
    const lookupAnchors: MetadataLookupAnchor[] = [];
    const providerTraces: ProviderDiscoveryTrace[] = [];

    /**
     * Purpose: Report progress for the current series while preserving the
     * overall scan position in the message.
     *
     * @param message - Series-specific progress detail.
     * @returns Nothing. The optional caller callback receives the message.
     */
    const seriesProgress = (message: string) =>
      progress?.(
        `Checking metadata ${seriesIndex + 1} / ${localSeries.length}: ${series.name} — ${message}`
      );

    seriesProgress("starting");

    const candidates = await discoverProviderSeriesCandidates(
      series,
      options,
      seriesProgress,
      attemptedAsins,
      lookupAnchors,
      providerTraces
    );
    seriesProgress(`matching ${formatCount(candidates.length, "candidate")}`);
    const candidateMatches = rankProviderSeriesCandidates(series, candidates);
    const match = matchLocalSeriesToProviderSeries(series, candidates);

    if (match.status !== "matched" || !match.providerSeries) {
      const ownershipBooks = mergeLocalBookEvidence([...enrichedOwnershipBooks, ...allLocalBooks]);
      const lowConfidenceGroup = buildLowConfidenceMissingGroup(
        candidateMatches,
        ownershipBooks,
        options
      );
      const unresolved = {
        localSeries: series,
        attemptedAsins,
        lookupAnchors,
        reason: match.reason,
      };

      if (lowConfidenceGroup) {
        lowConfidenceMissingGroups.push(
          withListeningStatus(lowConfidenceGroup, series.books, listeningProgress)
        );
      }
      unresolvedSeries.push(unresolved);
      seriesReports.push(
        buildUnresolvedSeriesReport(
          match,
          attemptedAsins,
          candidateMatches,
          lookupAnchors,
          providerTraces
        )
      );
      continue;
    }

    matchedSeriesCount += 1;
    seriesProgress(`checking ${formatCount(match.providerSeries.books.length, "provider book")}`);
    let ownershipBooks = mergeLocalBookEvidence([...enrichedOwnershipBooks, ...allLocalBooks]);
    let missingGroup = buildMissingGroup(match, ownershipBooks, options);

    if (missingGroup.books.length > 0) {
      const enrichedLocalBooks = await enrichLocalBooksWithProviderMetadata(
        allLocalBooks,
        options,
        seriesProgress,
        missingGroup.books
      );

      if (enrichedLocalBooks.length > 0) {
        enrichedOwnershipBooks = mergeLocalBookEvidence([
          ...enrichedLocalBooks,
          ...enrichedOwnershipBooks,
        ]);
        ownershipBooks = mergeLocalBookEvidence([...enrichedOwnershipBooks, ...allLocalBooks]);
        missingGroup = buildMissingGroup(match, ownershipBooks, options);
      }
    }

    seriesReports.push(
      buildMatchedSeriesReport(
        match,
        attemptedAsins,
        missingGroup,
        candidateMatches,
        lookupAnchors,
        providerTraces
      )
    );
    if (missingGroup.books.length > 0) {
      missingGroups.push(withListeningStatus(missingGroup, series.books, listeningProgress));
    }
  }

  const mergedMissingGroups = mergeMissingBookGroups(missingGroups);
  const mergedLowConfidenceMissingGroups = mergeMissingBookGroups(lowConfidenceMissingGroups);

  return {
    librariesScanned: libraries.length,
    localSeriesCount: localSeries.length,
    matchedSeriesCount,
    lowConfidenceMissingGroups: mergedLowConfidenceMissingGroups,
    missingBookCount: mergedMissingGroups.reduce((total, group) => total + group.books.length, 0),
    missingGroups: mergedMissingGroups,
    unresolvedSeries,
    seriesReports,
  };
}

/**
 * Purpose: Load the user's listening progress without letting a failure stop
 * the scan.
 *
 * @param config - Authenticated Audiobookshelf connection settings.
 * @param progress - Optional status callback.
 * @returns Listening progress keyed by library item id, or an empty index when
 * it could not be loaded.
 */
async function loadListeningProgress(
  config: AudiobookshelfClientConfig,
  progress?: (message: string) => void
): Promise<ListeningProgressIndex> {
  progress?.("Fetching listening progress...");

  try {
    return buildListeningProgressIndex(await fetchAudiobookshelfListeningProgress(config));
  } catch {
    progress?.("Listening progress is unavailable; continuing without it.");
    return new Map();
  }
}

/**
 * Purpose: Attach the series listening status to a result group.
 *
 * @param group - Missing-book group for one local series.
 * @param books - Owned books of that local series.
 * @param index - Listening progress keyed by library item id.
 * @returns The same group, with `listening` set when the user has started or
 * finished any owned book of the series.
 */
function withListeningStatus(
  group: MissingBookGroup,
  books: LocalBookEvidence[],
  index: ListeningProgressIndex
): MissingBookGroup {
  const listening = summariseSeriesListening(books, index);
  return listening ? { ...group, listening } : group;
}

/**
 * Purpose: Format progress counts without awkward plural text.
 *
 * @param count - Number of items.
 * @param singularLabel - Label to use when the count is one.
 * @returns Human-readable count and label.
 */
function formatCount(count: number, singularLabel: string): string {
  return `${count} ${singularLabel}${count === 1 ? "" : "s"}`;
}
