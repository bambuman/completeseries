import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ResultsReleaseFilter } from "./releaseStatus";

export type ResultsSeriesFilter = "all" | "lessConfident" | "listening";

type FilterOption<TValue extends string> = {
  count?: number;
  label: string;
  value: TValue;
};

type ResultsFilterMenuProps = {
  listeningSeriesCount?: number;
  lowConfidenceCount: number;
  onReleaseFilterChange: (releaseFilter: ResultsReleaseFilter) => void;
  onSeriesFilterChange?: (seriesFilter: ResultsSeriesFilter) => void;
  releaseCounts?: Record<ResultsReleaseFilter, number>;
  releaseFilter: ResultsReleaseFilter;
  seriesFilter: ResultsSeriesFilter;
};

const RELEASE_LABELS: Record<ResultsReleaseFilter, string> = {
  all: "All books",
  released: "Released",
  upcoming: "Upcoming",
};

const SERIES_LABELS: Record<ResultsSeriesFilter, string> = {
  all: "All series",
  lessConfident: "+ Less confident",
  listening: "Listening",
};

/**
 * Purpose: Render one compact filter control that combines the book release
 * filter and the series filter, so the results toolbar stays narrow.
 *
 * @param props - Filter menu inputs.
 * @param props.listeningSeriesCount - Number of visible series the user has
 * started.
 * @param props.lowConfidenceCount - Number of tentative result groups.
 * @param props.onReleaseFilterChange - Callback receiving the release filter.
 * @param props.onSeriesFilterChange - Optional callback receiving the series
 * filter. Without it only the book filter is shown.
 * @param props.releaseCounts - Book counts behind each release option.
 * @param props.releaseFilter - Current release filter.
 * @param props.seriesFilter - Current series filter.
 * @returns A dropdown button with a panel of radio options.
 */
export function ResultsFilterMenu({
  listeningSeriesCount,
  lowConfidenceCount,
  onReleaseFilterChange,
  onSeriesFilterChange,
  releaseCounts,
  releaseFilter,
  seriesFilter,
}: ResultsFilterMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isActive = releaseFilter !== "all" || seriesFilter !== "all";

  const releaseOptions: FilterOption<ResultsReleaseFilter>[] = (
    ["all", "released", "upcoming"] as const
  ).map((value) => ({ value, label: RELEASE_LABELS[value], count: releaseCounts?.[value] }));
  const seriesOptions: FilterOption<ResultsSeriesFilter>[] = [
    { value: "all", label: SERIES_LABELS.all },
    ...(lowConfidenceCount > 0
      ? [
          {
            value: "lessConfident" as const,
            label: SERIES_LABELS.lessConfident,
            count: lowConfidenceCount,
          },
        ]
      : []),
    { value: "listening", label: SERIES_LABELS.listening, count: listeningSeriesCount },
  ];

  useEffect(() => {
    if (!isOpen) return undefined;

    /**
     * Purpose: Close the panel when the user clicks outside it.
     *
     * @param event - Pointer event from the document.
     * @returns Nothing.
     */
    function closeOnOutsideClick(event: PointerEvent): void {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    /**
     * Purpose: Close the panel on Escape and return focus to the button.
     *
     * @param event - Keyboard event from the document.
     * @returns Nothing.
     */
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      buttonRef.current?.focus();
    }

    /**
     * Purpose: Close the panel when the page or toolbar scrolls or the window
     * resizes, since the panel is positioned against the viewport.
     *
     * @param event - Scroll or resize event.
     * @returns Nothing. Scrolling inside the panel itself is ignored.
     */
    function closeOnScroll(event: Event): void {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      setIsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnScroll);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnScroll);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [isOpen]);

  /**
   * Purpose: Open or close the panel, placing it under the button, or above it
   * when there is no room below (the toolbar sits at the bottom on phones).
   *
   * @returns Nothing. Component state is updated.
   */
  function togglePanel(): void {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 248));
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const openAbove = spaceBelow < 320 && spaceAbove > spaceBelow;
      setPanelStyle(
        openAbove
          ? { left, bottom: window.innerHeight - rect.top + 6, maxHeight: spaceAbove }
          : { left, top: rect.bottom + 6, maxHeight: spaceBelow }
      );
    }
    setIsOpen(true);
  }

  const summary = onSeriesFilterChange
    ? `${RELEASE_LABELS[releaseFilter]} · ${SERIES_LABELS[seriesFilter].replace("+ ", "")}`
    : RELEASE_LABELS[releaseFilter];

  return (
    <div className="results-filter-menu" ref={rootRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={`results-filter-menu__button${
          isActive ? " results-filter-menu__button--active" : ""
        }`}
        ref={buttonRef}
        title="Filter books and series"
        type="button"
        onClick={togglePanel}
      >
        {summary}
      </button>
      {isOpen
        ? createPortal(
            <div className="results-filter-menu__panel" ref={panelRef} style={panelStyle}>
              <FilterGroup
                legend="Books"
                name="resultsReleaseFilter"
                options={releaseOptions}
                value={releaseFilter}
                onChange={onReleaseFilterChange}
              />
              {onSeriesFilterChange ? (
                <FilterGroup
                  legend="Series"
                  name="resultsSeriesFilter"
                  options={seriesOptions}
                  value={seriesFilter}
                  onChange={onSeriesFilterChange}
                />
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

/**
 * Purpose: Render one labelled group of radio options in the filter panel.
 *
 * @param props - Group inputs.
 * @param props.legend - Visible group heading.
 * @param props.name - Radio group name.
 * @param props.onChange - Callback receiving the chosen value.
 * @param props.options - Options with optional counts.
 * @param props.value - Currently selected value.
 * @returns A fieldset of radio options.
 */
function FilterGroup<TValue extends string>({
  legend,
  name,
  onChange,
  options,
  value,
}: {
  legend: string;
  name: string;
  onChange: (value: TValue) => void;
  options: FilterOption<TValue>[];
  value: TValue;
}) {
  return (
    <fieldset className="results-filter-menu__group">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label className="selection-option" key={option.value}>
          <input
            checked={value === option.value}
            name={name}
            type="radio"
            value={option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
          {option.count !== undefined ? (
            <span className="results-filter-menu__count">{option.count}</span>
          ) : null}
        </label>
      ))}
    </fieldset>
  );
}
