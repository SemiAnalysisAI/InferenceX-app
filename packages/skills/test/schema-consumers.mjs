import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

import { AGENTX_BUNDLE_VARIANTS } from './agentx-bundle-fixtures.mjs';
import { POWERX_BUNDLE_VARIANTS } from './bundle-fixtures.mjs';
import { COLLECTIVEX_BUNDLE_VARIANTS } from './collectivex-bundle-fixtures.mjs';
import { provenanceBundleFixtures } from './provenance-bundle-fixtures.mjs';
import { RELEASE_ARGS, RELEASE_BUNDLE_VARIANTS } from './releases-bundle-fixtures.mjs';
import { TCO_BUNDLE_VARIANTS } from './tco-bundle-fixtures.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'inferencex-schema-consumers-')));
const validator = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const imported = (path) => import(pathToFileURL(path).href);
let producerVersion;

export function assertSchema(schema, value) {
  const validate = validator.compile(schema);
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
}

function rejectSchema(schema, value, label) {
  const validate = validator.compile(schema);
  assert.equal(validate(value), false, `${label} unexpectedly passed`);
}

function command(name, args, options = {}) {
  const { expectedStatus = 0, ...spawnOptions } = options;
  const result = spawnSync(name, args, { encoding: 'utf8', ...spawnOptions });
  assert.ifError(result.error);
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result;
}

function saved(response) {
  const bytes = Buffer.from(JSON.stringify(response.body));
  return {
    id: hash(bytes),
    status: response.status ?? 200,
    retrievedAt: '2026-09-07T00:00:00.000Z',
    bytes,
    body: response.body,
  };
}

function consumerView({ schema_version, kind, rows }) {
  return { schema_version, kind, rows };
}

async function collect(modulePath, args, responses) {
  const operation = await imported(modulePath);
  let cursor = 0;
  const built = await operation.collect(operation.normalizeArgs(args), {
    producerVersion,
    get(spec) {
      const response = responses[cursor++];
      assert.ok(response, `unexpected request: ${spec.operation} ${spec.url}`);
      assert.equal(spec.url, response.url);
      return Promise.resolve(saved(response));
    },
  });
  assert.equal(cursor, responses.length);
  return { built, value: JSON.parse(built.bytes) };
}

const POWERX_COLUMNS = [
  'package_version',
  'query_url',
  'retrieved_at',
  'requested_model',
  'requested_date',
  'date_selection',
  'raw_model',
  'source_response_id',
  'id',
  'model',
  'hardware',
  'framework',
  'image',
  'precision',
  'spec_method',
  'benchmark_type',
  'isl',
  'osl',
  'conc',
  'disagg',
  'is_multinode',
  'offload_mode',
  'recipe_fingerprint',
  'prefill_tp',
  'prefill_ep',
  'prefill_dp_attention',
  'prefill_num_workers',
  'decode_tp',
  'decode_ep',
  'decode_dp_attention',
  'decode_num_workers',
  'num_prefill_gpu',
  'num_decode_gpu',
  'date',
  'workflow_run_id',
  'run_started_at',
  'run_url',
  'curve_date',
  'curve_workflow_run_id',
  'curve_run_started_at',
  'power_valid',
  'power_metric_schema_version',
  'avg_power_w',
  'prefill_avg_power_w',
  'decode_avg_power_w',
  'joules_per_successful_query',
  'joules_per_input_token',
  'joules_per_output_token',
  'joules_per_total_token',
  'prefill_joules_per_input_token',
  'decode_joules_per_output_token',
  'avg_temp_c',
  'peak_temp_c',
  'avg_util_pct',
  'avg_mem_used_mb',
];
const AGENTX_COLUMNS = [
  'package_version',
  'query_url',
  'retrieved_at',
  'requested_model',
  'requested_date',
  'date_selection',
  'requested_benchmark_type',
  'filter.raw_model',
  'filter.hardware',
  'filter.framework',
  'filter.precision',
  'filter.spec_method',
  'filter.offload_mode',
  'filter.concurrency',
  'source_response_ids',
  'id',
  'model',
  'hardware',
  'framework',
  'image',
  'precision',
  'spec_method',
  'benchmark_type',
  'conc',
  'offload_mode',
  'recipe_fingerprint',
  'disagg',
  'is_multinode',
  'prefill_tp',
  'prefill_ep',
  'prefill_dp_attention',
  'prefill_num_workers',
  'decode_tp',
  'decode_ep',
  'decode_dp_attention',
  'decode_num_workers',
  'num_prefill_gpu',
  'num_decode_gpu',
  'isl',
  'osl',
  'date',
  'workflow_run_id',
  'run_started_at',
  'run_url',
  'curve_date',
  'curve_workflow_run_id',
  'curve_run_started_at',
  'metrics_json',
  'aggregate.isl.mean',
  'aggregate.isl.p50',
  'aggregate.isl.p75',
  'aggregate.isl.p90',
  'aggregate.isl.p95',
  'aggregate.isl.p99',
  'aggregate.isl.n',
  'aggregate.osl.mean',
  'aggregate.osl.p50',
  'aggregate.osl.p75',
  'aggregate.osl.p90',
  'aggregate.osl.p95',
  'aggregate.osl.p99',
  'aggregate.osl.n',
  'aggregate.kvCacheUtil.mean',
  'aggregate.kvCacheUtil.p50',
  'aggregate.kvCacheUtil.p75',
  'aggregate.kvCacheUtil.p90',
  'aggregate.kvCacheUtil.p95',
  'aggregate.kvCacheUtil.p99',
  'aggregate.kvCacheUtil.n',
  'aggregate.prefixCacheHitRate.mean',
  'aggregate.prefixCacheHitRate.p50',
  'aggregate.prefixCacheHitRate.p75',
  'aggregate.prefixCacheHitRate.p90',
  'aggregate.prefixCacheHitRate.p95',
  'aggregate.prefixCacheHitRate.p99',
  'aggregate.prefixCacheHitRate.n',
  'derived.p75_e2e_norm_intvty',
  'derived.p90_e2e_norm_intvty',
  'trace.available',
  'trace.response_key_present',
  'enrichment.status',
  'enrichment.aggregates_status',
  'enrichment.derived_metrics_status',
  'enrichment.trace_availability_status',
];

