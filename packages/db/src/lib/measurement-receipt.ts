import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { sha256, sha256File, type ArchiveMember } from './artifact-archive';
import { mapBenchmarkRow } from '../etl/benchmark-mapper';
import { mapAggEvalRow, mapEvalRow } from '../etl/eval-mapper';
import { createSkipTracker } from '../etl/skip-tracker';

export interface ReceiptArtifact {
  id: number;
  name: string;
  sha256: string;
  run_id: string;
  members: ArchiveMember[];
}
export interface ReceiptPoint {
  point_id: string;
  bundle_digest: string;
  execution_id: string;
  source_run_id: string;
  source_attempt: number;
  kind: 'throughput' | 'eval';
  concurrency: number;
  topology: { kind: 'aggregate'; nodes: 1; serving_gpus: number; tp: number; ep: number };
  artifact_ids: number[];
  normalized_artifact_id: number;
  normalized_path: string;
  normalized_format: 'normalized' | 'lm-eval';
  metadata_path: string | null;
  execution_artifact_id: number;
  execution_path: string;
  native_manifest_sha256: string;
  config: Record<string, string>;
  required_metrics: string[];
  task: string | null;
  filters: string[];
  sample_count: number;
  samples_artifact_id: number | null;
  samples_path: string | null;
  dataset: Record<string, string | number>;
}
export interface MeasurementReceipt {
  kind: 'source-measurement-receipt';
  version: 1;
  receipt_id: string;
  repository: string;
  source_run_id: string;
  source_attempt: number;
  source_head_sha: string;
  bundle_digest: string;
  contracts: { raw: string; normalized: 'agentx-v1'; publication: 1 };
  issuer: {
    repository: string;
    run_id: string;
    job: string;
    workflow_sha: string;
    collector_sha: string;
  };
  points: ReceiptPoint[];
  artifacts: ReceiptArtifact[];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    throw new Error('Receipt numbers must be safe integers');
  return JSON.stringify(value);
}
function positive(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
function digest(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}
function safePath(value: string): boolean {
  return (
    Boolean(value) &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:/u.test(value) &&
    value.split('/').every((part) => Boolean(part) && part !== '.' && part !== '..')
  );
}
function finiteJson(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('Non-finite result value');
  if (value && typeof value === 'object') Object.values(value).forEach(finiteJson);
}

/** A hash establishes immutability; the transport's trusted issuer pin establishes authority. */
export function parseMeasurementReceipt(
  bytes: Buffer,
  expectedSha256: string,
  issuerSha: string,
): MeasurementReceipt {
  if (!digest(expectedSha256) || sha256(bytes) !== expectedSha256)
    throw new Error('Receipt transport digest mismatch');
  const receipt = JSON.parse(bytes.toString('utf8')) as MeasurementReceipt;
  if (
    receipt.kind !== 'source-measurement-receipt' ||
    receipt.version !== 1 ||
    receipt.contracts?.publication !== 1 ||
    receipt.contracts?.normalized !== 'agentx-v1' ||
    receipt.contracts?.raw !== 'aiperf-1.4'
  )
    throw new Error('Unsupported required receipt version/contract');
  if (!/^[a-f0-9]{40}$/u.test(issuerSha) || receipt.issuer?.workflow_sha !== issuerSha)
    throw new Error('Untrusted receipt issuer revision');
  const { receipt_id, ...payload } = receipt;
  if (!digest(receipt_id) || sha256(canonical(payload)) !== receipt_id)
    throw new Error('Receipt content digest mismatch');
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(receipt.repository) ||
    !/^[1-9]\d*$/u.test(receipt.source_run_id) ||
    !positive(receipt.source_attempt) ||
    !digest(receipt.bundle_digest)
  )
    throw new Error('Invalid receipt source identity');
  if (
    !Array.isArray(receipt.points) ||
    receipt.points.length === 0 ||
    !Array.isArray(receipt.artifacts)
  )
    throw new Error('Empty receipt points/artifacts');
  const points = new Set<string>();
  const required = new Set<number>();
  for (const point of receipt.points) {
    if (
      !digest(point.point_id) ||
      !digest(point.bundle_digest) ||
      points.has(point.point_id) ||
      !point.execution_id ||
      !positive(point.concurrency) ||
      !positive(point.source_attempt) ||
      !/^[1-9]\d*$/u.test(point.source_run_id) ||
      !['throughput', 'eval'].includes(point.kind)
    )
      throw new Error('Invalid/duplicate receipt point');
    points.add(point.point_id);
    const topology = point.topology;
    if (
      topology?.kind !== 'aggregate' ||
      topology.nodes !== 1 ||
      ![topology.tp, topology.ep, topology.serving_gpus].every(positive)
    )
      throw new Error('Unsupported receipt topology');
    if (
      !Array.isArray(point.artifact_ids) ||
      !point.artifact_ids.every(positive) ||
      new Set(point.artifact_ids).size !== point.artifact_ids.length ||
      !point.artifact_ids.includes(point.normalized_artifact_id) ||
      !safePath(point.normalized_path) ||
      !point.required_metrics?.length
    )
      throw new Error('Invalid point artifact/metric requirements');
    if (
      !point.artifact_ids.includes(point.execution_artifact_id) ||
      !safePath(point.execution_path) ||
      !digest(point.native_manifest_sha256) ||
      !point.config ||
      Object.keys(point.config).length === 0
    )
      throw new Error('Missing execution/config contract');
    point.artifact_ids.forEach((id) => required.add(id));
    if (
      !['normalized', 'lm-eval'].includes(point.normalized_format) ||
      (point.normalized_format === 'lm-eval' &&
        (point.kind !== 'eval' || !point.metadata_path || !safePath(point.metadata_path)))
    )
      throw new Error('Invalid normalized format/metadata requirement');
    if (
      point.kind === 'eval' &&
      (!point.task ||
        !positive(point.sample_count) ||
        !point.filters?.length ||
        !point.artifact_ids.includes(point.samples_artifact_id!) ||
        !point.samples_path ||
        !safePath(point.samples_path))
    )
      throw new Error('Missing eval sample contract');
  }
  const ids = new Set<number>();
  const names = new Set<string>();
  for (const artifact of receipt.artifacts) {
    if (
      !positive(artifact.id) ||
      ids.has(artifact.id) ||
      !required.has(artifact.id) ||
      !digest(artifact.sha256) ||
      !/^[A-Za-z0-9_.-]+$/u.test(artifact.name) ||
      ['.', '..'].includes(artifact.name) ||
      names.has(artifact.name)
    )
      throw new Error('Invalid/duplicate receipt artifact');
    ids.add(artifact.id);
    names.add(artifact.name);
    const members = new Set<string>();
    for (const member of artifact.members) {
      if (
        !safePath(member.path) ||
        members.has(member.path) ||
        !digest(member.sha256) ||
        !Number.isSafeInteger(member.size) ||
        member.size < 0
      )
        throw new Error('Invalid receipt archive member');
      members.add(member.path);
    }
    for (const point of receipt.points.filter((candidate) =>
      candidate.artifact_ids.includes(artifact.id),
    )) {
      if (point.source_run_id !== artifact.run_id) throw new Error('Point artifact owner mismatch');
      if (point.execution_artifact_id === artifact.id && !members.has(point.execution_path))
        throw new Error('Missing execution member');
      if (point.normalized_artifact_id === artifact.id && !members.has(point.normalized_path))
        throw new Error('Missing normalized member');
      if (
        point.normalized_artifact_id === artifact.id &&
        point.metadata_path &&
        !members.has(point.metadata_path)
      )
        throw new Error('Missing lm-eval metadata member');
      if (point.samples_artifact_id === artifact.id && !members.has(point.samples_path!))
        throw new Error('Missing samples member');
    }
  }
  if (ids.size !== required.size) throw new Error('Receipt artifact set incomplete');
  return receipt;
}

