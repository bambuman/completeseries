import { useState } from "react";
import type { ResultsReleaseFilter } from "./releaseStatus";
import {
  clearResultsPreferences,
  defaultResultsPreferences,
  loadResultsPreferences,
  saveResultsPreferences,
  type ResultsPreferences,
} from "./resultsPreferencesStore";
import type { ResultsSortOrder } from "./visibleResults";

export type ResultsDisplayPreferencesState = {
  changeReleaseFilter: (nextReleaseFilter: ResultsReleaseFilter) => void;
  changeShowHiddenItems: (shouldShowHiddenItems: boolean) => void;
  changeSortOrder: (nextSortOrder: ResultsSortOrder) => void;
  clearResultsDisplayPreferences: () => void;
  importResultsPreferences: (preferences: ResultsPreferences) => void;
  releaseFilter: ResultsReleaseFilter;
  showHiddenItems: boolean;
  sortOrder: ResultsSortOrder;
};

/**
 * Purpose: Keep result-display preferences in React state and browser storage
 * without making the results view own storage details directly.
 *
 * @returns Current result-display preferences and mutators that persist each
 * change.
 */
export function useResultsDisplayPreferences(): ResultsDisplayPreferencesState {
  const [preferences, setPreferences] = useState<ResultsPreferences>(() =>
    loadResultsPreferences()
  );

  /**
   * Purpose: Apply a partial preference change to state and browser storage.
   *
   * @param change - Preference fields to update.
   * @returns Nothing. State and browser storage are updated together.
   */
  function updatePreferences(change: Partial<ResultsPreferences>): void {
    const nextPreferences = { ...preferences, ...change };
    setPreferences(nextPreferences);
    saveResultsPreferences(nextPreferences);
  }

  /**
   * Purpose: Persist the selected result sort order as soon as it changes.
   *
   * @param nextSortOrder - Sort order selected by the user.
   * @returns Nothing. State and browser storage are updated together.
   */
  function changeSortOrder(nextSortOrder: ResultsSortOrder): void {
    updatePreferences({ sortOrder: nextSortOrder });
  }

  /**
   * Purpose: Persist whether hidden result items should be visible.
   *
   * @param shouldShowHiddenItems - Whether hidden items should be shown.
   * @returns Nothing. State and browser storage are updated together.
   */
  function changeShowHiddenItems(shouldShowHiddenItems: boolean): void {
    updatePreferences({ showHiddenItems: shouldShowHiddenItems });
  }

  /**
   * Purpose: Persist whether all, released, or upcoming books are shown.
   *
   * @param nextReleaseFilter - Release filter selected by the user.
   * @returns Nothing. State and browser storage are updated together.
   */
  function changeReleaseFilter(nextReleaseFilter: ResultsReleaseFilter): void {
    updatePreferences({ releaseFilter: nextReleaseFilter });
  }

  /**
   * Purpose: Apply imported results-page display preferences immediately.
   *
   * @param importedPreferences - Imported display preferences.
   * @returns Nothing. State and browser storage are updated together.
   */
  function importResultsPreferences(importedPreferences: ResultsPreferences): void {
    setPreferences(importedPreferences);
    saveResultsPreferences(importedPreferences);
  }

  /**
   * Purpose: Clear result-display preferences from storage and reset this view
   * to the defaults.
   *
   * @returns Nothing. State and browser storage are reset.
   */
  function clearResultsDisplayPreferences(): void {
    clearResultsPreferences();
    setPreferences(defaultResultsPreferences);
  }

  return {
    changeReleaseFilter,
    changeShowHiddenItems,
    changeSortOrder,
    clearResultsDisplayPreferences,
    importResultsPreferences,
    releaseFilter: preferences.releaseFilter,
    showHiddenItems: preferences.showHiddenItems,
    sortOrder: preferences.sortOrder,
  };
}
