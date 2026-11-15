import type { LocalBookEvidence, LocalSeriesEvidence } from "../../domain/audiobook";
import type { ListeningProgressEntry } from "../../domain/listeningProgress";
import {
  mapAudiobookshelfSeriesResponse,
  mapLibraryItemToLocalBook,
} from "./audiobookshelfMappers";
import {
  buildAudiobookshelfUrl,
  buildHttpStatusError,
  fetchAudiobookshelfResponse,
  readAudiobookshelfJson,
} from "./audiobookshelfRequest";
import type {
  AudiobookshelfClientConfig,
  AudiobookshelfItemsResponse,
  AudiobookshelfLibrariesResponse,
  AudiobookshelfLibrary,
  AudiobookshelfLoginResponse,
  AudiobookshelfMeResponse,
  AudiobookshelfSeriesResponse,
} from "./audiobookshelfTypes";

export type {
  AudiobookshelfAuthConfig,
  AudiobookshelfClientConfig,
  AudiobookshelfLibrary,
  AudiobookshelfLibrariesResponse,
  AudiobookshelfLoginResponse,
  AudiobookshelfSeriesResponse,
} from "./audiobookshelfTypes";
export { mapAudiobookshelfSeriesResponse } from "./audiobookshelfMappers";

/**
 * Purpose: Fetch audiobook libraries from Audiobookshelf.
 *
 * @param config - Audiobookshelf connection settings, including the base URL
 * and either an API key or username/password credentials.
 * @returns Audiobookshelf libraries whose media type is `book`.
 */
export async function fetchAudiobookshelfLibraries(
  config: AudiobookshelfClientConfig
): Promise<AudiobookshelfLibrary[]> {
  const authToken = await resolveAuthToken(config);
  const response = await fetchAudiobookshelfResponse(
    buildAudiobookshelfUrl(config.baseUrl, "/api/libraries"),
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    },
    config.baseUrl,
    "libraries"
  );

  if (!response.ok) throw await buildHttpStatusError(response, "libraries");

  const payload = await readAudiobookshelfJson<AudiobookshelfLibrariesResponse>(
    response,
    "libraries"
  );
  return (payload.libraries ?? []).filter((library) => library.mediaType === "book");
}

/**
 * Purpose: Fetch all series and book metadata for the selected Audiobookshelf
 * libraries.
 *
 * @param config - Audiobookshelf connection settings, including the base URL
 * and either an API key or username/password credentials.
 * @param libraries - Audiobookshelf libraries to scan for series.
 * @param progress - Optional callback that receives status messages while each
 * library is being fetched.
 * @returns Local series evidence mapped into the provider-agnostic domain
 * shape used by the matching code.
 */
