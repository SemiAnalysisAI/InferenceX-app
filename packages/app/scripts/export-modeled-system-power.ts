import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import type { BenchmarkRow } from '../src/lib/api';
import { isNvl72Hardware, modelSystemPower } from '../src/lib/modeled-system-power';
import profileData from '../src/lib/system-power-model.profiles.json';

interface PowerAudit {
  power_valid: boolean;
  reasons: string[];
  expected_gpu_count: number;
  observed_gpu_count: number;
  benchmark_window: {
    start_time_unix: number;
    end_time_unix: number;
    integration_duration_s: number;
    completed: number;
    total_input_tokens: number;
    total_output_tokens: number;
  };
  metrics: Record<string, number>;
}

export interface ComparisonInput {
  cohort: string;
  metadata: Record<string, unknown>;
  rows: {
    id: string;
    cell?: string;
    benchmark: BenchmarkRow;
    rawInput?: unknown;
    source?: Record<string, unknown>;
    audit?: PowerAudit;
  }[];
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const integer = (value: unknown): value is number => positive(value) && Number.isSafeInteger(value);
const measurement = (value: unknown) => (finite(value) && value >= 0 ? value : null);
const mean = (values: (number | null)[]) =>
  values.length > 0 && values.every(finite)
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

function estimatedEnergy(
  row: BenchmarkRow,
  modeled: ReturnType<typeof modelSystemPower>,
  audit?: PowerAudit,
) {
  if (modeled.status !== 'supported')
    return { status: 'unavailable', reason: 'system-power-unavailable' };
  if (!audit) return { status: 'unavailable', reason: 'exact-window-and-denominators-unavailable' };
  const w = audit.benchmark_window;
  if (
    audit.power_valid !== true ||
    !Array.isArray(audit.reasons) ||
    audit.reasons.length > 0 ||
    audit.expected_gpu_count !== modeled.gpuCount ||
    audit.observed_gpu_count !== modeled.gpuCount ||
    !w ||
    !positive(w.integration_duration_s) ||
    !finite(w.start_time_unix) ||
    !finite(w.end_time_unix) ||
    Math.abs(w.end_time_unix - w.start_time_unix - w.integration_duration_s) > 1e-6 ||
    !integer(w.completed) ||
    !integer(w.total_input_tokens) ||
    !integer(w.total_output_tokens) ||
    !integer(w.total_input_tokens + w.total_output_tokens) ||
    !['avg_power_w', 'avg_total_gpu_power_w', 'total_gpu_energy_j'].every(
      (key) =>
        positive(row.metrics[key]) &&
        positive(audit.metrics?.[key]) &&
        Math.abs(row.metrics[key] - audit.metrics[key]) <= 0.000501,
    ) ||
    Math.abs(
      audit.metrics.total_gpu_energy_j / w.integration_duration_s -
        audit.metrics.avg_total_gpu_power_w,
    ) > 0.000002 ||
    !Object.entries({
      joules_per_successful_query: w.completed,
      joules_per_input_token: w.total_input_tokens,
      joules_per_output_token: w.total_output_tokens,
      joules_per_total_token: w.total_input_tokens + w.total_output_tokens,
    }).every(
      ([metric, denominator]) =>
        positive(row.metrics[metric]) &&
        Math.abs(audit.metrics.total_gpu_energy_j / denominator - row.metrics[metric]) <=
          0.000000501,
    )
  )
    return { status: 'unavailable', reason: 'audit-does-not-match-measured-input' };
  // Energy belongs to the measured GPUs: an extrapolated chassis contributes
  // only their share at the modeled per-GPU rate.
  const it = modeled.deploymentItWatts * w.integration_duration_s;
  const facility = modeled.deploymentFacilityWatts * w.integration_duration_s;
  if (!finite(it) || !finite(facility))
    return { status: 'unavailable', reason: 'non-finite-modeled-energy' };
  return {
    status: 'estimated',
    basis:
      'Modeled deployment power at mean GPU input multiplied by the exact recorded telemetry window; not integrated wall-power telemetry.',
    integration_seconds: w.integration_duration_s,
    completed_queries: w.completed,
    input_tokens: w.total_input_tokens,
    output_tokens: w.total_output_tokens,
    it_j: it,
    facility_j: facility,
    it_j_per_output_token: it / w.total_output_tokens,
    facility_j_per_output_token: facility / w.total_output_tokens,
    it_j_per_input_token: it / w.total_input_tokens,
    it_j_per_total_token: it / (w.total_input_tokens + w.total_output_tokens),
    it_j_per_successful_query: it / w.completed,
  };
}

export function buildComparison(input: ComparisonInput) {
  if (!input || typeof input.cohort !== 'string' || !Array.isArray(input.rows)) {
    throw new Error(
      'Expected a cohort envelope with a rows array. See docs/powerx-system-power.md.',
    );
  }
  const ids = new Set<string>();
  const rows = input.rows.map((entry) => {
    const row = entry.benchmark;
    if (
      !entry.id ||
      ids.has(entry.id) ||
      !row ||
      typeof row.hardware !== 'string' ||
      !row.metrics ||
      typeof row.metrics !== 'object' ||
      Array.isArray(row.metrics)
    ) {
      throw new Error(`Invalid benchmark input or duplicate id: ${entry.id}`);
    }
    ids.add(entry.id);
    const modeled = modelSystemPower(row);
    const measurementStatus =
      row.metrics.power_valid === 1
        ? 'producer-valid'
        : row.metrics.power_valid === 0
          ? 'invalid'
          : 'unverified';
    // NVL72 Grace-side keys carry their own verdict.
    const cpuValid = row.metrics.cpu_power_valid === 1;
    return {
      id: entry.id,
      cell: entry.cell ?? null,
      source: entry.source ?? null,
      benchmark: row,
      raw_input: entry.rawInput ?? row,
      measurement_status: measurementStatus,
      measured_inputs:
        measurementStatus === 'producer-valid'
          ? {
              avg_gpu_w: measurement(row.metrics.avg_power_w),
              total_gpu_w: measurement(row.metrics.avg_total_gpu_power_w),
              total_gpu_j: measurement(row.metrics.total_gpu_energy_j),
              gpu_j_per_output_token: measurement(row.metrics.joules_per_output_token),
              ...(isNvl72Hardware(row.hardware)
                ? {
                    cpu_power_valid: row.metrics.cpu_power_valid ?? null,
                    total_grace_w: cpuValid ? measurement(row.metrics.avg_total_cpu_power_w) : null,
                    total_grace_j: cpuValid ? measurement(row.metrics.total_cpu_energy_j) : null,
                  }
                : {}),
            }
          : null,
      modeled,
      estimated_energy: estimatedEnergy(row, modeled, entry.audit),
      audit: entry.audit ?? null,
    };
  });
  const cells = [...new Set(rows.flatMap((row) => (row.cell ? [row.cell] : [])))].map((cell) => {
    const replicates = rows.filter((row) => row.cell === cell);
    const dimensions = [
      'hardware',
      'model',
      'precision',
      'framework',
      'spec_method',
      'conc',
      'isl',
      'osl',
      'disagg',
      'is_multinode',
      'prefill_tp',
      'decode_tp',
      'prefill_ep',
      'decode_ep',
      'num_prefill_gpu',
      'num_decode_gpu',
      'prefill_num_workers',
      'decode_num_workers',
    ] as const;
    if (
      replicates.some((row) =>
        dimensions.some((key) => row.benchmark[key] !== replicates[0].benchmark[key]),
      )
    ) {
      throw new Error(`Cell contains different benchmark configurations: ${cell}`);
    }
    const complete = replicates.every((row) => row.modeled.status === 'supported');
    return {
      cell,
      hardware: replicates[0].benchmark.hardware,
      concurrency: replicates[0].benchmark.conc,
      replicate_ids: replicates.map((row) => row.id),
      replicate_count: replicates.length,
      supported_replicates: replicates.filter((row) => row.modeled.status === 'supported').length,
      model_revision: profileData.modelRevision,
      status: complete ? 'supported' : 'unsupported',
      unsupported_reasons: [
        ...new Set(
          replicates.flatMap((row) =>
            row.modeled.status === 'unsupported' ? [row.modeled.reason] : [],
          ),
        ),
      ],
      chassis_bases: [
        ...new Set(
          replicates.flatMap((row) =>
            row.modeled.status === 'supported' ? [row.modeled.chassisBasis] : [],
          ),
        ),
      ],
      measured_gpu_w_per_gpu_mean: mean(
        replicates.map((row) => row.measured_inputs?.avg_gpu_w ?? null),
      ),
      measured_total_gpu_w_mean: mean(
        replicates.map((row) => row.measured_inputs?.total_gpu_w ?? null),
      ),
      measured_gpu_j_per_output_token_mean: mean(
        replicates.map((row) => row.measured_inputs?.gpu_j_per_output_token ?? null),
      ),
      modeled_it_w_mean: mean(
        replicates.map((row) => (row.modeled.status === 'supported' ? row.modeled.itWatts : null)),
      ),
      modeled_it_w_per_gpu_mean: mean(
        replicates.map((row) =>
          row.modeled.status === 'supported' ? row.modeled.itWattsPerGpu : null,
        ),
      ),
      modeled_deployment_it_w_mean: mean(
        replicates.map((row) =>
          row.modeled.status === 'supported' ? row.modeled.deploymentItWatts : null,
        ),
      ),
      modeled_deployment_facility_w_mean: mean(
        replicates.map((row) =>
          row.modeled.status === 'supported' ? row.modeled.deploymentFacilityWatts : null,
        ),
      ),
      modeled_facility_w_mean: mean(
        replicates.map((row) =>
          row.modeled.status === 'supported' ? row.modeled.facilityWatts : null,
        ),
      ),
      estimated_it_j_per_output_token_mean: mean(
        replicates.map((row) => row.estimated_energy.it_j_per_output_token ?? null),
      ),
      estimated_facility_j_per_output_token_mean: mean(
        replicates.map((row) => row.estimated_energy.facility_j_per_output_token ?? null),
      ),
    };
  });
  return {
    metadata: {
      cohort: input.cohort,
      source: input.metadata,
      scope: { benchmark_type: 'single_turn', isl: 8192, osl: 1024 },
      selection:
        'Every supplied row is retained, including unsupported, invalid, and missing-input cases.',
      aggregation:
        'Each replicate is modeled first. Cell means include every replicate; any unavailable value leaves its cell mean unavailable.',
      boundary:
        'Measured GPU-board inputs; modeled IT power is GPU-chassis AC (CPU, DRAM, other host components, fans, and PSU loss) plus each chassis share of scale-out networking. GB200/GB300 NVL72 rows add measured Grace-socket inputs: the measured trays fold into an 18-tray rack at their mean GPU and socket power (tray NICs, optics, drives, fans and 48 V conversion; NVSwitch trays, power shelves and the rack share of scale-out networking), and each tray takes 1/18 of it. Separate CPU-only frontend/router hosts are excluded. Facility power applies the system cooling PUE after IT power.',
      extrapolation:
        'A partially allocated chassis is modeled at measured per-GPU power × 8 (the upstream model input for a full chassis), assuming the unmeasured GPUs run the same workload. Deployment values are the measured GPUs’ share of that chassis; per-GPU values divide by the modeled chassis GPU count.',
      energy_caveat:
        'Energy from modeled average power is an estimate. Nonlinear fan/PSU behavior is not integrated over time. Energy requires an exact matching audit window and successful token counts.',
      model: profileData,
      row_count: rows.length,
      supported_rows: rows.filter((row) => row.modeled.status === 'supported').length,
      estimated_energy_rows: rows.filter((row) => row.estimated_energy.status === 'estimated')
        .length,
      cell_count: cells.length,
    },
    rows,
    cells,
  };
}

const csvValue = (item: unknown) =>
  item === null || item === undefined
    ? ''
    : `"${(typeof item === 'object' ? JSON.stringify(item) : String(item)).replaceAll('"', '""')}"`;

/** RFC 4180 quoting; null/absent values remain blank rather than becoming zero. */
export function csv(records: Record<string, unknown>[]): string {
  const columns = [...new Set(records.flatMap(Object.keys))];
  return `${[columns.map(csvValue).join(','), ...records.map((row) => columns.map((key) => csvValue(row[key])).join(','))].join('\r\n')}\r\n`;
}

type Comparison = ReturnType<typeof buildComparison>;

/** One CSV record per row: the comparison row flattened with the export's provenance. */
export function flatRows(
  result: Comparison,
  metadata: Comparison['metadata'] & {
    app_revision: string;
    input_sha256: string;
    generated_at: string;
  },
  hashes: Record<string, string>,
) {
  return result.rows.map((row) => ({
    cohort: metadata.cohort,
    id: row.id,
    cell: row.cell,
    hardware: row.benchmark.hardware,
    model: row.benchmark.model,
    concurrency: row.benchmark.conc,
    precision: row.benchmark.precision,
    framework: row.benchmark.framework,
    disagg: row.benchmark.disagg,
    is_multinode: row.benchmark.is_multinode,
    prefill_tp: row.benchmark.prefill_tp,
    decode_tp: row.benchmark.decode_tp,
    num_prefill_gpu: row.benchmark.num_prefill_gpu,
    num_decode_gpu: row.benchmark.num_decode_gpu,
    prefill_workers: row.benchmark.prefill_num_workers,
    decode_workers: row.benchmark.decode_num_workers,
    measurement_status: row.measurement_status,
    power_valid: row.benchmark.metrics.power_valid,
    power_metric_schema_version: row.benchmark.metrics.power_metric_schema_version,
    measured_gpu_w_per_gpu: row.measured_inputs?.avg_gpu_w,
    measured_total_gpu_w: row.measured_inputs?.total_gpu_w,
    measured_total_gpu_j: row.measured_inputs?.total_gpu_j,
    measured_gpu_j_per_output_token: row.measured_inputs?.gpu_j_per_output_token,
    cpu_power_valid: row.measured_inputs?.cpu_power_valid,
    measured_total_grace_w: row.measured_inputs?.total_grace_w,
    measured_total_grace_j: row.measured_inputs?.total_grace_j,
    modeled_status: row.modeled.status,
    modeled_unit: row.modeled.status === 'supported' ? row.modeled.unit : null,
    unsupported_reason: row.modeled.status === 'unsupported' ? row.modeled.reason : null,
    modeled_it_w: row.modeled.status === 'supported' ? row.modeled.itWatts : null,
    modeled_it_w_per_gpu: row.modeled.status === 'supported' ? row.modeled.itWattsPerGpu : null,
    modeled_facility_w: row.modeled.status === 'supported' ? row.modeled.facilityWatts : null,
    modeled_deployment_it_w:
      row.modeled.status === 'supported' ? row.modeled.deploymentItWatts : null,
    modeled_deployment_facility_w:
      row.modeled.status === 'supported' ? row.modeled.deploymentFacilityWatts : null,
    physical_gpu_count: row.modeled.status === 'supported' ? row.modeled.gpuCount : null,
    modeled_gpu_count: row.modeled.status === 'supported' ? row.modeled.modeledGpuCount : null,
    chassis_count: row.modeled.status === 'supported' ? row.modeled.chassisCount : null,
    chassis_basis: row.modeled.status === 'supported' ? row.modeled.chassisBasis : null,
    telemetry_basis: row.modeled.status === 'supported' ? row.modeled.telemetryBasis : null,
    topology_basis: row.modeled.status === 'supported' ? row.modeled.topologyBasis : null,
    model_revision: row.modeled.modelRevision,
    calculation_boundary: metadata.boundary,
    extrapolation_note: metadata.extrapolation,
    energy_caveat: metadata.energy_caveat,
    pue: row.modeled.status === 'supported' ? row.modeled.pue : null,
    estimated_energy: row.estimated_energy,
    estimated_energy_status: row.estimated_energy.status,
    estimated_energy_reason: row.estimated_energy.reason,
    integration_seconds: row.estimated_energy.integration_seconds,
    output_tokens: row.estimated_energy.output_tokens,
    estimated_it_j: row.estimated_energy.it_j,
    estimated_facility_j: row.estimated_energy.facility_j,
    estimated_it_j_per_output_token: row.estimated_energy.it_j_per_output_token,
    estimated_facility_j_per_output_token: row.estimated_energy.facility_j_per_output_token,
    run_url: row.benchmark.run_url,
    measurement_date: row.benchmark.date,
    source: row.source,
    raw_topology_and_metrics: row.benchmark,
    app_revision: metadata.app_revision,
    input_sha256: metadata.input_sha256,
    profile_sha256: hashes['packages/app/src/lib/system-power-model.profiles.json'],
    generated_at: metadata.generated_at,
  }));
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      output: { type: 'string' },
    },
  });
  if (!values.input || !values.output)
    throw new Error(
      'Usage: bun packages/app/scripts/export-modeled-system-power.ts --input cohort.json --output NEW_DIRECTORY',
    );
  const inputBytes = await readFile(values.input);
  const result = buildComparison(JSON.parse(inputBytes.toString('utf8')));
  const root = resolve(import.meta.dirname, '../../..');
  const codePaths = [
    'packages/app/scripts/export-modeled-system-power.ts',
    'packages/app/src/lib/modeled-system-power.ts',
    'packages/app/src/lib/system-power-model.ts',
    'packages/app/src/lib/system-power-model.profiles.json',
  ];
  const hashes: Record<string, string> = {};
  for (const path of codePaths)
    hashes[path] = createHash('sha256')
      .update(await readFile(resolve(root, path)))
      .digest('hex');
  const metadata = {
    ...result.metadata,
    generated_at: new Date().toISOString(),
    input_file: resolve(values.input),
    input_sha256: createHash('sha256').update(inputBytes).digest('hex'),
    app_revision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    app_worktree_dirty:
      execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '',
    implementation_sha256: hashes,
  };
  const flat = flatRows(result, metadata, hashes);
  await mkdir(values.output);
  await writeFile(
    resolve(values.output, 'comparison.json'),
    `${JSON.stringify({ ...result, metadata }, null, 2)}\n`,
    { flag: 'wx' },
  );
  await writeFile(resolve(values.output, 'comparison.csv'), csv(flat), { flag: 'wx' });
  if (result.cells.length > 0)
    await writeFile(resolve(values.output, 'cells.csv'), csv(result.cells), { flag: 'wx' });
  console.log(
    JSON.stringify({
      output: resolve(values.output),
      rows: result.rows.length,
      supported: metadata.supported_rows,
      estimated_energy: metadata.estimated_energy_rows,
      cells: result.cells.length,
    }),
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
