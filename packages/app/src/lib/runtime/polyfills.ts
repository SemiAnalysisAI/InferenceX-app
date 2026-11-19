if (!Array.prototype.toSorted) {
  const nativeSort = Array.prototype.sort;

  // oxlint-disable-next-line no-extend-native -- intentional polyfill for older browsers
  Array.prototype.toSorted = function <T>(this: T[], compareFn?: (a: T, b: T) => number): T[] {
    return nativeSort.call([...this], compareFn);
  };
}
