import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultScanFilters } from "../../app/setup/scanFormTypes";
import type { LocalBookEvidence, LocalSeriesEvidence } from "../../domain/audiobook";
import { matchLocalSeriesToProviderSeries } from "../../domain/matching";
import { parseSeriesPosition } from "../../domain/normalise";
import { discoverProviderSeriesCandidates } from "./metadataDiscovery";
import { buildMissingGroup } from "./missingGroupBuilder";
import type { ScanOptions } from "./runLibraryScan";
import { discoverSeriesForSeriesLessBooks } from "./seriesLessBookDiscovery";

const options: ScanOptions = {
  ...defaultScanFilters,
  serverUrl: "https://abs.example.com",
  mode: "apiKey",
  apiKey: "test-key",
  metadataProviderIds: ["audible"],
  region: "us",
  cacheMetadata: false,
};

type ProductFixture = {
  asin: string;
  title: string;
  series?: Array<{ asin: string; title: string; sequence: string }>;
};

const PRODUCTS: ProductFixture[] = [
  {
    asin: "B0CHICKEN1",
    title: "Beware of Chicken",
    series: [{ asin: "B0SERIESBOC", title: "Beware of Chicken", sequence: "1" }],
  },
  {
    asin: "B0CHICKEN2",
    title: "Beware of Chicken 2",
    series: [{ asin: "B0SERIESBOC", title: "Beware of Chicken", sequence: "2" }],
  },
  {
    asin: "B0CHICKEN3",
    title: "Beware of Chicken 3",
    series: [{ asin: "B0SERIESBOC", title: "Beware of Chicken", sequence: "3" }],
  },
  {
    asin: "B0OMNIBUS1",
    title: "Omnibus Book",
    series: [
      { asin: "B0SERIESMAIN", title: "Main Series", sequence: "4" },
      { asin: "B0SERIESSUB", title: "Sub Series", sequence: "1" },
    ],
  },
  {
    asin: "B0LISTED01",
    title: "Listed Series Book",
    series: [{ asin: "B0SERIESLISTED", title: "Listed Series", sequence: "2" }],
  },
  { asin: "B0STANDALONE", title: "Standalone Book" },
];

describe("discoverSeriesForSeriesLessBooks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a local series from the catalogue series of a book without series metadata", async () => {
    mockAudibleCatalogue();

    const series = await discoverSeriesForSeriesLessBooks(
      [],
      [buildLocalBook("B0CHICKEN1", "Beware of Chicken")],
      options
    );

    expect(series).toEqual([
      {
        id: "series-less:B0SERIESBOC",
        name: "Beware of Chicken",
        books: [
          expect.objectContaining({
            asin: "B0CHICKEN1",
            seriesNames: ["Beware of Chicken"],
            position: parseSeriesPosition("1"),
          }),
        ],
      },
    ]);
  });

  it("groups books of the same catalogue series and only uses the first series by default", async () => {
    mockAudibleCatalogue();

    const series = await discoverSeriesForSeriesLessBooks(
      [],
      [
        buildLocalBook("B0CHICKEN1", "Beware of Chicken"),
        buildLocalBook("B0CHICKEN2", "Beware of Chicken 2"),
        buildLocalBook("B0OMNIBUS1", "Omnibus Book"),
      ],
      options
    );

    expect(series.map((entry) => [entry.name, entry.books.map((book) => book.asin)])).toEqual([
      ["Beware of Chicken", ["B0CHICKEN1", "B0CHICKEN2"]],
      ["Main Series", ["B0OMNIBUS1"]],
    ]);
  });

  it("uses every catalogue series when subseries are included", async () => {
    mockAudibleCatalogue();

    const series = await discoverSeriesForSeriesLessBooks(
      [],
      [buildLocalBook("B0OMNIBUS1", "Omnibus Book")],
      { ...options, includeSubSeries: true }
    );

    expect(series.map((entry) => entry.name)).toEqual(["Main Series", "Sub Series"]);
  });

  it("skips books that are in a listed series, have series metadata, lack an ASIN, or have no catalogue series", async () => {
    const fetchSpy = mockAudibleCatalogue();
    const listedSeries: LocalSeriesEvidence = {
      id: "listed",
      name: "Listed Series",
      books: [{ ...buildLocalBook("B0CHICKEN3", "Beware of Chicken 3"), seriesNames: ["Other"] }],
    };

    const series = await discoverSeriesForSeriesLessBooks(
      [listedSeries],
      [
        buildLocalBook("B0CHICKEN3", "Beware of Chicken 3"),
        { ...buildLocalBook("B0CHICKEN2", "Beware of Chicken 2"), seriesNames: ["Has Series"] },
        { ...buildLocalBook("", "No ASIN"), asin: null },
        buildLocalBook("Unknown ASIN", "Placeholder ASIN"),
        buildLocalBook("B0LISTED01", "Listed Series Book"),
        buildLocalBook("B0STANDALONE", "Standalone Book"),
      ],
      options
    );

    expect(series).toEqual([]);
    expect(fetchSpy.mock.calls.map(([input]) => String(input))).toEqual([
      expect.stringContaining("/products/B0LISTED01?"),
      expect.stringContaining("/products/B0STANDALONE?"),
    ]);
  });

  it("lets the scan report the rest of a series when only a series-less book 1 is owned", async () => {
    mockAudibleCatalogue();
    const ownedBook = buildLocalBook("B0CHICKEN1", "Beware of Chicken");

    const [localSeries] = await discoverSeriesForSeriesLessBooks([], [ownedBook], options);
    const candidates = await discoverProviderSeriesCandidates(localSeries, options);
    const match = matchLocalSeriesToProviderSeries(localSeries, candidates);
    const missingGroup = buildMissingGroup(match, [ownedBook], options);

    expect(match.status).toBe("matched");
    expect(missingGroup.books.map((book) => book.asin)).toEqual(["B0CHICKEN2", "B0CHICKEN3"]);
  });
});

