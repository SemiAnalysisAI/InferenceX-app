import path from 'node:path';

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

const HISTORICAL_C24_KEY = JSON.stringify([
  'mi355x:vllm:kimik3:fp4:mtp:false:false:8:1:false:0:8:1:false:0:8:8',
  'agentic_traces',
  null,
  null,
  24,
  'on',
  '44a49a20b029e398ab8b1830347e6cb2fa428b8517abcc6b6de0fa449c9f91f2',
]);
const C24_GOOD_DIGEST = 'e07f7fc80dd2b4819184d59eed6ebb36b05e4d31489ba3b13a6f23eceb6ebc17';
const C24_BAD_DIGEST = 'fd1286ee71ac2966df4ed7036b7c0309bea389db252828d1f22bc58510fff1ac';
const C24_GOOD_FILE =
  'kimik3_tp8_conc24_kvdram-vllm-simple_spec-mtp_fp4_vllm_tp8-pp1-dcp8-pcp1-ep1-dpafalse_disagg-false_-d3c2150a569a6bd8df31.json';
const C24_GOOD_FILE_SHA = 'd45872ec3b26dcefebc296d52f9b3b76bbd6de58d3fdb35eafe660729692a9d5';

interface Candidate {
  file: BenchmarkArtifactFile;
  row: BenchmarkArtifactRow;
  digest: string;
}

export interface BenchmarkSelectionDecision {
  pointKey: string;
  sources: { path: string; fileSha256: string; rowDigest: string }[];
  winner: { path: string; fileSha256: string; rowDigest: string };
  reason: 'unique' | 'identical-copies' | 'historical-c24';
}

function sourceReceipt(candidate: Candidate): BenchmarkSelectionDecision['winner'] {
  return {
    path: candidate.file.path,
    fileSha256: candidate.file.sha256,
    rowDigest: candidate.digest,
  };
}

export function selectBenchmarkMeasurements(
  files: readonly BenchmarkArtifactFile[],
  context: { githubRunId: number; runAttempt: number },
): {
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
    let winner = candidates[0];
    if (!winner) continue;
    let reason: BenchmarkSelectionDecision['reason'] =
      candidates.length === 1 ? 'unique' : 'identical-copies';
    if (
      context.githubRunId === 38451594384 &&
      context.runAttempt === 3 &&
      pointKey === HISTORICAL_C24_KEY
    ) {
      const historical = candidates.find(
        (candidate) =>
          candidate.digest === C24_GOOD_DIGEST &&
          candidate.file.path.startsWith('bmk_agentic_') &&
          path.posix.basename(candidate.file.path) === C24_GOOD_FILE &&
          candidate.file.sha256 === C24_GOOD_FILE_SHA,
      );
      if (
        !historical ||
        [...digests].some((digest) => digest !== C24_GOOD_DIGEST && digest !== C24_BAD_DIGEST)
      ) {
        throw new Error(
          `Unrecognized historical AgentX c24 candidates: ${JSON.stringify(candidates.map(sourceReceipt))}`,
        );
      }
      winner = historical;
      reason = 'historical-c24';
    } else if (digests.size > 1) {
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
