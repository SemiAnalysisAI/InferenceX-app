/**
 * Largest Triangle Three Buckets (LTTB) downsampling.
 * Reduces a sorted array of points to `target` points while preserving
 * visual shape. O(n) time, no allocations beyond the output array.
 *
 * Reference: Sveinn Steinarsson, "Downsampling Time Series for Visual
 * Representation" (2013).
 */
export function lttbDownsample<T>(
  data: T[],
  target: number,
  getX: (d: T) => number,
  getY: (d: T) => number,
): T[] {
  if (data.length <= target) return data;
  if (target < 3) return [data[0], data[data.length - 1]];

  const result: T[] = [data[0]]; // Always include first point
  const bucketSize = (data.length - 2) / (target - 2);

  let prevIndex = 0;

  for (let i = 0; i < target - 2; i++) {
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);

    // Average of next bucket (look-ahead)
    const nextBucketStart = bucketEnd;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, data.length - 1);
    let avgX = 0;
    let avgY = 0;
    const nextBucketLen = nextBucketEnd - nextBucketStart + 1;
    for (let j = nextBucketStart; j <= nextBucketEnd; j++) {
      avgX += getX(data[j]);
      avgY += getY(data[j]);
    }
    avgX /= nextBucketLen;
    avgY /= nextBucketLen;

    // Pick point in current bucket with largest triangle area
    const prevX = getX(data[prevIndex]);
    const prevY = getY(data[prevIndex]);
    let maxArea = -1;
    let bestIndex = bucketStart;

    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs(
        (prevX - avgX) * (getY(data[j]) - prevY) - (prevX - getX(data[j])) * (avgY - prevY),
      );
      if (area > maxArea) {
        maxArea = area;
        bestIndex = j;
      }
    }

    result.push(data[bestIndex]);
    prevIndex = bestIndex;
  }

  result.push(data[data.length - 1]); // Always include last point
  return result;
}
