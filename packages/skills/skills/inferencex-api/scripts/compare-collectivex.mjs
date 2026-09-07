import process from 'node:process';
import { parseArgs } from 'node:util';
import { argumentError, isMain, responseBoundary } from './cli-contract.mjs';

const ORIGIN = 'https://inferencex.semianalysis.com';
const VERSION = 1;
const PERCENTILES = ['p50', 'p90', 'p95', 'p99'];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const id = (value) => typeof value === 'string' && /^[1-9]\d*$/u.test(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const canonical = (value) =>
  JSON.stringify(value, (_key, item) => {
    if (
      typeof item === 'number' &&
      (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))
    ) {
      throw new Error('Comparison identity contains an unrepresentable number');
    }
    return object(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item;
  });

function validTimestamp(value) {
  const match =
    typeof value === 'string' &&
    /^(?<date>\d{4}-\d{2}-\d{2})[T ](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.exec(
      value,
    );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const date = new Date(`${match.groups.date}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === match.groups.date &&
    Number(match.groups.hour) < 24 &&
    Number(match.groups.minute) < 60 &&
    Number(match.groups.second) < 60
  );
}

function runIdentity(run) {
  return (
    object(run) &&
    id(run.run_id) &&
    positive(run.run_attempt) &&
    validTimestamp(run.generated_at) &&
    (run.conclusion === null || typeof run.conclusion === 'string')
  );
}

function topologyIssues(topology) {
  if (!object(topology)) return ['missing_topology'];
  const issues = [];
  for (const key of ['ep_size', 'nodes', 'gpus_per_node', 'scale_up_domain']) {
    if (!positive(topology[key])) issues.push(`missing_or_invalid_${key}`);
  }
  for (const key of ['scale_up_transport', 'topology_class']) {
    if (!text(topology[key])) issues.push(`missing_or_invalid_${key}`);
  }
  if (!(topology.scale_out_transport === null || text(topology.scale_out_transport))) {
    issues.push('missing_or_invalid_scale_out_transport');
  }
  return issues;
}

function metric(value) {
  if (value === undefined) return { status: 'missing' };
  if (value === null) return { status: 'null', value: null };
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(
      'Invalid metric: expected a finite nonnegative number, null, or an omitted field',
    );
  }
  return { status: 'value', value };
}

function percentiles(target, name, unit, values, keys = PERCENTILES) {
  if (values !== undefined && values !== null && !object(values)) {
    throw new Error(`Invalid ${name} percentile object`);
  }
  for (const key of keys) {
    target.push({
      name: `${name}.${key}`,
      unit,
      ...metric(values === null ? null : values?.[key]),
    });
  }
}

function epRows(dataset, responseIndex) {
  const rows = [];
  dataset.series.forEach((series, seriesIndex) => {
    if (!object(series) || !Array.isArray(series.points)) throw new Error('Invalid EP series');
    const { points, ...configuration } = series;
    const issues = topologyIssues(series.system);
    for (const key of ['series_id', 'phase', 'mode', 'precision', 'backend']) {
      if (!text(series[key])) issues.push(`missing_or_invalid_${key}`);
    }
    if (!text(series.system?.sku) || !['nvidia', 'amd'].includes(series.system?.vendor)) {
      issues.push('missing_hardware_identity');
    }
    points.forEach((point, pointIndex) => {
      if (!object(point) || !object(point.components)) throw new Error('Invalid EP point');
      const {
        components: _components,
        roundtrip_token_rate_at_latency_percentile: _rate,
        ...pointConfiguration
      } = point;
      for (const operation of ['dispatch', 'stage', 'combine', 'roundtrip']) {
        const component = point.components[operation];
        if (component !== undefined && component !== null && !object(component)) {
          throw new Error('Invalid EP component');
        }
        const problems = [...issues];
        if (!positive(point.tokens_per_rank) || !positive(point.global_tokens)) {
          problems.push('missing_or_invalid_token_counts');
        }
        if (!component) problems.push('unavailable_component');
        if (!count(component?.payload_bytes)) problems.push('missing_or_invalid_payload_bytes');
        const metrics = [];
        percentiles(metrics, 'latency_us', 'us', component?.latency_us);
        percentiles(
          metrics,
          'activation_data_rate_gbps_at_latency_percentile',
          'GB/s aggregate activation',
          component?.activation_data_rate_gbps_at_latency_percentile,
        );
        percentiles(
          metrics,
          'payload_data_rate_gbps_at_latency_percentile',
          'GB/s per GPU payload',
          component?.payload_data_rate_gbps_at_latency_percentile,
        );
        if (operation === 'roundtrip') {
          percentiles(
            metrics,
            'roundtrip_token_rate_at_latency_percentile',
            'tokens/s aggregate',
            point.roundtrip_token_rate_at_latency_percentile,
          );
        }
        rows.push({
          identity: {
            suite: 'ep',
            configuration,
            operation,
            ...pointConfiguration,
            payload_bytes: component?.payload_bytes,
          },
          issues: problems,
          metrics,
          source: {
            response_index: responseIndex,
            json_pointer: `/series/${seriesIndex}/points/${pointIndex}/components/${operation}`,
          },
        });
      }
    });
  });
  return rows;
}

function kvRows(dataset, responseIndex) {
  return (dataset.kv ?? []).flatMap((kase, caseIndex) => {
    if (!object(kase) || !Array.isArray(kase.rows)) throw new Error('Invalid KV case');
    const {
      rows,
      label: _label,
      disposition: _disposition,
      outcome: _outcome,
      reason: _reason,
      detail: _detail,
      ...configuration
    } = kase;
    const issues = topologyIssues(kase.topology);
    for (const key of ['case_id', 'sku', 'backend', 'fabric', 'workload', 'precision']) {
      if (!text(kase[key])) issues.push(`missing_or_invalid_${key}`);
    }
    if (!['nvidia', 'amd'].includes(kase.vendor)) issues.push('missing_hardware_identity');
    if (kase.outcome !== 'success' || kase.disposition !== 'runnable')
      issues.push('kv_case_not_successful');
    return rows.map((row, rowIndex) => {
      if (!object(row)) throw new Error('Invalid KV row');
      const problems = [...issues];
      // Unknown future row fields remain part of identity rather than silently broadening a match.
      const {
        prep_ms: _prep,
        latency_ms: _latency,
        request_ms: _request,
        gbps_p50: _gbps,
        gbps_p50_incl_prep: _coldGbps,
        verify_passed: _verified,
        ...identity
      } = row;
      if (!['paged', 'bulk'].includes(row.kind) || !['push', 'pull'].includes(row.op)) {
        problems.push('missing_or_invalid_kv_operation');
      }
      for (const key of ['isl', 'batch', 'descs', 'req_bytes']) {
        if (!(key === 'req_bytes' ? count(row[key]) : positive(row[key]))) {
          problems.push(`missing_or_invalid_${key}`);
        }
      }
      if (!((row.page_tokens === null && row.kind === 'bulk') || positive(row.page_tokens))) {
        problems.push('missing_or_invalid_page_tokens');
      }
      if (row.verify_passed !== true) problems.push('kv_verification_not_passed');
      const metrics = [];
      for (const [key, unit] of [
        ['latency_ms', 'ms per burst'],
        ['request_ms', 'ms per request'],
      ]) {
        percentiles(metrics, key, unit, row[key], ['p50', 'p95', 'min', 'max']);
        metrics.push({
          name: `${key}.n`,
          unit: 'samples',
          ...metric(row[key] === null ? null : row[key]?.n),
        });
      }
      for (const [key, unit] of [
        ['prep_ms', 'ms per burst'],
        ['gbps_p50', 'GB/s'],
        ['gbps_p50_incl_prep', 'GB/s including prep'],
      ]) {
        metrics.push({ name: key, unit, ...metric(row[key]) });
      }
      return {
        identity: { suite: 'kv', configuration, row: identity },
        issues: problems,
        metrics,
        source: {
          response_index: responseIndex,
          json_pointer: `/kv/${caseIndex}/rows/${rowIndex}`,
        },
      };
    });
  });
}

function compare(left, right) {
  const groups = new Map();
  for (const [side, rows] of [
    ['left', left],
    ['right', right],
  ]) {
    for (const row of rows) {
      const key = canonical(row.identity);
      if (!groups.has(key)) groups.set(key, { identity: row.identity, left: [], right: [] });
      groups.get(key)[side].push(row);
    }
  }
  return [...groups.values()].map(({ identity, left: a, right: b }) => {
    const issues = [...new Set([...a, ...b].flatMap((row) => row.issues))];
    const status =
      a.length > 1 || b.length > 1
        ? 'ambiguous'
        : issues.length > 0
          ? 'incomparable'
          : a.length === 0
            ? 'only_right'
            : b.length === 0
              ? 'only_left'
              : 'matched';
    const metrics =
      status === 'matched'
        ? a[0].metrics.map(({ name, unit, ...leftValue }, index) => {
            const { name: _name, unit: _unit, ...rightValue } = b[0].metrics[index];
            const numeric = leftValue.status === 'value' && rightValue.status === 'value';
            const difference = numeric ? rightValue.value - leftValue.value : null;
            const ratio =
              numeric && leftValue.value !== 0 ? rightValue.value / leftValue.value : null;
            return {
              name,
              unit,
              left: leftValue,
              right: rightValue,
              difference_right_minus_left: Number.isFinite(difference) ? difference : null,
              ratio_right_over_left: Number.isFinite(ratio) ? ratio : null,
            };
          })
        : [];
    return {
      identity,
      status,
      issues,
      left: a.map((row) => row.source),
      right: b.map((row) => row.source),
      metrics,
    };
  });
}

function validateSchema(schema) {
  for (const path of ['/api/v1/collectivex/runs', '/api/v1/collectivex/runs/{runId}']) {
    const operation = schema.paths?.[path]?.get;
    if (
      !operation?.parameters
        ?.find((parameter) => parameter.name === 'version')
        ?.schema?.enum?.includes(VERSION) ||
      operation.parameters.some(
        (parameter) => parameter.required && !['version', 'runId'].includes(parameter.name),
      )
    ) {
      throw new Error(
        'Inspect the current CollectiveX OpenAPI operations before using this version-1 helper',
      );
    }
  }
}

function validateRunList(list) {
  if (
    !object(list) ||
    list.version !== VERSION ||
    typeof list.discovery_complete !== 'boolean' ||
    !Array.isArray(list.runs) ||
    list.runs.some((run) => !runIdentity(run) || !count(run.measured_cases)) ||
    new Set(list.runs.map((run) => run.run_id)).size !== list.runs.length
  ) {
    throw new Error('Invalid CollectiveX run list; discovery coverage is unknown');
  }
}

function selectRunIds(list) {
  return list.runs
    .filter((run) => run.measured_cases > 0)
    .toSorted((a, b) => (BigInt(a.run_id) < BigInt(b.run_id) ? 1 : -1))
    .slice(0, 2)
    .map((run) => run.run_id)
    .toReversed();
}

function validateDataset(data, runId) {
  if (
    !object(data) ||
    data.version !== VERSION ||
    !runIdentity(data.run) ||
    data.run.run_id !== runId ||
    !text(data.run.source_sha) ||
    !Array.isArray(data.coverage) ||
    !Array.isArray(data.series) ||
    (data.kv !== undefined && !Array.isArray(data.kv))
  ) {
    throw new Error('Invalid or mismatched CollectiveX run dataset');
  }
}

function comparisonRows(datasets) {
  if (datasets.length !== 2) return [];
  return compare(
    [
      ...epRows(datasets[0].body, datasets[0].index),
      ...kvRows(datasets[0].body, datasets[0].index),
    ],
    [
      ...epRows(datasets[1].body, datasets[1].index),
      ...kvRows(datasets[1].body, datasets[1].index),
    ],
  );
}

function comparisonSummary(comparisons) {
  return Object.fromEntries(
    ['matched', 'only_left', 'only_right', 'ambiguous', 'incomparable'].map((status) => [
      status,
      comparisons.filter((row) => row.status === status).length,
    ]),
  );
}

export function normalizeArgs(args) {
  try {
    let values;
    if (Array.isArray(args)) {
      const parsed = parseArgs({
        args,
        options: { left: { type: 'string' }, right: { type: 'string' } },
        tokens: true,
        strict: true,
        allowPositionals: false,
      });
      const seen = new Set();
      for (const token of parsed.tokens) {
        if (seen.has(token.name)) throw new Error(`Duplicate option --${token.name}`);
        seen.add(token.name);
      }
      values = { left: parsed.values.left ?? null, right: parsed.values.right ?? null };
    } else {
      const keys = ['left', 'right'];
      if (
        !object(args) ||
        Object.keys(args).length !== keys.length ||
        keys.some((key) => !Object.hasOwn(args, key))
      ) {
        throw new Error('Invalid saved CollectiveX options');
      }
      values = { ...args };
    }
    const explicit = values.left !== null || values.right !== null;
    if (explicit && (!id(values.left) || !id(values.right) || values.left === values.right)) {
      throw new Error('--left and --right require two distinct positive decimal run-ID strings');
    }
    return values;
  } catch (error) {
    throw argumentError(error.message, error);
  }
}

export function collect(options, context) {
  const normalized = normalizeArgs(options);
  return responseBoundary(async () => {
    const sources = [];
    async function read(operation, url) {
      const saved = await context.get({ operation, url, allowedStatuses: [200] });
      const index = sources.length;
      sources.push({
        operation,
        url,
        response_id: saved.id,
        retrieved_at: saved.retrievedAt,
        http_status: saved.status,
      });
      return { body: saved.body, index };
    }

    const schema = await read('openapi', `${ORIGIN}/api/openapi.json`);
    validateSchema(schema.body);
    const explicit = normalized.left !== null;
    let runIds = explicit ? [normalized.left, normalized.right] : [];
    let discovery = null;
    if (!explicit) {
      const listed = await read('collectivex-runs', `${ORIGIN}/api/v1/collectivex/runs?version=1`);
      validateRunList(listed.body);
      runIds = selectRunIds(listed.body);
      discovery = {
        response_index: listed.index,
        response_id: sources[listed.index].response_id,
        returned_runs: listed.body.runs.length,
        discovery_complete: listed.body.discovery_complete,
        history_complete: false,
      };
    }
    const datasets = [];
    if (runIds.length === 2) {
      for (const runId of runIds) {
        const response = await read(
          'collectivex-run',
          `${ORIGIN}/api/v1/collectivex/runs/${runId}?version=1`,
        );
        validateDataset(response.body, runId);
        datasets.push(response);
      }
    }
    const comparisons = comparisonRows(datasets);
    const summary = comparisonSummary(comparisons);
    const comparablePairs = comparisons.filter(
      (row) =>
        row.status === 'matched' &&
        row.metrics.some(
          (metricValue) =>
            metricValue.left.status === 'value' && metricValue.right.status === 'value',
        ),
    ).length;
    const outcome =
      datasets.length < 2
        ? 'fewer_than_two_measured_runs'
        : summary.matched
          ? 'compared'
          : 'no_comparable_rows';
    const document = {
      schema_version: 1,
      kind: 'collectivex',
      package_version: context.producerVersion,
      contract_version: 1,
      selection: {
        mode: explicit ? 'explicit_run_ids' : 'newest_two_measured_from_one_list',
        run_ids: runIds,
      },
      outcome,
      discovery,
      comparison_scope: {
        contract_version: VERSION,
        basis: 'exact_public_identity',
        source_sha_equal:
          datasets.length === 2
            ? datasets[0].body.run.source_sha === datasets[1].body.run.source_sha
            : null,
      },
      runs: datasets.map(({ body, index }) => ({
        run: body.run,
        response_index: index,
        response_id: sources[index].response_id,
      })),
      summary,
      comparisons,
      sources,
      observation_context: 'Existing observations were read; no new benchmark was run.',
    };
    const reasons = ['only_left', 'only_right', 'ambiguous', 'incomparable']
      .filter((status) => summary[status] > 0)
      .map((status) => ({ code: status, count: summary[status] }));
    const matchedWithoutValues = summary.matched - comparablePairs;
    if (matchedWithoutValues > 0) {
      reasons.push({ code: 'matched_without_usable_metric', count: matchedWithoutValues });
    }
    return {
      format: 'json',
      bytes: Buffer.from(`${JSON.stringify(document, null, 2)}\n`),
      coverage: {
        status:
          datasets.length < 2 || comparisons.length === 0
            ? 'empty'
            : comparablePairs === comparisons.length
              ? 'complete'
              : 'partial',
        selected_records: comparisons.length,
        comparable_pairs: comparablePairs,
        hardware: [],
        reasons,
      },
    };
  }, context.signal);
}

if (isMain(import.meta.url)) {
  process.stderr.write(
    'compare-collectivex.mjs is internal. Use inferencex collectivex compare instead.\n',
  );
  process.exitCode = 2;
}