export function receiptFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): MeasurementReceipt | null {
  const required = env.INGEST_RECEIPT_REQUIRED === '1';
  if (!env.INGEST_RECEIPT_PATH) {
    if (required) throw new Error('Required measurement receipt missing');
    return null;
  }
  if (!env.INGEST_RECEIPT_SHA256 || !env.INGEST_RECEIPT_ISSUER_SHA)
    throw new Error('Receipt requires trusted digest and issuer revision');
  return parseMeasurementReceipt(
    fs.readFileSync(env.INGEST_RECEIPT_PATH),
    env.INGEST_RECEIPT_SHA256,
    env.INGEST_RECEIPT_ISSUER_SHA,
  );
}

export function mapReceiptPointRows(
  receipt: MeasurementReceipt,
  root: string,
  point: ReceiptPoint,
) {
  const artifact = receipt.artifacts.find((item) => item.id === point.normalized_artifact_id)!;
  const value = JSON.parse(
    fs.readFileSync(path.join(root, artifact.name, point.normalized_path), 'utf8'),
  );
  finiteJson(value);
  const tracker = createSkipTracker();
  if (point.normalized_format === 'lm-eval') {
    const meta = JSON.parse(
      fs.readFileSync(path.join(root, artifact.name, point.metadata_path!), 'utf8'),
    );
    finiteJson(meta);
    return { rows: [meta], mapped: mapEvalRow(meta, value, tracker) };
  }
  const rows: Record<string, any>[] = Array.isArray(value) ? value : [value];
  const mapped = rows.map((row) =>
    point.kind === 'throughput' ? mapBenchmarkRow(row, tracker) : mapAggEvalRow(row, tracker),
  );
  if (mapped.some((row) => !row) || Object.values(tracker.skips).some((count) => count > 0))
    throw new Error('Unmapped required normalized input');
  return { rows, mapped };
}