export async function fetchAudiobookshelfSeriesForLibraries(
  config: AudiobookshelfClientConfig,
  libraries: AudiobookshelfLibrary[],
  progress?: (message: string) => void
): Promise<LocalSeriesEvidence[]> {
  const localSeries: LocalSeriesEvidence[] = [];
  const authToken = await resolveAuthToken(config);

  for (const library of libraries) {
    progress?.(`Fetching series from ${library.name}...`);

    let page = 0;
    let fetchedCount = 0;
    let total = Number.POSITIVE_INFINITY;

    while (fetchedCount < total) {
      const url = buildAudiobookshelfUrl(
        config.baseUrl,
        `/api/libraries/${encodeURIComponent(library.id)}/series`
      );
      url.searchParams.set("limit", "100");
      url.searchParams.set("page", String(page));

      const response = await fetchAudiobookshelfResponse(
        url,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${authToken}`,
          },
        },
        config.baseUrl,
        "series"
      );

      if (!response.ok) throw await buildHttpStatusError(response, "series");

      const payload = await readAudiobookshelfJson<AudiobookshelfSeriesResponse>(
        response,
        "series"
      );
      const pageSeries = mapAudiobookshelfSeriesResponse(payload, library.id);
      localSeries.push(...pageSeries);

      const rawResults = payload.results ?? [];
      fetchedCount += rawResults.length;
      total = Number.isFinite(payload.total) ? Number(payload.total) : fetchedCount;

      if (rawResults.length === 0) break;
      page += 1;
    }
  }

  return localSeries;
}

/**
 * Purpose: Fetch every book item in the selected Audiobookshelf libraries so
 * ownership checks can see books even when series metadata is incomplete.
 *
 * @param config - Audiobookshelf connection settings, including the base URL
 * and either an API key or username/password credentials.
 * @param libraries - Audiobookshelf libraries to scan for book items.
 * @param progress - Optional callback that receives status messages while each
 * library is being fetched.
 * @returns Local book evidence for every fetched library item.
 */
export async function fetchAudiobookshelfBooksForLibraries(
  config: AudiobookshelfClientConfig,
  libraries: AudiobookshelfLibrary[],
  progress?: (message: string) => void
): Promise<LocalBookEvidence[]> {
  const localBooks: LocalBookEvidence[] = [];
  const authToken = await resolveAuthToken(config);

  for (const library of libraries) {
    progress?.(`Fetching books from ${library.name}...`);

    let page = 0;
    let fetchedCount = 0;
    let total = Number.POSITIVE_INFINITY;

    while (fetchedCount < total) {
      const url = buildAudiobookshelfUrl(
        config.baseUrl,
        `/api/libraries/${encodeURIComponent(library.id)}/items`
      );
      url.searchParams.set("limit", "100");
      url.searchParams.set("page", String(page));
      url.searchParams.set("minified", "0");

      const response = await fetchAudiobookshelfResponse(
        url,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${authToken}`,
          },
        },
        config.baseUrl,
        "books"
      );

      if (!response.ok) throw await buildHttpStatusError(response, "books");

      const payload = await readAudiobookshelfJson<AudiobookshelfItemsResponse>(response, "books");
      const pageItems = payload.results ?? [];
      localBooks.push(...pageItems.map((item, index) => mapLibraryItemToLocalBook(item, index)));

      fetchedCount += pageItems.length;
      total = Number.isFinite(payload.total) ? Number(payload.total) : fetchedCount;

      if (pageItems.length === 0) break;
      page += 1;
    }
  }

  return localBooks;
}

/**
 * Purpose: Fetch the signed-in user's listening progress, so results can show
 * which series the user has already started.
 *
 * @param config - Audiobookshelf connection settings, including the base URL
 * and either an API key or username/password credentials.
 * @returns Book listening progress for the user who owns the credentials.
 * Podcast episode progress is left out.
 */
export async function fetchAudiobookshelfListeningProgress(
  config: AudiobookshelfClientConfig
): Promise<ListeningProgressEntry[]> {
  const authToken = await resolveAuthToken(config);
  const response = await fetchAudiobookshelfResponse(
    buildAudiobookshelfUrl(config.baseUrl, "/api/me"),
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    },
    config.baseUrl,
    "progress"
  );

  if (!response.ok) throw await buildHttpStatusError(response, "progress");

  const payload = await readAudiobookshelfJson<AudiobookshelfMeResponse>(response, "progress");
  return (payload.mediaProgress ?? [])
    .filter((entry) => entry.libraryItemId && !entry.episodeId)
    .map((entry) => ({
      libraryItemId: String(entry.libraryItemId),
      isFinished: entry.isFinished === true,
      progress: Number(entry.progress) || 0,
      lastUpdate: Number.isFinite(entry.lastUpdate) ? Number(entry.lastUpdate) : null,
    }));
}

/**
 * Purpose: Resolve either supported Audiobookshelf login method into a bearer
 * token that can be sent to the Audiobookshelf API.
 *
 * @param config - Audiobookshelf connection settings. API-key mode returns the
 * key unchanged; password mode posts the username and password to `/login`.
 * @returns An Audiobookshelf bearer token.
 */
export async function resolveAuthToken(config: AudiobookshelfClientConfig): Promise<string> {
  if (config.mode === "apiKey") return config.apiKey;

  const response = await fetchAudiobookshelfResponse(
    buildAudiobookshelfUrl(config.baseUrl, "/login"),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: config.username,
        password: config.password,
      }),
    },
    config.baseUrl,
    "login"
  );

  if (!response.ok) throw await buildHttpStatusError(response, "login");

  const payload = await readAudiobookshelfJson<AudiobookshelfLoginResponse>(response, "login");
  const token = payload.user?.token;

  if (!token) {
    throw new Error(
      "Audiobookshelf login responded, but no auth token was returned. Check that this is an Audiobookshelf server, that the server version is supported, and that the login endpoint is not being rewritten by a proxy."
    );
  }

  return token;
}
