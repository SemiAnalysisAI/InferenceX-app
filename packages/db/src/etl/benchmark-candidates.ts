import {
  sha256Hex,
  type BenchmarkArtifactFile,
  type BenchmarkArtifactRow,
} from './benchmark-artifacts';
import { isAgenticRow, type BenchmarkParams } from './benchmark-mapper';
import { configCacheKey } from './config-cache';

/** JSON.stringify number/string encoding, recursively sorted object keys, unchanged array order. */
export function benchmarkRowDigest(raw: Record<string, unknown>): string {
  return sha256Hex(
    JSON.stringify(raw, (_key, value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : value,
    ),
  );
}

export function benchmarkCandidateKey(point: BenchmarkParams): string {
  return JSON.stringify([
    configCacheKey(point.config),
    point.benchmarkType,
    point.isl,
    point.osl,
    point.conc,
    point.offloadMode,
    point.recipeFingerprint,
  ]);
}

interface Candidate {
  file: BenchmarkArtifactFile;
  row: BenchmarkArtifactRow;
  digest: string;
}

export interface BenchmarkSelectionDecision {
  pointKey: string;
  sources: { path: string; fileSha256: string; rowDigest: string }[];
  winner: { path: string; fileSha256: string; rowDigest: string };
  reason: 'unique' | 'identical-copies';
}

function sourceReceipt(candidate: Candidate): BenchmarkSelectionDecision['winner'] {
  return {
    path: candidate.file.path,
    fileSha256: candidate.file.sha256,
    rowDigest: candidate.digest,
  };
}

export function selectBenchmarkMeasurements(files: readonly BenchmarkArtifactFile[]): {
  sources: { file: BenchmarkArtifactFile; rows: BenchmarkArtifactRow[] }[];
  decisions: BenchmarkSelectionDecision[];
} {
  const groups = new Map<string, Candidate[]>();
  const selected = new Set<BenchmarkArtifactRow>();
  for (const file of files) {
    for (const row of file.rows) {
      if (!isAgenticRow(row.raw)) {
        selected.add(row);
        continue;
      }
      if ('benchmark_outcome' in row.raw) {
        const outcome = row.raw.benchmark_outcome;
        if (
          !outcome ||
          typeof outcome !== 'object' ||
          !('status' in outcome) ||
          (outcome.status !== 'passed' && outcome.status !== 'failed')
        ) {
          throw new Error(`Malformed AgentX benchmark outcome in ${file.path}`);
        }
        if (
          ('attempt_id' in outcome || 'finalized' in outcome) &&
          (!('attempt_id' in outcome) ||
            typeof outcome.attempt_id !== 'string' ||
            outcome.attempt_id.trim().length === 0 ||
            !('finalized' in outcome) ||
            typeof outcome.finalized !== 'boolean' ||
            (outcome.status === 'passed' && !outcome.finalized))
        ) {
          throw new Error(`Malformed AgentX benchmark outcome in ${file.path}`);
        }
        if (outcome.status === 'failed') continue;
      }
      if (!row.mapped) {
        selected.add(row);
        continue;
      }
      const key = benchmarkCandidateKey(row.mapped);
      const candidates = groups.get(key) ?? [];
      candidates.push({ file, row, digest: benchmarkRowDigest(row.raw) });
      groups.set(key, candidates);
    }
  }

  const decisions: BenchmarkSelectionDecision[] = [];
  for (const [pointKey, candidates] of groups) {
    candidates.sort(
      (a, b) =>
        Number(b.file.path.startsWith('bmk_')) - Number(a.file.path.startsWith('bmk_')) ||
        a.file.path.localeCompare(b.file.path),
    );
    const digests = new Set(candidates.map((candidate) => candidate.digest));
    const winner = candidates[0];
    if (!winner) continue;
    const reason: BenchmarkSelectionDecision['reason'] =
      candidates.length === 1 ? 'unique' : 'identical-copies';
    if (digests.size > 1) {
      throw new Error(
        `Conflicting AgentX measurements for ${pointKey}: ${JSON.stringify(candidates.map(sourceReceipt))}`,
      );
    }
    selected.add(winner.row);
    decisions.push({
      pointKey,
      sources: candidates.map(sourceReceipt),
      winner: sourceReceipt(winner),
      reason,
    });
  }
  return {
    sources: files.map((file) => ({ file, rows: file.rows.filter((row) => selected.has(row)) })),
    decisions,
  };
}
