export const CONTENT_MODULE_FILTERS_KEY = "srq_content_filters_v1";

export type StoredContentFilters = {
  selectedSurveyors: string[];
  establishmentSearch: string;
  dateFrom: string;
  dateTo: string;
  brStateFilter: string;
  phoneStateFilter: string;
  advancedAccordionOpen: boolean;
};

export function loadContentFilters(): Partial<StoredContentFilters> | null {
  try {
    const raw = localStorage.getItem(CONTENT_MODULE_FILTERS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<StoredContentFilters>;
    return p && typeof p === "object" ? p : null;
  } catch {
    return null;
  }
}

export function saveContentFilters(data: StoredContentFilters) {
  try {
    localStorage.setItem(CONTENT_MODULE_FILTERS_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
}
