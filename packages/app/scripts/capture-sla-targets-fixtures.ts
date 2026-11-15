/**
 * Capture real AgentX benchmark results for the SLA Targets page fixtures.
 *
 * Reads the artifacts of public GitHub Actions runs of the benchmark
 * repository and writes
 *   cypress/fixtures/api/sla-targets.json   serving configurations per model
 *   cypress/fixtures/api/sla-attempts.json  per-attempt data per load point
 * and records the source and capture time in the fixture manifest.
 *
 * Every number comes from a real benchmark run. Per-attempt data is built by
 * the same adapter ingest uses (`slaAttemptsFromExport`) from the original
 * export, the harness log and the aggregate JSON of each load point; nothing
 * is generated or adjusted. Only the files that are needed are read from each
 * artifact, through byte-range requests.
 *
 * Needs a GitHub token with read access to public repositories in
 * GITHUB_TOKEN or GH_TOKEN. Artifacts expire 90 days after their run, so the
 * runs below have to be replaced with newer ones over time.
 *
 * Usage: bun run --cwd packages/app capture:sla-fixtures
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';
import { mapBenchmarkRow } from '@semianalysisai/inferencex-db/etl/benchmark-mapper';
import { createSkipTracker } from '@semianalysisai/inferencex-db/etl/skip-tracker';
import {
  encodeSlaAttempts,
  SLA_ATTEMPTS_VERSION,
  slaAttemptsFromExport,
  type SlaAttemptsBlob,
} from '@semianalysisai/inferencex-db/etl/sla-attempts';
import {
  httpRangeReader,
  listRemoteZip,
  readRemoteZipEntry,
  type RangeReader,
  type RemoteZipEntry,
} from '@semianalysisai/inferencex-db/lib/remote-zip';

import {
  buildSlaConfigs,
  type SlaCapturedRun,
  type SlaConfigRow,
  type SlaExcludedPoint,
  type SlaTargetsConfig,
} from '../src/lib/sla-targets/dataset';
import type { SlaAttemptsFixture, SlaTargetsFixture } from '../src/lib/sla-targets/dataset.server';
import {
  FIXTURE_MANIFEST_FILENAME,
  fixtureSha256,
  fixtureTopLevel,
  type FixtureManifest,
} from '../src/lib/testing/test-fixture-manifest';

const REPO = 'SemiAnalysisAI/InferenceX';
const API = `https://api.github.com/repos/${REPO}`;
const FIXTURES_DIR = resolve(import.meta.dirname, '..', 'cypress', 'fixtures', 'api');

/**
 * The runs the snapshot is read from. `include` limits a run to the result
 * names that match, so the fixture stays small enough to review.
 */
interface CaptureSource {
  runId: string;
  include?: RegExp;
  /**
   * Read the profile export alone, without the harness log and aggregate.
   * That is all the app's database holds for points ingested before ingest
   * read those files, so this shows how such a point evaluates: explicit
   * outcomes, but no count of dispatched attempts.
   */
  exportOnly?: boolean;
}

