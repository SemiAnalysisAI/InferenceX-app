/**
 * Pure utility functions for legend filtering and sorting.
 * Used by ChartLegend component for sidebar mode processing.
 */

interface LegendItem {
  label: string;
  title?: string;
  isActive: boolean;
}

/**
 * Filters legend items by search query (case-insensitive, matches label and title),
 * then optionally sorts active items to the top while preserving relative order.
 */
export function filterAndSortLegendItems<T extends LegendItem>(
  items: T[],
  searchQuery: string,
  sortActiveFirst: boolean,
): T[] {
  let result = items;

  const query = searchQuery.trim().toLowerCase();
  if (query) {
    result = result.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        (item.title && item.title.toLowerCase().includes(query)),
    );
  }

  if (sortActiveFirst) {
    result = [...result].sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return 0;
    });
  }

  return result;
}
