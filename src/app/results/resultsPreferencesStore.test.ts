import { describe, expect, it } from "vitest";
import { parseResultsPreferencesPayload } from "./resultsPreferencesStore";

describe("resultsPreferencesStore", () => {
  it("imports results display preferences from V2 local data exports", () => {
    const preferences = parseResultsPreferencesPayload(
      JSON.stringify({
        resultsPreferences: {
          showHiddenItems: true,
          sortOrder: "authorDesc",
        },
      })
    );

    expect(preferences).toEqual({
      releaseFilter: "all",
      showHiddenItems: true,
      sortOrder: "authorDesc",
    });
  });

  it("falls back to defaults for unknown sort orders", () => {
    const preferences = parseResultsPreferencesPayload(
      JSON.stringify({
        resultsPreferences: {
          showHiddenItems: true,
          sortOrder: "newestFirst",
        },
      })
    );

    expect(preferences).toEqual({
      releaseFilter: "all",
      showHiddenItems: true,
      sortOrder: "seriesAsc",
    });
  });

  it("imports the release filter and release-date sort orders", () => {
    const preferences = parseResultsPreferencesPayload(
      JSON.stringify({
        resultsPreferences: {
          releaseFilter: "upcoming",
          showHiddenItems: false,
          sortOrder: "releaseNext",
        },
      })
    );

    expect(preferences).toEqual({
      releaseFilter: "upcoming",
      showHiddenItems: false,
      sortOrder: "releaseNext",
    });
  });

  it("falls back to showing all books for unknown release filters", () => {
    const preferences = parseResultsPreferencesPayload(
      JSON.stringify({ resultsPreferences: { releaseFilter: "soon" } })
    );

    expect(preferences?.releaseFilter).toBe("all");
  });

  it("returns null when a payload has no results preferences", () => {
    expect(parseResultsPreferencesPayload(JSON.stringify({ hiddenItems: [] }))).toBeNull();
  });
});