const SOURCES: CaptureSource[] = [
  // DeepSeek-V4-Pro, B300, SGLang: full sweeps from 1 to 512 replay lanes, with cutoff cancellations.
  { runId: '36463674051' },
  // DeepSeek-V4-Pro, B200, Dynamo + SGLang: includes a 256-lane attempt the harness aborted on HTTP 503s.
  { runId: '40421997301' },
  // GLM-5.3-Flash, MI325X, SGLang: low concurrency, with and without KV offload.
  { runId: '43561310271' },
  // Kimi-K3.1-Pro, GB300, Dynamo + SGLang: explicit errors, cutoff cancellations, a failed job and
  // a point without an export. The 180-lane point is left out to keep the fixture small.
  { runId: '43587669179', include: /^(?!.*_conc180_)/u },
  // DeepSeek-V4-Pro, H200, Dynamo + SGLang, read as the database stores historical points.
  { runId: '34857875250', exportOnly: true },
];

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
const headers: Record<string, string> = {
  'User-Agent': 'inferencex-fixture-capture',
  Accept: 'application/vnd.github+json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { headers });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

interface Artifact {
  id: number;
  name: string;
  size_in_bytes: number;
  created_at: string;
  expired: boolean;
}

async function listArtifacts(runId: string): Promise<Artifact[]> {
  const all: Artifact[] = [];
  for (let page = 1; ; page += 1) {
    const { artifacts } = await api<{ artifacts: Artifact[] }>(
      `/actions/runs/${runId}/artifacts?per_page=100&page=${page}`,
    );
    all.push(...artifacts);
    if (artifacts.length < 100) return all.filter((artifact) => !artifact.expired);
  }
}

/** A reader over the archive of an artifact, and the entries it holds. */
async function openArtifact(
  artifact: Artifact,
): Promise<{ read: RangeReader; entries: RemoteZipEntry[] }> {
  const response = await fetch(`${API}/actions/artifacts/${artifact.id}/zip`, {
    headers,
    redirect: 'manual',
  });
  const location = response.headers.get('location');
  if (!location) throw new Error(`artifact ${artifact.name}: no download location`);
  const read = httpRangeReader(location);
  return { read, entries: await listRemoteZip(read, artifact.size_in_bytes) };
}

async function readJsonArtifact(artifact: Artifact): Promise<Record<string, unknown> | null> {
  const { read, entries } = await openArtifact(artifact);
  const entry = entries.find((candidate) => candidate.name.endsWith('.json'));
  if (!entry) return null;
  const body = await readRemoteZipEntry(read, entry);
  return JSON.parse(body.toString('utf8')) as Record<string, unknown>;
}

function* lines(buffer: Buffer): Generator<string> {
  let start = 0;
  while (start < buffer.length) {
    const newline = buffer.indexOf(10, start);
    const end = newline === -1 ? buffer.length : newline;
    yield buffer.toString('utf8', start, end);
    start = end + 1;
  }
}

/** Build the attempt data of one `agentic_*` artifact, or `null` when it holds no export. */
async function readAttempts(
  artifact: Artifact,
  exportOnly = false,
): Promise<SlaAttemptsBlob | null> {
  const { read, entries } = await openArtifact(artifact);
  const find = (suffix: string) => entries.find((entry) => entry.name.endsWith(suffix));
  const jsonl = find('aiperf_artifacts/profile_export.jsonl');
  if (!jsonl) return null;
  if (exportOnly) return slaAttemptsFromExport(lines(await readRemoteZipEntry(read, jsonl)));
  const log = find('aiperf_artifacts/logs/aiperf.log') ?? find('benchmark.log');
  const aggregate = find('aiperf_artifacts/profile_export_aiperf.json');
  const logBody = log ? await readRemoteZipEntry(read, log) : null;
  const aggregateBody = aggregate ? await readRemoteZipEntry(read, aggregate) : null;
  return slaAttemptsFromExport(lines(await readRemoteZipEntry(read, jsonl)), {
    harnessLog: logBody ? logBody.toString('utf8') : null,
    aggregate: aggregateBody ? (JSON.parse(aggregateBody.toString('utf8')) as unknown) : undefined,
  });
}

/** A result name without its trailing hash and with the load removed: one per configuration. */
function configStem(resultName: string): string {
  return resultName.replace(/-[0-9a-f]{20}$/u, '').replace(/_conc\d+(?=_|$)/u, '_conc*');
}

interface CapturedPoint {
  model: string;
  row: SlaConfigRow;
  stem: string;
  artifact: string | null;
  runAttempt: number | null;
  harnessVersion: string | null;
  datasetSlug: string | null;
  blob: SlaAttemptsBlob | null;
  createdAt: string;
}

interface CapturedFailure extends SlaExcludedPoint {
  stem: string;
  runUrl: string;
}

interface RunInfo {
  html_url: string;
  display_title: string;
  head_sha: string;
  created_at: string;
}

interface JobEvent {
  result_filename?: string;
  run_attempt?: number;
  conc?: number;
  outcome?: string;
  error?: { message?: string } | null;
  github?: { job_url?: string };
  versions?: { agentx_harness?: string };
}

async function captureRun(
  { runId, include, exportOnly }: CaptureSource,
  nextId: () => number,
): Promise<{ run: SlaCapturedRun; points: CapturedPoint[]; failures: CapturedFailure[] }> {
  const info = await api<RunInfo>(`/actions/runs/${runId}`);
  const artifacts = await listArtifacts(runId);
  const byName = new Map<string, Artifact>();
  for (const artifact of artifacts) {
    const existing = byName.get(artifact.name);
    if (!existing || artifact.created_at > existing.created_at) byName.set(artifact.name, artifact);
  }
  console.log(`run ${runId}: ${artifacts.length} artifacts`);

  const harnessByResult = new Map<string, string>();
  const failedEvents: JobEvent[] = [];
  for (const artifact of byName.values()) {
    if (!artifact.name.startsWith('job_event_') || artifact.name.includes('_lm-eval_')) continue;
    const event = (await readJsonArtifact(artifact)) as JobEvent | null;
    if (!event?.result_filename) continue;
    if (event.versions?.agentx_harness) {
      harnessByResult.set(event.result_filename, event.versions.agentx_harness);
    }
    if (event.outcome === 'failure') failedEvents.push(event);
  }

  const points: CapturedPoint[] = [];
  for (const artifact of byName.values()) {
    if (!artifact.name.startsWith('bmk_agentic_')) continue;
    const resultName = artifact.name.slice('bmk_agentic_'.length);
    if (include && !include.test(resultName)) continue;
    const raw = await readJsonArtifact(artifact);
    const params = raw ? mapBenchmarkRow(raw, createSkipTracker(), null, runId) : null;
    if (!raw || !params) {
      console.warn(`  ${resultName}: result could not be mapped, left out`);
      continue;
    }
    const exportArtifact = byName.get(`agentic_${resultName}`) ?? null;
    const blob = exportArtifact ? await readAttempts(exportArtifact, exportOnly) : null;
    const dataset = raw.dataset as { hf_dataset_name?: string } | undefined;
    const { config } = params;
    points.push({
      model: DB_MODEL_TO_DISPLAY[config.model] ?? config.model,
      stem: configStem(resultName),
      artifact: blob ? `agentic_${resultName}` : null,
      runAttempt: typeof raw.run_attempt === 'number' ? raw.run_attempt : null,
      harnessVersion: harnessByResult.get(resultName) ?? null,
      datasetSlug: dataset?.hf_dataset_name ?? null,
      blob,
      createdAt: artifact.created_at,
      row: {
        id: nextId(),
        hardware: config.hardware,
        framework: config.framework,
        precision: config.precision,
        spec_method: config.specMethod,
        disagg: config.disagg,
        is_multinode: config.isMultinode,
        prefill_tp: config.prefillTp,
        prefill_ep: config.prefillEp,
        prefill_dp_attention: config.prefillDpAttn,
        prefill_num_workers: config.prefillNumWorkers,
        decode_tp: config.decodeTp,
        decode_ep: config.decodeEp,
        decode_dp_attention: config.decodeDpAttn,
        decode_num_workers: config.decodeNumWorkers,
        num_prefill_gpu: config.numPrefillGpu,
        num_decode_gpu: config.numDecodeGpu,
        benchmark_type: params.benchmarkType,
        isl: params.isl,
        osl: params.osl,
        conc: params.conc,
        offload_mode: params.offloadMode,
        image: params.image,
        date: info.created_at.slice(0, 10),
        run_url: info.html_url,
        run_started_at: info.created_at,
      },
    });
    console.log(
      `  ${resultName}: ${blob ? `${blob.set.completed.ttftUs.length} completed, log ${blob.source.harnessLog}` : 'no export artifact'}`,
    );
  }

  const failures: CapturedFailure[] = [];
  for (const event of failedEvents) {
    const resultName = event.result_filename!;
    if (include && !include.test(resultName)) continue;
    if (byName.has(`bmk_agentic_${resultName}`) || typeof event.conc !== 'number') continue;
    const exportArtifact = byName.get(`agentic_${resultName}`);
    const partial = exportArtifact ? await readAttempts(exportArtifact) : null;
    const aborted = partial?.source.abortReason ?? null;
    const observed = Object.fromEntries(
      (partial?.set.other ?? [])
        .filter((entry) => entry.outcome === 'failed')
        .map((entry) => [entry.failureClass ?? 'unclassified', entry.count]),
    );
    failures.push({
      stem: configStem(resultName),
      runUrl: info.html_url,
      concurrency: event.conc,
      // The harness stops a run itself only when the service fails too many requests.
      category: aborted?.startsWith('(failed_request_threshold)')
        ? 'service_failure'
        : 'undetermined',
      reason: aborted
        ? `Load generator aborted the run ${aborted}`
        : (event.error?.message ?? 'The job failed without a recorded reason.'),
      runAttempt: event.run_attempt ?? null,
      jobUrl: event.github?.job_url ?? null,
      artifact: exportArtifact ? exportArtifact.name : null,
      observedFailures: Object.keys(observed).length > 0 ? observed : null,
    });
    console.log(`  ${resultName}: failed load point (${aborted ?? event.error?.message})`);
  }

  return {
    run: {
      runId,
      runUrl: info.html_url,
      title: info.display_title,
      headSha: info.head_sha,
      createdAt: info.created_at,
    },
    points,
    failures,
  };
}

async function writeFixture(name: string, data: unknown, source: string, capturedAt: string) {
  const body = `${JSON.stringify(data)}\n`;
  await writeFile(resolve(FIXTURES_DIR, `${name}.json`), body);
  const manifestPath = resolve(FIXTURES_DIR, FIXTURE_MANIFEST_FILENAME);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as FixtureManifest;
  manifest.generatedAt = capturedAt;
  manifest.fixtures[name] = {
    bytes: Buffer.byteLength(body),
    capturedAt,
    sha256: fixtureSha256(body),
    source,
    topLevel: fixtureTopLevel(data),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${name}.json (${Buffer.byteLength(body)} bytes)`);
}

const capturedAt = new Date().toISOString();
let lastId = 0;
const nextId = () => {
  lastId += 1;
  return lastId;
};
const captured = [];
for (const source of SOURCES) captured.push(await captureRun(source, nextId));

// One point per configuration and load: the latest attempt of the run wins, as in ingest.
const latest = new Map<string, CapturedPoint>();
for (const point of captured.flatMap((run) => run.points)) {
  const key = `${point.row.run_url}|${point.stem}|${point.row.conc}`;
  const existing = latest.get(key);
  const order = (candidate: CapturedPoint) =>
    `${String(candidate.runAttempt ?? 0).padStart(4, '0')}|${candidate.createdAt}`;
  if (!existing || order(point) > order(existing)) latest.set(key, point);
}
const points = [...latest.values()];
const failures = captured.flatMap((run) => run.failures);
const runById = new Map(captured.map(({ run }) => [run.runId, run]));
const provenance = (runId: string | null) => {
  const run = runId === null ? undefined : runById.get(runId);
  return run ? { benchmarkCommit: run.headSha, datasetSlug: null } : undefined;
};

const models: Record<string, SlaTargetsConfig[]> = {};
const attempts: SlaAttemptsFixture = {};
let finalId = 0;
for (const model of [...new Set(points.map((point) => point.model))].toSorted()) {
  const ofModel = points.filter((point) => point.model === model);
  const byId = new Map(ofModel.map((point) => [point.row.id, point]));
  const configs = buildSlaConfigs(
    ofModel.map((point) => point.row),
    (id) => Boolean(byId.get(id)?.blob),
    provenance,
  );
  for (const config of configs) {
    const first = byId.get(config.points[0].id)!;
    config.datasetSlug = first.datasetSlug;
    config.harnessVersion = first.harnessVersion;
    config.excluded = failures
      .filter((failure) => failure.stem === first.stem && failure.runUrl === config.runUrl)
      .map(({ stem: _stem, runUrl: _runUrl, ...failure }) => failure)
      .toSorted(
        (a, b) => a.concurrency - b.concurrency || (a.runAttempt ?? 0) - (b.runAttempt ?? 0),
      );
    for (const point of config.points) {
      const source = byId.get(point.id)!;
      finalId += 1;
      point.id = finalId;
      point.artifact = source.artifact;
      point.runAttempt = source.runAttempt;
      if (source.blob) attempts[finalId] = encodeSlaAttempts(source.blob).toString('base64');
    }
  }
  models[model] = configs;
  console.log(`${model}: ${configs.length} configurations`);
}

const source = `GitHub Actions artifacts of ${REPO}, runs ${SOURCES.map((entry) => entry.runId).join(', ')}: bmk_agentic_* results, and profile_export.jsonl, aiperf.log and profile_export_aiperf.json of agentic_* reduced to per-attempt data by slaAttemptsFromExport`;
const dataset: SlaTargetsFixture = {
  capturedAt,
  source: `GitHub Actions artifacts of ${REPO}`,
  attemptsVersion: SLA_ATTEMPTS_VERSION,
  runs: captured.map(({ run }) => run),
  models,
};
await writeFixture('sla-targets', dataset, source, capturedAt);
await writeFixture('sla-attempts', attempts, source, capturedAt);
