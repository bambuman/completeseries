import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MissingBookGroup } from "../../domain/missingBooks";
import { MissingBooksModal } from "./MissingBooksModal";

describe("MissingBooksModal", () => {
  it("offers a contextual manual owned-book action when the result can be traced", () => {
    const html = renderToStaticMarkup(
      <MissingBooksModal
        group={buildMissingGroup()}
        hiddenItems={[]}
        manualBookMatches={[]}
        manualBookMatchSource={{
          providerId: "audible",
          providerName: "Audible catalogue",
          providerSeriesAsin: "series-discworld",
          providerSeriesName: "Discworld",
          region: "uk",
        }}
        onClose={() => undefined}
        onHideItem={() => undefined}
        onSaveManualBookMatch={() => undefined}
        onUnhideItem={() => undefined}
      />
    );

    expect(html).toContain("Mark book owned");
    expect(html).toContain("Open provider page");
    expect(html).toContain("https://www.audible.co.uk/pd/Monstrous-Regiment-Audiobook/B09MDKHZV5");
  });

  it("shows source series when result groups have been merged", () => {
    const html = renderToStaticMarkup(
      <MissingBooksModal
        group={{
          ...buildMissingGroup(),
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
        }}
        hiddenItems={[]}
        manualBookMatches={[]}
        onClose={() => undefined}
        onHideItem={() => undefined}
        onUnhideItem={() => undefined}
      />
    );

    expect(html).toContain("Merged from 2 series");
    expect(html).toContain("Discworld: Industrial Revolution");
  });

  it("splits released and upcoming books into separate sections", () => {
    const baseGroup = buildMissingGroup();
    const html = renderToStaticMarkup(
      <MissingBooksModal
        group={{
          ...baseGroup,
          books: [
            ...baseGroup.books,
            {
              ...baseGroup.books[0],
              asin: "B0UPCOMING",
              title: "Future Discworld",
              releaseDate: "2999-01-01",
            },
          ],
        }}
        hiddenItems={[]}
        manualBookMatches={[]}
        onClose={() => undefined}
        onHideItem={() => undefined}
        onUnhideItem={() => undefined}
      />
    );

    expect(html).toContain("Available now (1)");
    expect(html).toContain("Coming soon (1)");
    expect(html.indexOf("Monstrous Regiment")).toBeLessThan(html.indexOf("Coming soon"));
    expect(html.indexOf("Coming soon")).toBeLessThan(html.indexOf("Future Discworld"));
    expect(html).toContain("book-detail-card--upcoming");
    expect(html).toContain("Upcoming</span>Releases");
    expect(html).toContain("Released ");
  });

  it("does not add section headings when every book is released", () => {
    const html = renderToStaticMarkup(
      <MissingBooksModal
        group={buildMissingGroup()}
        hiddenItems={[]}
        manualBookMatches={[]}
        onClose={() => undefined}
        onHideItem={() => undefined}
        onUnhideItem={() => undefined}
      />
    );

    expect(html).not.toContain("Available now");
    expect(html).not.toContain("Coming soon");
  });
});

/**
 * Purpose: Build a small missing-book result group for modal rendering tests.
 *
 * @returns A missing-book group containing one provider book.
 */
function buildMissingGroup(): MissingBookGroup {
  return {
    seriesName: "Discworld",
    seriesAsin: "series-discworld",
    books: [
      {
        asin: "B09MDKHZV5",
        title: "Monstrous Regiment",
        subtitle: null,
        authors: ["Terry Pratchett"],
        narrators: ["Indira Varma"],
        series: [{ asin: "series-discworld", name: "Discworld", position: "31" }],
        bookFormat: "unabridged",
        releaseDate: "2021-12-16",
        imageUrl: null,
        link: "https://www.audible.co.uk/pd/B09MDKHZV5",
      },
    ],
    diagnosticsByAsin: {},
    debugDecisions: [],
  };
}