try {
  const suppliedArchive = process.env.INFERENCEX_SKILLS_ARCHIVE;
  const suppliedHash = process.env.INFERENCEX_SKILLS_ARCHIVE_SHA256;
  assert.equal(
    suppliedArchive === undefined,
    suppliedHash === undefined,
    'archive path and SHA-256 must be supplied together',
  );
  let archive;
  if (suppliedArchive === undefined) {
    const packed = JSON.parse(
      command('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch], {
        cwd: packageRoot,
      }).stdout,
    )[0];
    archive = join(scratch, packed.filename);
  } else {
    archive = resolve(suppliedArchive);
    assert.equal(hash(readFileSync(archive)), suppliedHash, 'supplied archive SHA-256 differs');
  }
  assert.match(basename(archive), /^semianalysisai-inferencex-skills-\d+\.\d+\.\d+\.tgz$/u);
  command('tar', ['-xzf', archive, '-C', scratch]);
  const installed = join(scratch, 'package', 'skills', 'inferencex-api');
  producerVersion = JSON.parse(readFileSync(join(scratch, 'package', 'package.json'))).version;
  const scripts = join(installed, 'scripts');
  const schemas = JSON.parse(readFileSync(join(installed, 'schemas.json'), 'utf8'));
  assert.deepEqual(Object.keys(schemas).toSorted(), [
    'agentx',
    'collectivex',
    'discovery',
    'doctor',
    'error',
    'manifest',
    'powerx',
    'releases',
    'result',
    'summary',
    'tco',
    'verification',
  ]);

  const powerxResponse = {
    operation: 'benchmarks',
    url: 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=GLM-5&powerValid=strictV2',
    body: POWERX_BUNDLE_VARIANTS.positive.rows,
    status: 200,
  };
  const powerx = await collect(
    join(scripts, 'export-powerx.mjs'),
    ['--model', 'GLM-5', '--isl', '8192', '--osl', '1024'],
    [powerxResponse],
  );
  const agentx = await collect(
    join(scripts, 'export-agentx.mjs'),
    AGENTX_BUNDLE_VARIANTS.positive.args.slice(2),
    AGENTX_BUNDLE_VARIANTS.positive.responses,
  );
  const provenanceFixtures = provenanceBundleFixtures().result;
  const provenanceFixture = provenanceFixtures['producer-differs-from-curve'];
  const result = await collect(
    join(scripts, 'investigate-result.mjs'),
    provenanceFixture.args.slice(2),
    provenanceFixture.responses,
  );
  const tcoFixture = TCO_BUNDLE_VARIANTS.positive;
  const tco = await collect(
    join(scripts, 'compare-tco.mjs'),
    tcoFixture.args.slice(2),
    tcoFixture.responses,
  );
  const releases = await collect(join(scripts, 'compare-releases.mjs'), RELEASE_ARGS, [
    {
      operation: 'benchmark-history',
      url: 'https://inferencex.semianalysis.com/api/v1/benchmarks/history?model=GLM-5&isl=8192&osl=1024',
      body: RELEASE_BUNDLE_VARIANTS.comparable.rows,
      status: 200,
    },
  ]);
  const collectivexFixture = COLLECTIVEX_BUNDLE_VARIANTS.positive;
  const collectivex = await collect(
    join(scripts, 'compare-collectivex.mjs'),
    collectivexFixture.args.slice(2),
    collectivexFixture.responses,
  );
  const outputs = { powerx, agentx, result, tco, releases, collectivex };
  for (const [kind, output] of Object.entries(outputs)) assertSchema(schemas[kind], output.value);
  const validVariants = [
    [
      'result',
      await collect(
        join(scripts, 'investigate-result.mjs'),
        provenanceFixtures['missing-log'].args.slice(2),
        provenanceFixtures['missing-log'].responses,
      ),
    ],
    [
      'tco',
      await collect(
        join(scripts, 'compare-tco.mjs'),
        TCO_BUNDLE_VARIANTS.partial.args.slice(2),
        TCO_BUNDLE_VARIANTS.partial.responses,
      ),
    ],
    [
      'tco',
      await collect(
        join(scripts, 'compare-tco.mjs'),
        TCO_BUNDLE_VARIANTS.boundaries.args.slice(2),
        TCO_BUNDLE_VARIANTS.boundaries.responses,
      ),
    ],
    [
      'collectivex',
      await collect(
        join(scripts, 'compare-collectivex.mjs'),
        COLLECTIVEX_BUNDLE_VARIANTS['kv-positive'].args.slice(2),
        COLLECTIVEX_BUNDLE_VARIANTS['kv-positive'].responses,
      ),
    ],
  ];
  for (const [kind, output] of validVariants) assertSchema(schemas[kind], output.value);

  const { POWERX_CSV_COLUMNS, AGENTX_CSV_COLUMNS } = await imported(
    join(scripts, 'export-contract.mjs'),
  );
  assert.deepEqual(POWERX_CSV_COLUMNS, POWERX_COLUMNS);
  assert.deepEqual(AGENTX_CSV_COLUMNS, AGENTX_COLUMNS);

  const { reserveBundle } = await imported(join(scripts, 'evidence-bundle.mjs'));
  const writer = await reserveBundle(join(scratch, 'evidence'));
  const response = saved(powerxResponse);
  const client = {
    attempts: [],
    get() {
      this.attempts.push({
        operation: 'benchmarks',
        url: powerxResponse.url,
        ordinal: 1,
        startedAt: '2026-09-07T00:00:00.000Z',
        endedAt: '2026-09-07T00:00:00.001Z',
        status: 200,
        consumedBytes: response.bytes.length,
        retry: { decision: 'accepted', reason: 'allowed_status' },
      });
      return Promise.resolve(response);
    },
  };
  const recorded = await writer.get(
    { operation: 'benchmarks', url: powerxResponse.url, allowedStatuses: [200] },
    client,
  );
  assert.equal(recorded.id, response.id);
  const powerxModule = await imported(join(scripts, 'export-powerx.mjs'));
  const completed = await writer.complete({
    command: 'powerx export',
    kind: 'powerx',
    contractVersion: 1,
    options: powerxModule.normalizeArgs(['--model', 'GLM-5', '--isl', '8192', '--osl', '1024']),
    producerVersion,
    generatedAt: '2026-09-07T00:00:00.000Z',
    built: powerx.built,
  });
  assertSchema(schemas.manifest, completed.manifest);
  assertSchema(schemas.summary, completed.manifest.summary);

  const preload = join(scratch, 'summary-response.mjs');
  writeFileSync(
    preload,
    `const fixture = ${JSON.stringify(powerxResponse)};
globalThis.fetch = async (input) => {
  if (String(input.url ?? input) !== fixture.url) throw new Error('Unexpected summary request');
  return new Response(JSON.stringify(fixture.body), { status: 200 });
};`,
  );
  for (const expectedStatus of [0, 3]) {
    const outputDirectory = join(scratch, `stdout-summary-${expectedStatus}`);
    const exported = command(
      process.execPath,
      [
        '--import',
        pathToFileURL(preload).href,
        join(scripts, 'inferencex.mjs'),
        'powerx',
        'export',
        '--model',
        'GLM-5',
        '--isl',
        '8192',
        '--osl',
        '1024',
        '--output-dir',
        outputDirectory,
        ...(expectedStatus === 3 ? ['--require-hardware', 'absent-hardware'] : []),
      ],
      { expectedStatus },
    );
    assert.equal(exported.stderr, '');
    const summary = JSON.parse(exported.stdout);
    assertSchema(schemas.summary, summary);
    const manifest = JSON.parse(readFileSync(join(outputDirectory, 'manifest.json'), 'utf8'));
    assertSchema(schemas.manifest, manifest);
    const verified = command(
      process.execPath,
      [
        join(scripts, 'inferencex.mjs'),
        'verify',
        outputDirectory,
        ...(expectedStatus === 3 ? ['--require-hardware', 'absent-hardware'] : []),
      ],
      { expectedStatus },
    );
    assertSchema(schemas.verification, JSON.parse(verified.stdout));
    assert.deepEqual(summary, {
      ...manifest.summary,
      output: { ...manifest.summary.output, directory: outputDirectory },
    });
  }

  const { verifyBundle } = await imported(join(scripts, 'verify-bundle.mjs'));
  const verification = await verifyBundle(completed.directory);
  assertSchema(schemas.verification, verification);

  const discoveryModule = await imported(join(scripts, 'discover.mjs'));
  const discovery = await discoveryModule.discover(discoveryModule.normalizeArgs(['capabilities']));
  assertSchema(schemas.discovery, discovery);
  let doctor;
  try {
    const doctorModule = await imported(join(scripts, 'doctor.mjs'));
    doctor = await doctorModule.diagnose([]);
  } catch (error) {
    assert.equal(error.code, 'INSTALLATION_UNHEALTHY');
    doctor = error.details;
  }
  assertSchema(schemas.doctor, doctor);
  assertSchema(schemas.error, {
    schema_version: 1,
    package: '@semianalysisai/inferencex-skills',
    package_version: producerVersion,
    command: 'inferencex',
    error: { code: 'INVALID_ARGUMENT', message: 'example' },
  });

  const additive = structuredClone(powerx.value);
  additive.future_optional_field = { ignored_by_consumer: true };
  assertSchema(schemas.powerx, additive);
  assert.deepEqual(consumerView(additive), consumerView(powerx.value));

  const wrongUnit = structuredClone(powerx.value);
  wrongUnit.units.avg_power_w = 'W';
  rejectSchema(schemas.powerx, wrongUnit, 'wrong PowerX unit');
  const wrongType = structuredClone(tco.value);
  wrongType.rows[0].usd_per_gpu_hour = '3.6';
  rejectSchema(schemas.tco, wrongType, 'wrong TCO numeric type');
  const ambiguousMissing = structuredClone(tco.value);
  ambiguousMissing.rows[0].usd_per_million_output_tokens = null;
  rejectSchema(schemas.tco, ambiguousMissing, 'available TCO row with missing cost');
  const disallowedNull = structuredClone(result.value);
  disallowedNull.selected_result.id = null;
  rejectSchema(schemas.result, disallowedNull, 'null result ID');
  const unknownStatus = structuredClone(tco.value);
  unknownStatus.rows[0].status = 'estimated';
  rejectSchema(schemas.tco, unknownStatus, 'unknown closed TCO status');
  const ambiguousEnrichment = structuredClone(agentx.value);
  ambiguousEnrichment.rows[0].agentx.aggregates.value = null;
  rejectSchema(schemas.agentx, ambiguousEnrichment, 'available AgentX aggregate with null value');
  const ambiguousCollectiveMetric = structuredClone(collectivex.value);
  ambiguousCollectiveMetric.comparisons[0].metrics[0].left.value = null;
  rejectSchema(
    schemas.collectivex,
    ambiguousCollectiveMetric,
    'CollectiveX value status with null value',
  );
  const failedPolicy = structuredClone(completed.manifest.summary);
  failedPolicy.policy = {
    status: 'failed',
    requirements: { require_hardware: ['absent-hardware'], min_comparable_pairs: null },
    reasons: [{ code: 'REQUIRED_HARDWARE_MISSING', required: 1, actual: 0 }],
  };
  rejectSchema(schemas.summary, failedPolicy, 'hardware policy failure without hardware');
  failedPolicy.policy.reasons = [{ code: 'MIN_COMPARABLE_PAIRS_UNMET', required: 2, actual: 1 }];
  assertSchema(schemas.summary, failedPolicy);
  failedPolicy.policy.reasons[0].actual = '1';
  rejectSchema(schemas.summary, failedPolicy, 'policy actual value with wrong numeric type');

  const incompleteAttempt = structuredClone(completed.manifest);
  delete incompleteAttempt.requests[0].attempts[0].status;
  rejectSchema(schemas.manifest, incompleteAttempt, 'evidence attempt without outcome');

  process.stdout.write(
    'Validated 12 public schemas, 10 packed domain outputs, 4 CLI stdout documents, and 10 negative fixtures.\n',
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
