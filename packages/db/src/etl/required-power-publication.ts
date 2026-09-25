import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { mapBenchmarkRow, type BenchmarkParams } from './benchmark-mapper';
import { createSkipTracker } from './skip-tracker';
import { configCacheKey } from './config-cache';
import { CHANGELOG_ARTIFACT_NAME, REQUIRED_POWER_MANIFEST } from '../lib/ci-artifact-preparation';

type JsonRow = Record<string, unknown>;
export interface RequiredPowerSource {
  runId: number;
  runAttempt: number;
  headSha: string | null;
}
export interface BenchmarkArtifactRows {
  path: string;
  rows: unknown[];
  contents?: Buffer | string;
}

function object(value: unknown, label: string): JsonRow {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Required power: invalid ${label}`);
  return value as JsonRow;
}

function identity(
  fingerprint: unknown,
  conc: unknown,
  scenario: string,
  isl: unknown,
  osl: unknown,
) {
  if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(fingerprint))
    throw new Error('Required power: missing or invalid recipe fingerprint');
  if (typeof conc !== 'number' || !Number.isSafeInteger(conc) || conc <= 0)
    throw new Error('Required power: invalid concurrency');
  return JSON.stringify([fingerprint, conc, scenario, isl, osl]);
}

function mappedIdentity(row: BenchmarkParams): string {
  return JSON.stringify([row.recipeFingerprint, row.conc, row.benchmarkType, row.isl, row.osl]);
}

/** A purge or later ingest filter must not turn an incomplete required scope into success. */
export function assertRequiredPowerPointsRetained(
  required: readonly BenchmarkParams[],
  retained: readonly BenchmarkParams[],
): void {
  const retainedIdentity = (row: BenchmarkParams) =>
    JSON.stringify([configCacheKey(row.config), row.offloadMode, mappedIdentity(row)]);
  const present = new Map(retained.map((row) => [retainedIdentity(row), row]));
  for (const row of required) {
    const key = retainedIdentity(row);
    if (!present.has(key))
      throw new Error(`Required power: missing benchmark point after ingest ${key}`);
    const actual = present.get(key)!;
    for (const field of [
      'power_valid',
      'power_metric_schema_version',
      'avg_power_w',
      'avg_total_gpu_power_w',
      'total_gpu_energy_j',
      'joules_per_output_token',
    ])
      if (actual.metrics[field] !== row.metrics[field])
        throw new Error(`Required power: ${field} changed before ingest for ${key}`);
  }
}

/** Validate only the producer-declared required scope; legacy optional points remain unchanged. */
export function verifyRequiredPowerPublication(
  manifestValue: unknown,
  artifacts: readonly BenchmarkArtifactRows[],
  source: RequiredPowerSource,
): BenchmarkParams[] {
  const manifest = object(manifestValue, 'sweep manifest');
  if (manifest['schema-version'] !== 2)
    throw new Error('Required power: incompatible manifest schema-version (expected 2)');
  const publication = object(manifest.publication, 'publication policy');
  if (
    !['incremental', 'replacement'].includes(String(publication.mode)) ||
    !Array.isArray(publication.replacement_scope) ||
    (publication.mode === 'incremental' && publication.replacement_scope.length > 0)
  )
    throw new Error('Required power: invalid publication policy');
  const replacementScopes = new Set<string>();
  for (const value of publication.replacement_scope) {
    const replacement = object(value, 'exact replacement scope');
    if (
      typeof replacement.curve_scope !== 'string' ||
      !replacement.curve_scope ||
      replacementScopes.has(replacement.curve_scope) ||
      !Number.isSafeInteger(replacement.previous_snapshot_workflow_run_id) ||
      Number(replacement.previous_snapshot_workflow_run_id) <= 0 ||
      !Array.isArray(replacement.removed_point_identities) ||
      replacement.removed_point_identities.length === 0 ||
      replacement.removed_point_identities.some((id) => typeof id !== 'string' || !id) ||
      new Set(replacement.removed_point_identities).size !==
        replacement.removed_point_identities.length
    )
      throw new Error('Required power: invalid exact replacement scope');
    replacementScopes.add(replacement.curve_scope);
  }
  const declaredAttempt = manifest['run-attempt'];
  if (
    manifest['run-id'] !== source.runId ||
    !Number.isSafeInteger(source.runId) ||
    source.runId <= 0 ||
    !Number.isSafeInteger(source.runAttempt) ||
    source.runAttempt <= 0 ||
    typeof declaredAttempt !== 'number' ||
    !Number.isSafeInteger(declaredAttempt) ||
    declaredAttempt <= 0 ||
    declaredAttempt > source.runAttempt ||
    !source.headSha ||
    !/^[a-f0-9]{40}$/u.test(source.headSha) ||
    manifest.head !== source.headSha
  )
    throw new Error('Required power: manifest source run, attempt or head does not match');

  const matrix = object(manifest.matrix, 'sweep matrix');
  const expected = new Map<string, JsonRow>();
  for (const topology of ['single_node', 'multi_node']) {
    const buckets = object(matrix[topology], topology);
    for (const [scenario, entries] of Object.entries(buckets)) {
      if (!Array.isArray(entries)) throw new Error(`Required power: invalid ${scenario} matrix`);
      for (const value of entries) {
        const row = object(value, 'matrix row');
        if (row['require-power'] !== true || row['eval-only'] === true) continue;
        if (!['1k1k', '8k1k', 'agentic'].includes(scenario))
          throw new Error(`Required power: unsupported scenario ${scenario}`);
        const agentic = scenario === 'agentic';
        const isl = agentic ? null : row.isl;
        const osl = agentic ? null : row.osl;
        if (!agentic && (isl !== (scenario === '8k1k' ? 8192 : 1024) || osl !== 1024))
          throw new Error(`Required power: inconsistent sequence lengths for ${scenario}`);
        const concurrencies = Array.isArray(row.conc) ? row.conc : [row.conc];
        if (concurrencies.length === 0) throw new Error('Required power: empty concurrency list');
        for (const conc of concurrencies) {
          const key = identity(
            row['recipe-fingerprint'],
            conc,
            agentic ? 'agentic_traces' : 'single_turn',
            isl,
            osl,
          );
          if (expected.has(key)) throw new Error(`Required power: duplicate matrix point ${key}`);
          expected.set(key, { ...row, matrixTopology: topology });
        }
      }
    }
  }
  if (expected.size === 0)
    throw new Error('Required power: manifest has no required benchmark points');

  const seen = new Map<string, { row: JsonRow; path: string; point: BenchmarkParams }>();
  for (const artifact of artifacts) {
    const inFile = new Set<string>();
    for (const value of artifact.rows) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const raw = value as JsonRow;
      const mapped = mapBenchmarkRow(raw, createSkipTracker());
      if (!mapped) continue;
      const fingerprint = mapped.recipeFingerprint;
      // A missing fingerprint cannot match a required point; the missing-point check fails below.
      if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(fingerprint)) continue;
      const key = mappedIdentity(mapped);
      if (!expected.has(key)) continue;
      if (inFile.has(key))
        throw new Error(`Required power: duplicate point ${key} in ${artifact.path}`);
      inFile.add(key);
      const prior = seen.get(key);
      if (prior) {
        // collect-results uploads exact copies of per-job rows in results_bmk.
        if (prior.path === artifact.path || !isDeepStrictEqual(prior.row, raw))
          throw new Error(
            `Required power: conflicting or duplicate point ${key} in ${artifact.path}`,
          );
        continue;
      }
      if (raw.power_valid !== 1 || raw.power_metric_schema_version !== 2)
        throw new Error(`Required power: invalid power verdict for ${key}`);
      const fields = [
        'avg_power_w',
        'avg_total_gpu_power_w',
        'total_gpu_energy_j',
        'joules_per_output_token',
      ];
      if (expected.get(key)?.disagg === true)
        fields.push(
          'prefill_gpu_energy_j',
          'decode_gpu_energy_j',
          'prefill_joules_per_input_token',
          'decode_joules_per_output_token',
        );
      for (const field of fields) {
        const metric = raw[field];
        if (typeof metric !== 'number' || !Number.isFinite(metric) || metric <= 0)
          throw new Error(`Required power: ${field} must be finite and positive for ${key}`);
      }
      seen.set(key, { row: raw, path: artifact.path, point: mapped });
    }
  }
  for (const key of expected.keys()) {
    if (!seen.has(key)) throw new Error(`Required power: missing benchmark point ${key}`);
  }
  verifyPointEvidence(manifest, expected, seen, artifacts);
  return [...seen.values()].map(({ point }) => point);
}

/** Run before any database upsert, including workflow/config metadata writes. */
export function verifyRequiredPowerArtifacts(
  root: string,
  source: RequiredPowerSource,
  required = false,
): BenchmarkParams[] {
  const manifestDir = path.join(root, REQUIRED_POWER_MANIFEST);
  if (!fs.existsSync(manifestDir)) {
    if (required) throw new Error('Required power: sweep manifest missing for required dispatch');
    const metadataDir = path.join(root, CHANGELOG_ARTIFACT_NAME);
    if (fs.existsSync(metadataDir)) {
      for (const name of fs.readdirSync(metadataDir).filter((file) => file.endsWith('.json'))) {
        const metadata = JSON.parse(fs.readFileSync(path.join(metadataDir, name), 'utf8'));
        if (metadata?.['require-power'] === true)
          throw new Error('Required power: sweep manifest missing for required changelog scope');
      }
    }
    return [];
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(manifestDir, 'sweep_manifest.json'), 'utf8'),
  );
  const artifacts: BenchmarkArtifactRows[] = [];
  for (const name of fs.readdirSync(root)) {
    if (!name.startsWith('bmk_') && !name.startsWith('results_')) continue;
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const contents = fs.readFileSync(path.join(dir, file));
      const data = JSON.parse(contents.toString('utf8'));
      artifacts.push({
        path: path.join(name, file),
        rows: Array.isArray(data) ? data : [data],
        contents,
      });
    }
  }
  for (const pointValue of Array.isArray(manifest.points) ? manifest.points : []) {
    const point = object(pointValue, 'point');
    if (!Array.isArray(point.artifacts)) throw new Error('Required power: missing point artifacts');
    for (const value of point.artifacts) {
      const artifact = object(value, 'artifact');
      const relative = safeArtifactPath(artifact.path);
      const file = path.join(root, relative);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile())
        throw new Error(`Required power: missing required artifact ${relative}`);
      if (!fs.realpathSync(file).startsWith(`${fs.realpathSync(root)}${path.sep}`))
        throw new Error(`Required power: artifact escapes bundle ${relative}`);
      if (!artifacts.some((item) => item.path === relative))
        artifacts.push({ path: relative, rows: [], contents: fs.readFileSync(file) });
    }
  }
  const points = verifyRequiredPowerPublication(manifest, artifacts, source);
  // Rerun-failed-jobs keeps successful points and metadata from earlier attempts of this head.
  console.log(
    `  Required power scope: run ${source.runId}, declared attempt ${manifest['run-attempt']}, ingest attempt ${source.runAttempt}`,
  );
  return points;
}

function digest(artifact: BenchmarkArtifactRows): string {
  return createHash('sha256').update(artifact.contents!).digest('hex');
}

function safeArtifactPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Required power: invalid artifact path');
  return value;
}

function positive(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    throw new Error(`Required power: ${label} must be finite and positive`);
  return value;
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`Required power: missing ${label}`);
  return value;
}

function verifyPointEvidence(
  manifest: JsonRow,
  expected: Map<string, JsonRow>,
  seen: Map<string, { row: JsonRow; path: string; point: BenchmarkParams }>,
  artifacts: readonly BenchmarkArtifactRows[],
): void {
  if (!Array.isArray(manifest.points) || manifest.points.length !== expected.size)
    throw new Error('Required power: point manifest does not cover the exact required matrix');
  const verified = new Set<string>();
  const files = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  for (const declaredValue of manifest.points) {
    const declared = object(declaredValue, 'point');
    const id = object(declared.identity, 'point identity');
    const key = identity(
      id.recipe_fingerprint,
      id.concurrency,
      String(id.benchmark_type),
      id.isl,
      id.osl,
    );
    const matched = seen.get(key);
    const matrix = expected.get(key);
    if (!matched || !matrix || verified.has(key))
      throw new Error(`Required power: unexpected or duplicate manifest point ${key}`);
    verified.add(key);
    if (nonempty(declared.config_key, 'config_key') !== matrix['exp-name'])
      throw new Error(`Required power: config_key differs from required matrix for ${key}`);
    const { row, point } = matched;
    for (const [field, rawField] of [
      ['model', 'infmax_model_prefix'],
      ['hardware', 'hw'],
      ['framework', 'framework'],
      ['precision', 'precision'],
    ]) {
      if (
        nonempty(id[field], field) !==
        (row[rawField] ?? (field === 'model' ? row.model : undefined))
      )
        throw new Error(`Required power: ${field} identity differs from benchmark for ${key}`);
    }
    for (const [field, matrixField] of [
      ['model', 'model-prefix'],
      ['hardware', 'runner'],
      ['framework', 'framework'],
      ['precision', 'precision'],
    ]) {
      if (id[field] !== matrix[matrixField])
        throw new Error(
          `Required power: ${field} identity differs from required matrix for ${key}`,
        );
    }
    const topology = object(declared.topology, 'point topology');
    if (
      topology.disagg !== point.config.disagg ||
      topology.is_multinode !== point.config.isMultinode ||
      topology.disagg !== (matrix.disagg === true) ||
      topology.is_multinode !== (matrix.matrixTopology === 'multi_node')
    )
      throw new Error(`Required power: topology differs from benchmark or matrix for ${key}`);
    const rawGpuCount =
      row.num_gpus ??
      (topology.is_multinode
        ? Number(row.num_prefill_gpu) + Number(row.num_decode_gpu)
        : Number(row.tp) * Number(row.pp ?? 1) * Number(row.pcp_size ?? 1));
    if (topology.num_gpus !== rawGpuCount)
      throw new Error(`Required power: num_gpus topology differs from benchmark for ${key}`);
    const topologyFields = [
      'num_prefill_gpu',
      'num_decode_gpu',
      'tp',
      'ep',
      'dp_attention',
      'prefill_tp',
      'prefill_ep',
      'prefill_num_workers',
      'decode_tp',
      'decode_ep',
      'decode_num_workers',
      'pp',
      'pcp_size',
      'dcp_size',
      'prefill_pp',
      'decode_pp',
      'prefill_pcp_size',
      'decode_pcp_size',
      'prefill_dcp_size',
      'decode_dcp_size',
      'prefill_dp_attention',
      'decode_dp_attention',
    ];
    for (const field of topologyFields) {
      if (topology[field] !== row[field])
        throw new Error(`Required power: ${field} topology differs from benchmark for ${key}`);
      const role = field.startsWith('prefill_')
        ? 'prefill'
        : field.startsWith('decode_')
          ? 'decode'
          : null;
      const roleField = role ? field.slice(role.length + 1) : field;
      const matrixField =
        roleField === 'num_workers'
          ? 'num-worker'
          : roleField === 'dp_attention'
            ? 'dp-attn'
            : roleField.replaceAll('_', '-');
      let planned = role
        ? matrix[role]
          ? object(matrix[role], `${role} matrix`)[matrixField]
          : matrix[field.replaceAll('_', '-')]
        : matrix[matrixField];
      if (
        role === 'decode' &&
        matrix.decode &&
        object(matrix.decode, 'decode matrix')['num-worker'] === 0 &&
        ['tp', 'ep', 'pp', 'pcp_size', 'dcp_size'].includes(roleField)
      )
        planned = ['tp', 'ep'].includes(roleField) ? 0 : 1;
      let actual =
        topology[field] ??
        (['pp', 'pcp_size', 'dcp_size'].includes(roleField)
          ? 1
          : roleField === 'dp_attention'
            ? false
            : undefined);
      if (roleField === 'dp_attention' && typeof actual === 'string') actual = actual === 'true';
      const normalizedPlanned =
        roleField === 'dp_attention' && typeof planned === 'string' ? planned === 'true' : planned;
      if (planned !== undefined && actual !== normalizedPlanned)
        throw new Error(
          `Required power: ${field} topology differs from required matrix for ${key}`,
        );
    }
    let plannedGpuCount = matrix['num-gpus'];
    if (matrix.prefill && matrix.decode) {
      plannedGpuCount = 0;
      for (const role of ['prefill', 'decode']) {
        const planned = object(matrix[role], `${role} matrix`);
        const count =
          Number(planned.tp) *
          Number(planned.pp ?? 1) *
          Number(planned['pcp-size'] ?? 1) *
          Number(planned['num-worker']);
        if (count !== topology[`num_${role}_gpu`])
          throw new Error(
            `Required power: ${role} GPU count differs from required matrix for ${key}`,
          );
        plannedGpuCount = Number(plannedGpuCount) + count;
      }
    } else if (plannedGpuCount === undefined && matrix.tp !== undefined) {
      plannedGpuCount =
        Number(matrix.tp) * Number(matrix.pp ?? 1) * Number(matrix['pcp-size'] ?? 1);
    }
    if (plannedGpuCount !== undefined && plannedGpuCount !== topology.num_gpus)
      throw new Error(`Required power: physical GPU count differs from required matrix for ${key}`);
    const expectedCount = positive(topology.num_gpus, 'topology num_gpus');
    if (!Number.isSafeInteger(expectedCount))
      throw new Error('Required power: invalid physical GPU count');
    const window = object(declared.measurement_window, 'measurement window');
    const start = positive(window.start_time_unix, 'window start');
    const end = positive(window.end_time_unix, 'window end');
    if (end <= start) throw new Error('Required power: invalid measurement window boundaries');
    if (!Array.isArray(declared.artifacts) || declared.artifacts.length === 0)
      throw new Error('Required power: missing required artifacts');
    const evidence = new Map<string, BenchmarkArtifactRows>();
    for (const value of declared.artifacts) {
      const artifact = object(value, 'required artifact');
      const relative = safeArtifactPath(artifact.path);
      if (evidence.has(relative))
        throw new Error(`Required power: duplicate required artifact ${relative}`);
      const file = files.get(relative);
      if (!file || file.contents === undefined || file.contents.length === 0)
        throw new Error(`Required power: missing required artifact ${relative}`);
      if (
        artifact.validation_state !== 'valid' ||
        typeof artifact.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(artifact.sha256) ||
        digest(file) !== artifact.sha256
      )
        throw new Error(`Required power: invalid artifact validation or hash ${relative}`);
      evidence.set(relative, file);
    }
    if (
      ![...evidence.values()].some((file) =>
        file.rows.some((candidate) => isDeepStrictEqual(candidate, row)),
      )
    )
      throw new Error(`Required power: benchmark artifact is not hash-bound for ${key}`);
    const byName = (name: string): BenchmarkArtifactRows => {
      const matches = [...evidence.values()].filter(
        (file) => path.posix.basename(file.path) === name,
      );
      if (matches.length !== 1)
        throw new Error(`Required power: expected one required ${name} artifact`);
      return matches[0];
    };
    const sidecars = [...evidence.values()].filter((file) =>
      /^power_validation.*\.json$/u.test(path.posix.basename(file.path)),
    );
    if (sidecars.length !== 1)
      throw new Error('Required power: expected one required power validation artifact');
    const audit = object(JSON.parse(sidecars[0].contents!.toString()), 'power validation');
    const auditWindow = object(audit.benchmark_window, 'audit benchmark window');
    if (
      audit.power_valid !== true ||
      auditWindow.start_time_unix !== start ||
      auditWindow.end_time_unix !== end ||
      audit.expected_gpu_count !== expectedCount ||
      audit.observed_gpu_count !== expectedCount
    )
      throw new Error(
        `Required power: invalid audit verdict, window or physical GPU coverage for ${key}`,
      );
    if (topology.is_multinode && audit.telemetry_kind === 'native_multinode_smi') {
      if (!Array.isArray(audit.nodes) || audit.nodes.length === 0)
        throw new Error('Required power: missing native node receipts');
      const traces = [...evidence.values()].filter(
        (file) => path.posix.basename(file.path) === 'gpu_metrics.csv',
      );
      if (traces.length !== audit.nodes.length)
        throw new Error('Required power: missing native node telemetry');
      for (const file of traces) {
        const directory = path.posix.dirname(file.path);
        const manifestFile = evidence.get(`${directory}/manifest.json`);
        if (!manifestFile) throw new Error('Required power: missing native node manifest');
        const nodeManifest = object(
          JSON.parse(manifestFile.contents!.toString()),
          'native node manifest',
        );
        if (nodeManifest.lifecycle !== 'complete' || nodeManifest.collector_exit_code !== 0)
          throw new Error('Required power: invalid native node collection');
        const receipt = (audit.nodes as JsonRow[]).find((node) => node.node === nodeManifest.node);
        if (
          !receipt ||
          receipt.manifest_sha256 !== digest(manifestFile) ||
          receipt.telemetry_sha256 !== digest(file)
        )
          throw new Error('Required power: native node receipt differs from evidence');
        for (const hash of [receipt.identity_sha256, receipt.identity_end_sha256])
          if (
            ![...evidence.values()].some(
              (item) => path.posix.dirname(item.path) === directory && digest(item) === hash,
            )
          )
            throw new Error('Required power: missing native physical identity evidence');
      }
    } else if (topology.is_multinode) {
      byName('samples.csv');
      byName('manifest.json');
      if (
        ![...evidence.keys()].some((file) => file.includes('/windows/') && file.endsWith('.json'))
      )
        throw new Error('Required power: missing central measurement window artifact');
    } else byName('gpu_metrics.csv');
    const energies = object(audit.per_gpu_energy_j, 'audit device energy');
    let auditDevices: JsonRow[];
    if (audit.per_gpu_role === undefined) {
      const nodeFiles = [...evidence.values()].filter((file) =>
        ['power_node.txt', 'gpu_metrics_node.txt'].includes(path.posix.basename(file.path)),
      );
      if (nodeFiles.length !== 1)
        throw new Error('Required power: expected one node identity artifact');
      const node = nodeFiles[0].contents!.toString().trim();
      const identityFiles = [...evidence.values()].filter((file) =>
        /^(?:gpu_metrics_identity\.csv|gpu_metrics_devices\.json)$/u.test(
          path.posix.basename(file.path),
        ),
      );
      if (identityFiles.length !== 1)
        throw new Error('Required power: expected one physical GPU identity artifact');
      const uuidRows: [string, string][] = [];
      if (identityFiles[0].path.endsWith('.csv')) {
        const lines = identityFiles[0].contents!.toString().trim().split(/\r?\n/u);
        const columns = lines
          .shift()!
          .split(',')
          .map((part) => part.trim().replaceAll('"', '').toLowerCase());
        const indexColumn = columns.indexOf('index');
        const uuidColumn = columns.indexOf('uuid');
        if (indexColumn === -1 || uuidColumn === -1)
          throw new Error('Required power: invalid physical GPU identity CSV');
        for (const line of lines) {
          const fields = line.split(',').map((part) => part.trim().replaceAll('"', ''));
          uuidRows.push([fields[indexColumn], fields[uuidColumn]]);
        }
      } else {
        const visit = (value: unknown): void => {
          if (Array.isArray(value)) value.forEach(visit);
          else if (value && typeof value === 'object') {
            const deviceRow = Object.fromEntries(
              Object.entries(value).map(([field, item]) => [field.toLowerCase(), item]),
            );
            if ('gpu' in deviceRow && 'uuid' in deviceRow)
              uuidRows.push([String(deviceRow.gpu), String(deviceRow.uuid)]);
            else Object.values(value).forEach(visit);
          }
        };
        visit(JSON.parse(identityFiles[0].contents!.toString()));
      }
      if (
        uuidRows.length === 0 ||
        uuidRows.some(
          ([index, uuid]) =>
            !/^\d+$/u.test(index) || !uuid || ['n/a', 'none', 'null'].includes(uuid.toLowerCase()),
        ) ||
        new Set(uuidRows.map(([index]) => index)).size !== uuidRows.length ||
        new Set(uuidRows.map(([, uuid]) => uuid)).size !== uuidRows.length
      )
        throw new Error('Required power: invalid or duplicate physical GPU identity');
      const uuids = new Map(uuidRows);
      auditDevices = Object.entries(energies).map(([index, energy]) => ({
        node,
        gpu_uuid: uuids.get(index),
        role: 'aggregate',
        energy_j: energy,
      }));
    } else {
      const roles = object(audit.per_gpu_role, 'audit device roles');
      const nativeNodes = new Map<string, string>();
      if (audit.telemetry_kind === 'native_multinode_smi')
        for (const value of audit.nodes as unknown[]) {
          const receipt = object(value, 'native node receipt');
          for (const uuid of Object.values(
            object(receipt.physical_gpu_ids, 'native GPU identities'),
          )) {
            const uuidValue = nonempty(uuid, 'native GPU UUID');
            if (nativeNodes.has(uuidValue))
              throw new Error('Required power: duplicate native GPU identity');
            nativeNodes.set(uuidValue, nonempty(receipt.node, 'native node'));
          }
        }
      auditDevices = Object.entries(energies).map(([device, energy]) => {
        const slash = device.lastIndexOf('/');
        return {
          node: nativeNodes.get(device) ?? device.slice(0, slash),
          gpu_uuid: nativeNodes.has(device) ? device : device.slice(slash + 1),
          role: roles[device] === 'agg' ? 'aggregate' : roles[device],
          energy_j: energy,
        };
      });
    }
    if (
      !Array.isArray(declared.devices) ||
      declared.devices.length !== expectedCount ||
      auditDevices.length !== expectedCount
    )
      throw new Error(`Required power: missing physical GPU evidence for ${key}`);
    const devices = new Set<string>();
    const roles = new Map<string, number>();
    let totalEnergy = 0;
    const roleEnergy = new Map<string, number>();
    const nodes = new Set<string>();
    for (const value of declared.devices) {
      const device = object(value, 'physical GPU');
      const node = nonempty(device.node, 'GPU node');
      nodes.add(node);
      const uuid = nonempty(device.gpu_uuid, 'physical GPU UUID');
      if (['n/a', 'none', 'null'].includes(uuid.toLowerCase()) || devices.has(uuid))
        throw new Error('Required power: duplicate or invalid physical GPU UUID');
      devices.add(uuid);
      if (!['aggregate', 'prefill', 'decode'].includes(String(device.role)))
        throw new Error('Required power: invalid physical GPU role');
      roles.set(String(device.role), (roles.get(String(device.role)) ?? 0) + 1);
      const energy = positive(device.energy_j, 'device energy_j');
      totalEnergy += energy;
      roleEnergy.set(String(device.role), (roleEnergy.get(String(device.role)) ?? 0) + energy);
      if (!auditDevices.some((actual) => isDeepStrictEqual(actual, device)))
        throw new Error(`Required power: physical GPU evidence differs from audit for ${key}`);
    }
    if (nodes.size !== (matrix['node-count'] ?? 1))
      throw new Error(
        `Required power: participating node count differs from required matrix for ${key}`,
      );
    if (topology.disagg) {
      if (
        roles.get('prefill') !== positive(topology.num_prefill_gpu, 'prefill GPU count') ||
        roles.get('decode') !== positive(topology.num_decode_gpu, 'decode GPU count') ||
        roles.has('aggregate')
      )
        throw new Error(`Required power: missing prefill or decode evidence for ${key}`);
      for (const role of ['prefill', 'decode']) {
        const energy = positive(row[`${role}_gpu_energy_j`], `${role} energy`);
        if (Math.abs((roleEnergy.get(role) ?? 0) - energy) > Math.max(0.01, energy * 1e-4))
          throw new Error(`Required power: ${role} energy differs from device evidence for ${key}`);
      }
    } else if (roles.get('aggregate') !== expectedCount) {
      throw new Error(`Required power: invalid aggregate GPU roles for ${key}`);
    }
    const energy = positive(row.total_gpu_energy_j, 'total_gpu_energy_j');
    if (Math.abs(totalEnergy - energy) > Math.max(0.01, energy * 1e-4))
      throw new Error(`Required power: total GPU energy differs from device evidence for ${key}`);
  }
}
