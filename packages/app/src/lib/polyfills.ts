/**
 * Polyfill for Array.prototype.toSorted (ES2023).
 * Some browsers (e.g. older Chrome/Safari/Firefox) lack this method.
 * Must be imported before any code that calls .toSorted().
 */
if (!Array.prototype.toSorted) {
  const nativeSort = Array.prototype.sort;
  // oxlint-disable-next-line no-extend-native
  Array.prototype.toSorted = function <T>(this: T[], compareFn?: (a: T, b: T) => number): T[] {
    return nativeSort.call([...this], compareFn);
  };
}
