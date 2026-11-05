export function computeToggle(prev: Set<string>, item: string, allItems: Set<string>): Set<string> {
  if (prev.has(item)) {
    if (prev.size <= 1) return allItems;
    return new Set([item]);
  }
  return new Set([...prev, item]);
}
