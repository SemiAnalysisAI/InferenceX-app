// Hash-prefix reuse measures prior session content, not the provider's reported cache hits.

export interface HashSourceRow {
  requestId: string;
  hashIds: string[] | null;
  hashTokenCount: number | null;
}

export interface HashMetric {
  cacheRead: number;
  cacheWrite: number;
  cachedBlocks: number;
  hashBlocks: number;
  hashTokenCount: number | null;
}

interface HashTrieNode {
  children: Map<string, HashTrieNode>;
}

export function inferHashBlockSizeFromCounts(hashCount: number, tokenCount: number): number | null {
  if (hashCount <= 0 || tokenCount <= 0) return null;
  for (const candidate of [64, 128, 256, 512, 1024]) {
    if (Math.ceil(tokenCount / candidate) === hashCount) return candidate;
  }
  return null;
}

// Infer from persisted counts because ANONYMIZE_BLOCK_SIZE can override the default.
function inferHashBlockSize(rows: HashSourceRow[]): number {
  for (const row of rows) {
    const blockSize = inferHashBlockSizeFromCounts(
      row.hashIds?.length ?? 0,
      row.hashTokenCount ?? 0,
    );
    if (blockSize !== null) return blockSize;
  }
  return 64;
}

/** Tokens contributed by a single hash block. The last block may be partial. */
function tokenCountForHashBlock(
  index: number,
  hashCount: number,
  hashTokenCount: number | null,
  blockSize: number,
): number {
  if (!hashTokenCount || hashTokenCount <= 0) return blockSize;
  if (index < hashCount - 1) return blockSize;
  const remainder = hashTokenCount - blockSize * (hashCount - 1);
  return remainder > 0 ? remainder : blockSize;
}

function countCachedPrefixBlocks(root: HashTrieNode, hashes: string[]): number {
  let node = root;
  let count = 0;
  for (const hash of hashes) {
    const child = node.children.get(hash);
    if (!child) break;
    node = child;
    count++;
  }
  return count;
}

function insertHashPath(root: HashTrieNode, hashes: string[]): void {
  let node = root;
  for (const hash of hashes) {
    let child = node.children.get(hash);
    if (!child) {
      child = { children: new Map() };
      node.children.set(hash, child);
    }
    node = child;
  }
}

interface HashMetricsTotals {
  hashCached: number;
  hashTotal: number;
}

interface HashMetricsAccumulator {
  add: (row: HashSourceRow) => HashMetric;
  totals: () => HashMetricsTotals;
}

/** Accumulate exact hash-prefix metrics without retaining every source row. */
export function createHashMetricsAccumulator(blockSize: number): HashMetricsAccumulator {
  if (!Number.isFinite(blockSize) || blockSize <= 0) {
    throw new RangeError('blockSize must be a positive number');
  }

  const seenPrefixes: HashTrieNode = { children: new Map() };
  let hashCached = 0;
  let hashTotal = 0;

  return {
    add(row) {
      const hashes = row.hashIds ?? [];
      const cachedBlocks = countCachedPrefixBlocks(seenPrefixes, hashes);
      let cacheRead = 0;
      let cacheWrite = 0;

      hashes.forEach((_hash, index) => {
        const tokens = tokenCountForHashBlock(index, hashes.length, row.hashTokenCount, blockSize);
        if (index < cachedBlocks) {
          cacheRead += tokens;
        } else {
          cacheWrite += tokens;
        }
      });

      const metric = {
        cacheRead,
        cacheWrite,
        cachedBlocks,
        hashBlocks: hashes.length,
        hashTokenCount: row.hashTokenCount,
      };
      hashCached += cacheRead;
      hashTotal += cacheRead + cacheWrite;
      insertHashPath(seenPrefixes, hashes);
      return metric;
    },
    totals() {
      return { hashCached, hashTotal };
    },
  };
}

// Callers must flatten subagent groups and order rows chronologically.
// Only the longest position-aligned prefix shared with a prior chain counts as cached.
export function buildHashMetrics(rows: HashSourceRow[]): {
  byRequestId: Map<string, HashMetric>;
  blockSize: number;
} {
  const blockSize = inferHashBlockSize(rows);
  const accumulator = createHashMetricsAccumulator(blockSize);
  const byRequestId = new Map<string, HashMetric>();

  for (const row of rows) {
    byRequestId.set(row.requestId, accumulator.add(row));
  }

  return { byRequestId, blockSize };
}