/** Validate the complete snapshot before the first database write, including raw filter coverage. */
export function verifyMeasurementSnapshot(receipt: MeasurementReceipt, root: string): void {
  const artifacts = new Map(receipt.artifacts.map((artifact) => [artifact.id, artifact]));
  const readMember = (id: number, member: string) =>
    fs.readFileSync(path.join(root, artifacts.get(id)!.name, member), 'utf8');
  const allowedRoots = new Set([
    ...receipt.artifacts.map((artifact) => artifact.name),
    '.receipt-objects',
    'changelog-metadata',
    'reused-ingest-metadata',
  ]);
  for (const entry of fs.readdirSync(root)) {
    // Fixture/transport files outside ingest discovery do not produce rows.
    if (
      (entry.startsWith('bmk_') ||
        entry.startsWith('results_') ||
        entry.startsWith('eval_') ||
        entry.startsWith('agentic_') ||
        entry.startsWith('server_logs_')) &&
      !allowedRoots.has(entry)
    )
      throw new Error(`Unaccepted artifact directory: ${entry}`);
  }
  for (const artifact of receipt.artifacts) {
    const files: string[] = [];
    const walk = (directory: string, prefix: string) => {
      if (fs.lstatSync(directory).isSymbolicLink())
        throw new Error('Symlink in receipt artifact path');
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) throw new Error('Symlink in receipt artifact path');
        if (entry.isDirectory()) walk(path.join(directory, entry.name), relative);
        else if (entry.isFile()) files.push(relative);
        else throw new Error('Special file in receipt artifact');
      }
    };
    walk(path.join(root, artifact.name), '');
    if (
      !isDeepStrictEqual(files.toSorted(), artifact.members.map((member) => member.path).toSorted())
    )
      throw new Error('Receipt member set differs from extracted files');
    for (const member of artifact.members) {
      const file = path.join(root, artifact.name, member.path);
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid receipt file: ${file}`);
      if (stat.size !== member.size || sha256File(file) !== member.sha256)
        throw new Error(`Changed receipt member: ${file}`);
    }
  }
  const expectedByFile = new Map<string, Set<string>>();
  const actualByFile = new Map<string, number>();
  for (const point of receipt.points) {
    const execution = JSON.parse(readMember(point.execution_artifact_id, point.execution_path));
    if (
      execution.schema_version !== 1 ||
      execution.point_id !== point.point_id ||
      execution.execution_id !== point.execution_id ||
      execution.bundle_digest !== point.bundle_digest ||
      execution.mode !== point.kind ||
      execution.client_exit_code !== 0 ||
      execution.source?.repository !== receipt.repository ||
      String(execution.source?.run_id) !== point.source_run_id ||
      execution.source?.attempt !== point.source_attempt ||
      execution.source?.head_sha !== receipt.source_head_sha ||
      execution.native_receipt?.state !== 'COMPLETED' ||
      execution.native_receipt?.manifest_sha256 !== point.native_manifest_sha256 ||
      !/^[1-9]\d*$/u.test(String(execution.native_receipt?.job_id))
    )
      throw new Error('Execution evidence differs from expected contract');
    const { rows, mapped: allMapped } = mapReceiptPointRows(receipt, root, point);
    const mapped = allMapped.filter(
      (row) =>
        row &&
        row.conc === point.concurrency &&
        (point.kind === 'throughput' || ('task' in row && row.task === point.task)),
    );
    if (mapped.length !== 1)
      throw new Error(
        `Expected exactly one normalized point ${point.point_id}, got ${mapped.length}`,
      );
    const row = mapped[0]!;
    const config = row.config;
    for (const [field, expected] of Object.entries(point.config)) {
      const actual =
        field === 'recipeFingerprint' && 'recipeFingerprint' in row
          ? row.recipeFingerprint
          : config[field as keyof typeof config];
      if (actual !== expected) throw new Error(`Configuration identity mismatch: ${field}`);
    }
    if (
      config.disagg ||
      config.isMultinode ||
      config.decodeTp !== point.topology.tp ||
      config.decodeEp !== point.topology.ep ||
      config.numDecodeGpu !== point.topology.serving_gpus ||
      config.numPrefillGpu !== point.topology.serving_gpus
    )
      throw new Error(`Topology mismatch: ${point.point_id}`);
    for (const metric of point.required_metrics)
      if (!Number.isFinite(row.metrics[metric]) || row.metrics[metric] < 0)
        throw new Error(`Missing/non-finite metric: ${metric}`);
    if (point.dataset && Object.keys(point.dataset).length > 0) {
      const selected = rows.find(
        (item: Record<string, unknown>) => Number(item.conc ?? item.users) === point.concurrency,
      );
      if (!isDeepStrictEqual(selected?.dataset, point.dataset))
        throw new Error('Dataset identity mismatch');
    }
    const key = `${point.normalized_artifact_id}/${point.normalized_path}`;
    actualByFile.set(key, allMapped.length);
    const covered = expectedByFile.get(key) ?? new Set();
    covered.add(`${point.kind}:${point.concurrency}:${point.task ?? ''}`);
    expectedByFile.set(key, covered);
    if (point.kind === 'eval') {
      const records = readMember(point.samples_artifact_id!, point.samples_path!)
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const documents = new Map<number, Set<string>>();
      for (const sample of records) {
        finiteJson(sample);
        if (
          !Number.isSafeInteger(sample.doc_id) ||
          sample.doc_id < 0 ||
          !point.filters.includes(sample.filter) ||
          (sample.task_name && sample.task_name !== point.task)
        )
          throw new Error('Invalid evaluation sample identity');
        const filters = documents.get(sample.doc_id) ?? new Set<string>();
        if (filters.has(sample.filter)) throw new Error('Duplicate evaluation sample/filter');
        filters.add(sample.filter);
        documents.set(sample.doc_id, filters);
      }
      if (row.metrics.n_eff !== point.sample_count)
        throw new Error('Evaluation summary sample count mismatch');
      if (
        documents.size !== point.sample_count ||
        [...documents.keys()].some((id) => id >= point.sample_count) ||
        [...documents.values()].some((filters) => filters.size !== point.filters.length)
      )
        throw new Error('Incomplete evaluation sample/filter coverage');
    }
  }
  for (const [key, covered] of expectedByFile) {
    if (actualByFile.get(key) !== covered.size)
      throw new Error('Unexpected/conflicting normalized point multiplicity');
  }
}

export interface PublicationRecord {
  kind: 'publication-record';
  version: 1;
  receipt_id: string;
  receipt_artifact_id: number;
  receipt_artifact_sha256: string;
  source_run_id: string;
  merge_run_id: string;
  merge_sha: string;
  changelog_artifact_id: number;
  changelog_artifact_sha256: string;
  ingest_sha: string;
  app_sha: string;
}
export function publicationFromEnvironment(
  receipt: MeasurementReceipt,
  mergeRunId: string,
  env: Record<string, string | undefined> = process.env,
): PublicationRecord | null {
  if (!env.INGEST_PUBLICATION_RECORD_PATH) {
    if (env.INGEST_PUBLICATION_REQUIRED === '1' || mergeRunId !== receipt.source_run_id)
      throw new Error('Production/recovery requires a publication record');
    return null;
  }
  const bytes = fs.readFileSync(env.INGEST_PUBLICATION_RECORD_PATH);
  if (
    !digest(env.INGEST_PUBLICATION_RECORD_SHA256) ||
    sha256(bytes) !== env.INGEST_PUBLICATION_RECORD_SHA256
  )
    throw new Error('Publication record digest mismatch');
  const record = JSON.parse(bytes.toString('utf8')) as PublicationRecord;
  if (
    record.kind !== 'publication-record' ||
    record.version !== 1 ||
    record.receipt_id !== receipt.receipt_id ||
    record.source_run_id !== receipt.source_run_id ||
    record.merge_run_id !== mergeRunId ||
    !positive(record.receipt_artifact_id) ||
    !digest(record.receipt_artifact_sha256) ||
    !positive(record.changelog_artifact_id) ||
    !digest(record.changelog_artifact_sha256) ||
    ![record.merge_sha, record.ingest_sha, record.app_sha].every((value) =>
      /^[a-f0-9]{40}$/u.test(value),
    )
  )
    throw new Error('Invalid/unsupported publication record');
  if (env.GITHUB_SHA && record.ingest_sha !== env.GITHUB_SHA)
    throw new Error('Publication ingest revision differs from the executing app checkout');
  return record;
}
