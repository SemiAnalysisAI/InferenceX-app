export interface JoinedDrawOrder {
  order: number[];
  previous: Int32Array;
}

export function joinedDrawOrder(
  previousKeys: readonly string[],
  nextKeys: readonly string[],
): JoinedDrawOrder {
  const previousRank = new Map<string, number>();
  previousKeys.forEach((key, index) => {
    if (!previousRank.has(key)) previousRank.set(key, index);
  });
  const matched = new Int32Array(nextKeys.length).fill(-1);
  const claimed = new Set<string>();
  nextKeys.forEach((key, index) => {
    const rank = previousRank.get(key);
    if (rank !== undefined && !claimed.has(key)) {
      claimed.add(key);
      matched[index] = rank;
    }
  });
  const kept: number[] = [];
  const enteringBefore = new Map<number, number[]>();
  const appended: number[] = [];
  let nextKept = -1;
  const anchors = new Int32Array(nextKeys.length);
  for (let index = nextKeys.length - 1; index >= 0; index--) {
    if (matched[index] >= 0) nextKept = index;
    else anchors[index] = nextKept;
  }
  for (let index = 0; index < nextKeys.length; index++) {
    if (matched[index] >= 0) {
      kept.push(index);
    } else if (anchors[index] < 0) {
      appended.push(index);
    } else {
      const entering = enteringBefore.get(anchors[index]);
      if (entering) entering.push(index);
      else enteringBefore.set(anchors[index], [index]);
    }
  }
  kept.sort((a, b) => matched[a] - matched[b]);
  const order: number[] = [];
  for (const index of kept) {
    const entering = enteringBefore.get(index);
    if (entering) order.push(...entering);
    order.push(index);
  }
  order.push(...appended);
  return { order, previous: Int32Array.from(order, (index) => matched[index]) };
}
