export const MEMORY_FIELDS = ['weights', 'kvPool', 'activations', 'nonTorch', 'graphs'] as const;
export type MemoryField = (typeof MEMORY_FIELDS)[number];
export type MemoryValues = Record<MemoryField, number | null>;

export interface MemoryRank {
  file: string;
  rank: string;
  /** Process identity prevents combining different vLLM worker lifetimes. */
  process: string | null;
  totalGiB: number | null;
  gib: MemoryValues;
  percent: MemoryValues;
  /** SGLang reports free-memory deltas, not resident parameter bytes. */
  weightBasis: 'profile' | 'load-delta';
  evidence: { line: number; text: string }[];
  conflicts: MemoryField[];
}

export interface MemoryFile {
  file: string;
  text: string;
  truncated: boolean;
}

const empty = (): MemoryValues => ({
  weights: null,
  kvPool: null,
  activations: null,
  nonTorch: null,
  graphs: null,
});
const amount = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const NUM = String.raw`(\d+(?:\.\d+)?)`;

/** Parse only explicit allocation reports; budgets, free memory and token counts are not bytes. */
export function parseAgenticMemory(framework: string, files: MemoryFile[]): MemoryRank[] {
  const backend = framework.toLowerCase();
  if (backend !== 'vllm' && backend !== 'sglang') return [];
  const ranks: MemoryRank[] = [];
  for (const file of files) {
    const perRank = new Map<string, MemoryRank>();
    const parts = new Map<string, Map<string, number>>();
    // ANSI color escapes are formatting, not report content.
    // eslint-disable-next-line no-control-regex
    const lines = file.text.replaceAll(/\u001B\[[0-9;]*m/gu, '').split(/\r?\n/u);
    // A bounded read may end mid-report. Never interpret the final partial line.
    if (file.truncated) lines.pop();
    for (const [index, raw] of lines.entries()) {
      if (raw.length > 8192) continue;
      const line = raw.trim();
      const worker = /\((?<rank>Worker[^ )]*)(?:\s+pid=(?<pid>\d+))?\)/u.exec(line);
      const sg = /\[[^\]]*?\b(?<rank>(?:(?:DP|TP|PP|EP)\d+[ ,]*)+)\]/u.exec(line);
      if (backend === 'vllm' && !worker) continue;
      if (backend === 'sglang' && !sg) continue;
      const rank = worker?.groups?.rank ?? sg!.groups!.rank!.trim();
      const process = worker?.groups?.pid ?? null;
      const key = `${rank}/${process ?? ''}`;
      const updates: [MemoryField, number, string][] = [];
      let total: number | null = null;
      if (backend === 'vllm') {
        // One authoritative post-capture report, rather than summing overlapping logs.
        if (!line.includes('Actual usage is')) continue;
        total = amount(
          new RegExp(`Free memory on device \\(${NUM}/${NUM} GiB\\)`, 'u').exec(line)?.[2],
        );
        for (const [field, re] of [
          ['weights', `${NUM} GiB for weight`],
          ['activations', `${NUM} GiB for peak activation`],
          ['nonTorch', `${NUM} GiB for non-torch memory`],
          ['graphs', `${NUM} GiB for CUDAGraph memory`],
          ['kvPool', `Current kv cache memory in use is ${NUM} GiB`],
        ] as const) {
          const value = amount(new RegExp(re, 'u').exec(line)?.[1]);
          if (value !== null) updates.push([field, value, 'profile']);
        }
      } else {
        const weight =
          /Load weight end\..*?type=(?<kind>[^,]+),.*?mem usage=(?<value>\d+(?:\.\d+)?) GB/u.exec(
            line,
          );
        const weightValue = amount(weight?.groups?.value);
        if (weightValue !== null) updates.push(['weights', weightValue, weight!.groups!.kind!]);
        const graph =
          /Capture (?<kind>.*?)CUDA graph end\..*?mem usage=(?<value>\d+(?:\.\d+)?) GB/u.exec(line);
        const graphValue = amount(graph?.groups?.value);
        if (graphValue !== null)
          updates.push(['graphs', graphValue, graph!.groups!.kind!.trim() || 'default']);
        const cache = /(?:\]\s+)(?<kind>.*?)KV Cache is allocated\..*/u.exec(line);
        if (cache) {
          const kv = amount(new RegExp(`\\bKV size: ${NUM} GB`, 'u').exec(line)?.[1]);
          const k = amount(new RegExp(`\\bK size: ${NUM} GB`, 'u').exec(line)?.[1]);
          const v = amount(new RegExp(`\\bV size: ${NUM} GB`, 'u').exec(line)?.[1]);
          const value = kv ?? (k !== null && v !== null ? k + v : null);
          if (value !== null)
            updates.push(['kvPool', value, cache.groups!.kind!.trim() || 'default']);
        }
      }
      if (updates.length === 0) continue;
      let entry = perRank.get(key);
      if (!entry) {
        entry = {
          file: file.file,
          rank,
          process,
          totalGiB: total !== null && total > 0 ? total : null,
          gib: empty(),
          percent: empty(),
          weightBasis: backend === 'vllm' ? 'profile' : 'load-delta',
          evidence: [],
          conflicts: [],
        };
        perRank.set(key, entry);
      }
      if (total !== null && total > 0) entry.totalGiB = total;
      for (const [field, value, part] of updates) {
        const partKey = `${key}/${field}`;
        const values = parts.get(partKey) ?? new Map<string, number>();
        // Ambiguous repeated allocations are not safely additive.
        if (
          values.has(part) &&
          (backend === 'sglang' || values.get(part) !== value) &&
          !entry.conflicts.includes(field)
        ) {
          entry.conflicts.push(field);
        }
        values.set(part, value);
        parts.set(partKey, values);
        const sum = [...values.values()].reduce((a, b) => a + b, 0);
        entry.gib[field] = entry.conflicts.includes(field) || !Number.isFinite(sum) ? null : sum;
      }
      entry.evidence.push({ line: index + 1, text: line });
    }
    for (const entry of perRank.values()) {
      for (const field of MEMORY_FIELDS) {
        const value = entry.gib[field];
        entry.percent[field] =
          value !== null && entry.totalGiB !== null ? (value / entry.totalGiB) * 100 : null;
      }
      ranks.push(entry);
    }
  }
  return ranks;
}
