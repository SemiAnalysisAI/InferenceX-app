import { matchesSearch } from '@/lib/shared/search-match';

interface LegendItem {
  label: string;
  title?: string;
  isActive: boolean;
}

export function filterAndSortLegendItems<T extends LegendItem>(
  items: T[],
  searchQuery: string,
  sortActiveFirst: boolean,
): T[] {
  let result = items;

  const query = searchQuery.trim();
  if (query) {
    result = result.filter(
      (item) =>
        matchesSearch(item.label, query) || (item.title && matchesSearch(item.title, query)),
    );
  }

  if (sortActiveFirst) {
    result = [...result].toSorted((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return 0;
    });
  }

  return result;
}