/**
 * Purpose: Serve Audiobookshelf-independent Audible catalogue responses for
 * the product fixtures, including the Beware of Chicken series product.
 *
 * @returns The `fetch` spy, so tests can inspect requested URLs.
 */
function mockAudibleCatalogue() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input), "http://localhost");
    const productMatch = /\/1\.0\/catalog\/products\/([^/?]+)$/.exec(url.pathname);

    if (productMatch?.[1] === "B0SERIESBOC") {
      return jsonResponse({
        product: {
          asin: "B0SERIESBOC",
          title: "Beware of Chicken",
          relationships: ["B0CHICKEN1", "B0CHICKEN2", "B0CHICKEN3"].map((asin, index) => ({
            asin,
            relationship_to_product: "child",
            relationship_type: "series",
            sequence: String(index + 1),
            sort: String(index + 1),
          })),
        },
      });
    }

    if (productMatch) {
      const product = PRODUCTS.find((entry) => entry.asin === productMatch[1]);
      return product
        ? jsonResponse({ product: buildAudibleProduct(product) })
        : new Response(null, { status: 404 });
    }

    const requestedAsins = url.searchParams.get("asins")?.split(",") ?? [];
    return jsonResponse({
      products: PRODUCTS.filter((product) => requestedAsins.includes(product.asin)).map(
        buildAudibleProduct
      ),
    });
  });
}

/**
 * Purpose: Build a raw Audible product record from a compact fixture.
 *
 * @param product - Compact product fixture.
 * @returns Raw Audible catalogue product.
 */
function buildAudibleProduct(product: ProductFixture) {
  return {
    asin: product.asin,
    title: product.title,
    authors: [{ name: "Casualfarmer" }],
    format_type: "unabridged",
    content_delivery_type: "SinglePartBook",
    release_date: "2024-01-01",
    publisher_name: "Podium Audio",
    series: product.series ?? [],
  };
}

/**
 * Purpose: Build an Audiobookshelf book without series metadata.
 *
 * @param asin - Local ASIN.
 * @param title - Local title.
 * @returns Local book evidence fixture.
 */
function buildLocalBook(asin: string, title: string): LocalBookEvidence {
  return {
    id: `local-${asin || title}`,
    title,
    asin,
    authors: ["Casualfarmer"],
    narrators: [],
    seriesNames: [],
    position: parseSeriesPosition(null),
  };
}

/**
 * Purpose: Wrap a fixture payload in a JSON fetch response.
 *
 * @param payload - JSON-serialisable response body.
 * @returns A 200 JSON response.
 */
function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
