import process from 'node:process';
import { parseArgs } from 'node:util';
import { argumentError, isMain, responseBoundary, responseError } from './cli-contract.mjs';

const API_ORIGIN = 'https://inferencex.semianalysis.com';

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function identifier(value) {
  return (
    (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) ||
    (typeof value === 'string' && /^[1-9]\d*$/u.test(value))
  );
}

function safeId(value) {
  return (
    identifier(value) &&
    Number.isSafeInteger(Number(value)) &&
    String(Number(value)) === String(value)
  );
}

function integerOption(value, name, minimum, maximum) {
  if (
    typeof value !== 'string' ||
    !/^(?:0|[1-9]\d*)$/u.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new Error(
      `--${name} must be a canonical ${minimum === 1 ? 'positive safe integer' : 'integer'} from ${minimum} to ${maximum}`,
    );
  }
  return Number(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTimestamp(value) {
  const match =
    typeof value === 'string' &&
    /^(?<date>\d{4}-\d{2}-\d{2})[T ](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/u.exec(
      value,
    );
  return Boolean(
    match &&
    match[0] === value &&
    validDate(match.groups.date) &&
    Number(match.groups.hour) < 24 &&
    Number(match.groups.minute) < 60 &&
    Number(match.groups.second) < 60 &&
    Number.isFinite(Date.parse(value)),
  );
}

function benchmarkRow(row) {
  return (
    object(row) &&
    identifier(row.id) &&
    [
      'hardware',
      'framework',
      'model',
      'precision',
      'spec_method',
      'benchmark_type',
      'offload_mode',
    ].every((key) => typeof row[key] === 'string') &&
    ['disagg', 'is_multinode', 'prefill_dp_attention', 'decode_dp_attention'].every(
      (key) => typeof row[key] === 'boolean',
    ) &&
    [
      'prefill_tp',
      'prefill_ep',
      'prefill_num_workers',
      'decode_tp',
      'decode_ep',
      'decode_num_workers',
      'num_prefill_gpu',
      'num_decode_gpu',
      'conc',
    ].every((key) => Number.isSafeInteger(row[key])) &&
    ['isl', 'osl'].every((key) => row[key] === null || Number.isFinite(row[key])) &&
    ['image', 'run_url'].every((key) => row[key] === null || typeof row[key] === 'string') &&
    (row.recipe_fingerprint === undefined ||
      row.recipe_fingerprint === null ||
      typeof row.recipe_fingerprint === 'string') &&
    ['workflow_run_id', 'curve_workflow_run_id'].every(
      (key) => row[key] === undefined || identifier(row[key]),
    ) &&
    ['run_started_at', 'curve_run_started_at'].every(
      (key) => row[key] === undefined || row[key] === null || validTimestamp(row[key]),
    ) &&
    (row.curve_date === undefined || validDate(row.curve_date)) &&
    validDate(row.date) &&
    object(row.metrics)
  );
}

function githubRun(value) {
  if (value === null) return null;
  const match =
    typeof value === 'string' &&
    /^https:\/\/github\.com\/(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)\/actions\/runs\/(?<id>[1-9]\d*)(?:\/attempts\/(?<attempt>[1-9]\d*))?$/u.exec(
      value,
    );
  if (
    !match ||
    !safeId(match.groups.id) ||
    (match.groups.attempt && !safeId(match.groups.attempt))
  ) {
    throw new Error('Invalid producer run_url: expected a canonical HTTPS GitHub Actions run URL');
  }
  return {
    github_run_id: match.groups.id,
    run_attempt: match.groups.attempt ?? null,
    run_url: `https://github.com/${match.groups.owner}/${match.groups.repo}/actions/runs/${match.groups.id}`,
  };
}

function workflowMetadata(value, row, producer) {
  if (
    !object(value) ||
    !['runs', 'changelogs', 'configs', 'runConfigs'].every(
      (key) => Array.isArray(value[key]) && value[key].every(object),
    ) ||
    value.runs.some(
      (run) =>
        !safeId(run.github_run_id) ||
        !safeId(run.run_attempt) ||
        !validDate(run.date) ||
        typeof run.name !== 'string' ||
        (run.conclusion !== null && typeof run.conclusion !== 'string') ||
        (run.html_url !== null && typeof run.html_url !== 'string') ||
        !validTimestamp(run.created_at),
    ) ||
    value.runConfigs.some(
      (config) =>
        !safeId(config.github_run_id) ||
        !['model', 'hardware', 'framework', 'precision', 'spec_method'].every(
          (key) => typeof config[key] === 'string',
        ) ||
        typeof config.disagg !== 'boolean' ||
        !['head_sha', 'html_url', 'run_started_at'].every(
          (key) => config[key] === null || typeof config[key] === 'string',
        ) ||
        (config.run_started_at !== null && !validTimestamp(config.run_started_at)),
    )
  ) {
    throw new Error('Invalid workflow-info response');
  }
  const matching = value.runs.filter((run) => String(run.github_run_id) === producer.github_run_id);
  if (
    matching.length > 1 ||
    matching.some(
      (run) =>
        run.date !== row.date ||
        (producer.run_attempt !== null && String(run.run_attempt) !== producer.run_attempt) ||
        (run.html_url !== null && run.html_url !== producer.run_url),
    )
  ) {
    throw new Error(
      'Producer identity mismatch in workflow-info; it exposes only the latest attempt',
    );
  }
  const configs = value.runConfigs.filter(
    (config) =>
      String(config.github_run_id) === producer.github_run_id &&
      ['model', 'hardware', 'framework', 'precision', 'spec_method', 'disagg'].every(
        (key) => config[key] === row[key],
      ),
  );
  if (
    configs.some(
      (config) =>
        (config.html_url !== null && config.html_url !== producer.run_url) ||
        (row.run_started_at !== undefined &&
          row.run_started_at !== null &&
          config.run_started_at !== null &&
          Math.floor(Date.parse(row.run_started_at) / 1000) !==
            Math.floor(Date.parse(config.run_started_at) / 1000)),
    )
  ) {
    throw new Error('Producer identity mismatch in workflow-info runConfigs');
  }
  // A bare run URL cannot prove the producer attempt from a latest-attempt listing.
  return {
    workflow_run: producer.run_attempt === null ? null : (matching[0] ?? null),
    run_configs: producer.run_attempt === null || matching.length === 0 ? [] : configs,
  };
}

function logWindow(value, id, offset, limit, file) {
  if (value === null) return { status: 'not_found', response: null };
  const count = typeof value?.serverLog === 'string' ? [...value.serverLog].length : -1;
  if (
    !object(value) ||
    !safeId(value.id) ||
    String(value.id) !== id ||
    typeof value.fileName !== 'string' ||
    value.fileName.length === 0 ||
    (file !== undefined && value.fileName !== file) ||
    value.offset !== offset ||
    count < 0 ||
    count > limit ||
    (value.nextOffset !== null && (count === 0 || value.nextOffset !== offset + count))
  ) {
    throw new Error(
      'Invalid server-log response: result, file, or character range does not match the request',
    );
  }
  return {
    status: 'available',
    partial: offset > 0 || value.nextOffset !== null,
    more_available: value.nextOffset !== null,
    inspected_characters: count,
    response: value,
  };
}

async function buildInvestigation(values, packageVersion, getJson, evidence) {
  const offset = Number(values['log-offset']);
  const limit = Number(values['log-limit']);
  const file = values['log-file'];
  const rows = await getJson(
    '/api/v1/benchmarks',
    {
      model: values.model,
      date: values.date,
      runId: values['run-id'],
      exactRun: values['run-id'] === undefined ? undefined : true,
    },
    'benchmarks',
  );
  if (!Array.isArray(rows) || rows.some((row) => !benchmarkRow(row)))
    throw new Error('Invalid benchmark row response');
  const selected = rows.filter((row) => String(row.id) === values.id);
  if (selected.length !== 1)
    throw new Error(
      `Expected exactly one result with ID ${values.id} in the supplied model/snapshot scope; found ${selected.length}`,
    );
  const row = selected[0];
  if (
    values.date !== undefined &&
    (row.date > values.date || (row.curve_date !== undefined && row.curve_date > values.date))
  ) {
    throw new Error('Selected result contradicts the requested as-of cutoff');
  }
  if (row.curve_date !== undefined && row.curve_date < row.date) {
    throw new Error('Selected curve snapshot predates its producer');
  }
  const identity = githubRun(row.run_url);
  const limitations = [
    'Existing public observations only; these records do not establish performance causality.',
    'Log evidence covers one selected file window; other files and characters were not inspected.',
    'workflow_run_id and curve_workflow_run_id are internal identities, not GitHub run IDs.',
  ];
  let producer = {
    status: 'unresolved',
    github_run_id: null,
    run_attempt: null,
    workflow_run: null,
    run_configs: [],
  };
  if (identity) {
    const info = await getJson(
      '/api/v1/workflow-info',
      {
        date: row.date,
        benchmarkType: row.benchmark_type === 'agentic_traces' ? 'agentic_traces' : undefined,
      },
      'workflow-info',
    );
    const metadata = workflowMetadata(info, row, identity);
    producer = {
      status: metadata.workflow_run ? 'confirmed' : 'row_only',
      github_run_id: identity.github_run_id,
      run_attempt: identity.run_attempt,
      ...metadata,
    };
    if (!metadata.workflow_run)
      limitations.push(
        'The public latest-attempt workflow listing did not confirm the producing attempt.',
      );
    if (metadata.run_configs.length === 0)
      limitations.push(
        'No matching producer config was confirmed in workflow-info; selected_result retains the original config and image.',
      );
  } else {
    limitations.push(
      'The selected run_url is null; the public response cannot identify its GitHub producer or attempt.',
    );
  }
  if (row.image === null)
    limitations.push('The selected row has no image; no image identity was inferred.');
  const log = logWindow(
    await getJson('/api/v1/server-log', { id: values.id, offset, limit, file }, 'server-log', true),
    values.id,
    offset,
    limit,
    file,
  );
  return {
    schema_version: 1,
    metadata: {
      package_version: packageVersion,
      selected_result_id: values.id,
      ran_new_benchmark: false,
      scope: {
        display_model: values.model,
        date: values.date ?? null,
        github_run_id: values['run-id'] ?? null,
        selection:
          values['run-id'] === undefined
            ? values.date === undefined
              ? 'latest_snapshot'
              : 'as_of_snapshot'
            : 'logical_run_snapshot',
      },
      log_window: { file: file ?? null, offset, limit, offset_unit: 'Unicode characters' },
    },
    selected_result: row,
    producer,
    log,
    limitations,
    evidence,
  };
}

export function normalizeArgs(args) {
  try {
    let options;
    if (Array.isArray(args)) {
      const parsed = parseArgs({
        args,
        options: {
          id: { type: 'string' },
          model: { type: 'string' },
          date: { type: 'string' },
          'run-id': { type: 'string' },
          'log-file': { type: 'string' },
          'log-offset': { type: 'string' },
          'log-limit': { type: 'string' },
        },
        tokens: true,
        strict: true,
        allowPositionals: false,
      });
      const names = parsed.tokens.map((token) => token.name);
      if (new Set(names).size !== names.length)
        throw new Error('Specify each result option only once');
      const values = parsed.values;
      options = {
        id: values.id,
        model: values.model,
        date: values.date ?? null,
        run_id: values['run-id'] ?? null,
        log_file: values['log-file'] ?? null,
        log_offset: integerOption(values['log-offset'] ?? '0', 'log-offset', 0, 2_000_000_000),
        log_limit: integerOption(values['log-limit'] ?? '16384', 'log-limit', 1, 262_144),
      };
    } else {
      const keys = ['id', 'model', 'date', 'run_id', 'log_file', 'log_offset', 'log_limit'];
      if (
        !object(args) ||
        Object.keys(args).length !== keys.length ||
        keys.some((key) => !Object.hasOwn(args, key))
      ) {
        throw new Error('Invalid saved result options');
      }
      options = { ...args };
    }
    integerOption(options.id, 'id', 1, Number.MAX_SAFE_INTEGER);
    if (typeof options.model !== 'string' || !options.model.trim())
      throw new Error('--model requires a display model name');
    if (options.date !== null && !validDate(options.date))
      throw new Error('--date must be a valid YYYY-MM-DD date');
    if (options.run_id !== null)
      integerOption(options.run_id, 'run-id', 1, Number.MAX_SAFE_INTEGER);
    if (options.date !== null && options.run_id !== null)
      throw new Error('cannot combine --date and --run-id');
    if (
      !Number.isSafeInteger(options.log_offset) ||
      options.log_offset < 0 ||
      options.log_offset > 2_000_000_000
    ) {
      throw new Error('--log-offset must be an integer from 0 to 2000000000');
    }
    if (
      !Number.isSafeInteger(options.log_limit) ||
      options.log_limit < 1 ||
      options.log_limit > 262_144
    ) {
      throw new Error('--log-limit must be an integer from 1 to 262144');
    }
    if (
      options.log_file !== null &&
      (typeof options.log_file !== 'string' ||
        options.log_file.length === 0 ||
        options.log_file.length > 1024 ||
        options.log_file.includes('\0'))
    ) {
      throw new Error('--log-file must contain 1-1024 characters without NUL');
    }
    return options;
  } catch (error) {
    throw argumentError(error.message, error);
  }
}

function stringIdentities(record) {
  if (record === null) return null;
  const result = { ...record };
  for (const key of [
    'id',
    'workflow_run_id',
    'curve_workflow_run_id',
    'github_run_id',
    'run_attempt',
  ]) {
    if (result[key] !== undefined && result[key] !== null) result[key] = String(result[key]);
  }
  return result;
}

export function collect(options, context) {
  const normalized = normalizeArgs(options);
  return responseBoundary(async () => {
    const evidence = [];
    const report = await buildInvestigation(
      {
        id: normalized.id,
        model: normalized.model,
        date: normalized.date ?? undefined,
        'run-id': normalized.run_id ?? undefined,
        'log-file': normalized.log_file ?? undefined,
        'log-offset': normalized.log_offset,
        'log-limit': normalized.log_limit,
      },
      context.producerVersion,
      async (path, query, operation, allowNotFound = false) => {
        const url = new URL(path, API_ORIGIN);
        for (const [key, value] of Object.entries(query)) {
          if (value !== undefined) url.searchParams.set(key, String(value));
        }
        const saved = await context.get({
          operation,
          url: url.href,
          allowedStatuses: allowNotFound ? [200, 404] : [200],
        });
        evidence.push({
          operation,
          url: url.href,
          response_id: saved.id,
          http_status: saved.status,
          retrieved_at: saved.retrievedAt,
        });
        if (saved.status === 404) {
          if (!object(saved.body) || typeof saved.body.error !== 'string')
            throw responseError(`Invalid ${operation} 404 response`);
          return null;
        }
        return saved.body;
      },
      evidence,
    );
    report.kind = 'result';
    report.metadata.contract_version = 1;
    report.metadata.generated_at = context.generatedAt;
    report.selected_result = stringIdentities(report.selected_result);
    report.producer.workflow_run = stringIdentities(report.producer.workflow_run);
    report.producer.run_configs = report.producer.run_configs.map(stringIdentities);
    const window = report.log.response;
    report.log = {
      status: report.log.status,
      partial: report.log.partial ?? null,
      more_available: report.log.more_available ?? null,
      inspected_characters: report.log.inspected_characters ?? 0,
      file_name: window?.fileName ?? null,
      offset: window?.offset ?? normalized.log_offset,
      next_offset: window?.nextOffset ?? null,
      text: window?.serverLog ?? null,
      source_response_id: evidence.at(-1).response_id,
    };
    const reasons = [];
    if (report.producer.status !== 'confirmed')
      reasons.push({ code: 'producer_unconfirmed', count: 1 });
    if (report.producer.run_configs.length === 0)
      reasons.push({ code: 'producer_config_unconfirmed', count: 1 });
    if (report.selected_result.image === null)
      reasons.push({ code: 'image_unavailable', count: 1 });
    if (report.log.status !== 'available') reasons.push({ code: 'log_unavailable', count: 1 });
    return {
      format: 'json',
      bytes: Buffer.from(`${JSON.stringify(report, null, 2)}\n`),
      coverage: {
        status: reasons.length === 0 ? 'complete' : 'partial',
        selected_records: 1,
        comparable_pairs: null,
        hardware: [{ hardware: report.selected_result.hardware, valid_records: 1 }],
        reasons,
      },
    };
  }, context.signal);
}

if (isMain(import.meta.url)) {
  process.stderr.write(
    'investigate-result.mjs is internal. Use inferencex result inspect instead.\n',
  );
  process.exitCode = 2;
}
