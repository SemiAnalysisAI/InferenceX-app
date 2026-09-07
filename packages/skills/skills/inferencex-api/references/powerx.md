# PowerX measured-data export

Use the bundled exporter through the versioned CLI on Node 24 or 26 for measured
GPU power and energy in an exact single-turn workload. Consult the current
[OpenAPI benchmark operation](https://inferencex.semianalysis.com/api/openapi.json)
for supported display models and metric descriptions. The exporter consumes the
complete public JSON response; an extracted web-page summary cannot establish
coverage or supply missing observations.

For a replayable contract 1 bundle, prefer the versioned entry:

```bash
mkdir -p evidence
node .agents/skills/inferencex-api/scripts/inferencex.mjs powerx export \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 --format csv \
  --output-dir evidence/powerx --require-hardware b200
```

A valid empty scope exits 0 unless the explicit hardware predicate fails, which
commits the bundle and exits 3. See the [CLI contract](cli.md).

## Run the installed exporter

Use `inferencex powerx export`. JSON is the default; add `--format csv` when needed.
`--date` is an as-of cutoff and source observations can be older. `--raw-model`
optionally narrows the returned raw key within a display bucket; discover that key
from current responses.

## Save the response used by an export

The required `--output-dir` is a new evidence bundle. The exporter saves each
complete decoded response before filtering. `manifest.json` links it to the result:

- Top-level `schema_version`, `kind`, `contract_version`, `created_at`, and
  `producer.package_version` identify the bundle contract and producer.
- `normalized_arguments` records the display model, workload, date, raw-model filter,
  and result format.
- Each `requests[]` entry records the operation, exact URL, allowed statuses, every
  attempt, and the accepted response's status, retrieval time, relative body path,
  SHA-256, size, and decoded encoding.
- `result` records the relative `result.json` or `result.csv` path, format, SHA-256,
  and size. `coverage` and `summary` retain selection and policy outcomes, including
  a valid empty selection.

Only a manifest committed last means the bundle completed. HTTP, JSON, shape, or
write errors exit unsuccessfully; retain the incomplete directory for diagnosis.
Existing output directories are refused.

Use `inferencex verify <directory>` to reconstruct the result from the saved
responses. A later API request is separate evidence and may return different data.

## Selection and coverage

The request uses `/api/v1/benchmarks` with `model`, optional `date`, and
`powerValid=strictV2`. Each selected row must satisfy the exact numeric predicate:

```js
row.metrics.power_valid === 1 && row.metrics.power_metric_schema_version === 2;
```

The exporter then requires `benchmark_type === 'single_turn'`, exact numeric
`isl` and `osl`, and the optional raw-model match. Strings such as `"1"`, booleans,
missing verdicts, and other schema versions do not qualify. The ordinary benchmark
route does not implement workload filtering through `sequence`; the calculator
projection cannot be combined with `powerValid`. The first exporter covers
single-turn snapshots. For other public reads, return to the general skill;
history has no `powerValid` parameter.

The result metadata reports rows returned by the strict API request, rows selected
by the local scope, and both sets of raw model keys. A requested display bucket can cover
multiple releases. Report the returned keys alongside the requested display name;
the latter does not establish an exact release for every row.

Inspect `metric_coverage` for the requested measurement fields. Each field reports
`available_rows` and `unavailable_rows`; strict row eligibility does not guarantee
metric availability. A missing or null field does not establish whether measurement
occurred or why the value is absent. Report it as unavailable, not as "not measured."
Keep absent JSON keys absent and explicit nulls null; CSV uses blank cells for
unavailable values. Keep eligible rows, state which requested measurements are
unavailable, and avoid zero filling or energy-advantage
claims. Partial metric coverage alone needs no additional diagnostic request.

For any reported measurement count, range, mean, or trend, compute it from the
complete selected export, using every selected row where that metric is finite,
and verify its contributing and missing counts against `metric_coverage`. Omit
unrequested summaries, and never estimate one from samples, correlations, or any
subset of the selected rows.

Before making any all, none, or single-value claim about a categorical field such
as `disagg`, check every selected row; never infer the claim from a sample or subset.

An empty selection succeeds with a header-only CSV or JSON `rows: []`.
`manifest.json` records `coverage.status: "empty"`; JSON result metadata records
`selected_rows: 0`. This establishes no eligible observations for that selection,
not an absence of all underlying benchmarks.
Non-success HTTP responses, malformed JSON, or unexpected response shapes fail
with a nonzero status and no successful export. If the complete response cannot
be obtained, report the access failure rather than reconstructing rows from a
summary or relaxing strict validity.

## Diagnose an empty strict selection

Start from a successfully verified JSON bundle, whose `result.json` metadata
records the strict request and whose `rows` array is empty. Use this recipe only
when `selected_rows` is zero and the user needs an explanation. It makes **one**
unfiltered benchmark request by removing only `powerValid`, then reapplies the
exact local workload/raw-model scope. Keep the original export unchanged and save
diagnostic output separately. Do not rerun this recipe automatically, broaden the
date/model, or merge its rows into the validated export.

Validation and measurement availability are independent. Apply these rules in
order, using the original numeric fields without coercion:

| Evidence                                                                                                 | Validation label                                          |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Numeric `power_valid === 0`                                                                              | `invalid`; any remaining measurements are unreliable.     |
| A present verdict other than numeric `0` or `1`, or a present schema that is not a positive safe integer | `unknown`.                                                |
| Numeric schema `>= 3`                                                                                    | `unsupported_schema`; future semantics are not schema v2. |
| Absent verdict, absent schema, or schema `1`                                                             | `legacy_unverified` for strictV2.                         |
| Numeric verdict `1` and schema `2`                                                                       | `strictV2_eligible`.                                      |

Check the nine named watts/joules fields separately. `some_recorded` means at
least one is a finite number, including zero; `missing` means none is. The
`unavailable_metrics` list identifies the rest, including null, non-finite, or
malformed values. Optional role-specific fields can legitimately be absent.
Temperature/utilization alone does not establish recorded power or energy.
Missing audit data does not establish invalidity; quote reported reason codes
only as supplied and leave an unreported cause unknown.

```bash
node --input-type=module - evidence/powerx <<'JS'
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

let strictEmptyConfirmed = false;
async function diagnose() {
  if (process.argv.length !== 3) throw new Error('Provide the saved PowerX bundle directory');
  const manifest = JSON.parse(await readFile(join(process.argv[2], 'manifest.json'), 'utf8'));
  if (
    manifest?.schema_version !== 1 || manifest.kind !== 'powerx' ||
    manifest.contract_version !== 1 || manifest.result?.format !== 'json' ||
    manifest.result?.path !== 'result.json' ||
    !/^[a-f0-9]{64}$/u.test(manifest.result?.sha256 ?? '') ||
    !Number.isSafeInteger(manifest.result?.size) || manifest.result.size < 0 ||
    manifest.coverage?.status !== 'empty' || manifest.coverage?.selected_records !== 0
  ) throw new Error('Expected a completed empty PowerX JSON bundle');
  const resultBytes = await readFile(join(process.argv[2], manifest.result.path));
  if (
    resultBytes.length !== manifest.result.size ||
    createHash('sha256').update(resultBytes).digest('hex') !== manifest.result.sha256
  ) throw new Error('PowerX result size or hash differs from manifest.json');
  const document = JSON.parse(resultBytes.toString('utf8'));
  const strict = document?.metadata;
  const args = manifest.normalized_arguments;
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
  const date = strict?.requested_date;
  const validDate = date === null || (
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
  );
  if (
    !object(args) || args.format !== 'json' || args.model !== strict?.requested_model ||
    args.date !== strict?.requested_date || args.isl !== strict?.isl || args.osl !== strict?.osl ||
    args.raw_model !== strict?.raw_model ||
    !object(document) || document.schema_version !== 1 || document.kind !== 'powerx' ||
    !Array.isArray(document.rows) || document.rows.length !== 0 ||
    !object(strict) || strict.selected_rows !== 0 ||
    !Array.isArray(strict.selected_models) || strict.selected_models.length !== 0 ||
    !Number.isSafeInteger(strict.returned_rows) || strict.returned_rows < 0 ||
    !Array.isArray(strict.returned_models) || strict.returned_models.some((key) => typeof key !== 'string') ||
    strict.non_finite_values !== 0 ||
    typeof strict.package_version !== 'string' || !strict.package_version.trim() ||
    typeof strict.retrieved_at !== 'string' || !Number.isFinite(Date.parse(strict.retrieved_at)) ||
    typeof strict.requested_model !== 'string' || !strict.requested_model.trim() ||
    typeof strict.query_url !== 'string' || strict.benchmark_type !== 'single_turn' ||
    !positiveInteger(strict.isl) || !positiveInteger(strict.osl) || !validDate ||
    strict.date_selection !== (date === null ? 'latest' : 'as-of') ||
    !(strict.raw_model === null || typeof strict.raw_model === 'string' && strict.raw_model.trim())
  ) throw new Error('Expected a successful empty strict PowerX JSON result with valid scope metadata');
  const url = new URL(strict.query_url);
  if (
    url.origin !== 'https://inferencex.semianalysis.com' ||
    url.pathname !== '/api/v1/benchmarks' || url.username || url.password || url.hash ||
    url.searchParams.get('model') !== strict.requested_model ||
    url.searchParams.get('date') !== date || url.searchParams.get('powerValid') !== 'strictV2' ||
    [...url.searchParams.keys()].some((key) => !['model', 'date', 'powerValid'].includes(key)) ||
    ['model', 'date', 'powerValid'].some((key) => url.searchParams.getAll(key).length > 1)
  ) throw new Error('Recorded URL does not match the strict benchmark scope');
  strictEmptyConfirmed = true;
  url.searchParams.delete('powerValid');
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new Error(`Diagnostic request returned HTTP ${response.status}`);
  const rows = await response.json();
  const retrievedAt = new Date().toISOString();
  function benchmarkRow(row) {
    if (!object(row) || !object(row.metrics)) return false;
    const date = new Date(`${row.date}T00:00:00Z`);
    return (
      (Number.isSafeInteger(row.id) || (typeof row.id === 'string' && row.id.trim().length > 0)) &&
      ['hardware', 'framework', 'model', 'precision', 'spec_method', 'benchmark_type', 'offload_mode', 'date']
        .every((key) => typeof row[key] === 'string') &&
      ['disagg', 'is_multinode', 'prefill_dp_attention', 'decode_dp_attention']
        .every((key) => typeof row[key] === 'boolean') &&
      ['prefill_tp', 'prefill_ep', 'prefill_num_workers', 'decode_tp', 'decode_ep', 'decode_num_workers', 'num_prefill_gpu', 'num_decode_gpu', 'conc']
        .every((key) => Number.isInteger(row[key])) &&
      ['isl', 'osl'].every((key) => row[key] === null || Number.isFinite(row[key])) &&
      ['image', 'run_url'].every((key) => row[key] === null || typeof row[key] === 'string') &&
      /^\d{4}-\d{2}-\d{2}$/u.test(row.date) && Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === row.date
    );
  }
  if (!Array.isArray(rows) || rows.some((row) => !benchmarkRow(row))) {
    throw new Error('Unexpected diagnostic response shape: required benchmark fields are missing or malformed');
  }
  const scoped = rows.filter((row) =>
    row.benchmark_type === 'single_turn' && row.isl === strict.isl && row.osl === strict.osl &&
    (strict.raw_model === null || row.model === strict.raw_model)
  );
  const measurementKeys = [
    'avg_power_w', 'prefill_avg_power_w', 'decode_avg_power_w',
    'joules_per_successful_query', 'joules_per_input_token', 'joules_per_output_token',
    'joules_per_total_token', 'prefill_joules_per_input_token', 'decode_joules_per_output_token',
  ];
  function validation(metrics) {
    const verdict = metrics.power_valid;
    const schema = metrics.power_metric_schema_version;
    if (verdict === 0) return 'invalid';
    if (verdict !== undefined && verdict !== 1) return 'unknown';
    if (schema !== undefined && !positiveInteger(schema)) return 'unknown';
    if (schema >= 3) return 'unsupported_schema';
    if (verdict === undefined || schema === undefined || schema === 1) return 'legacy_unverified';
    return 'strictV2_eligible';
  }
  const validationCounts = { invalid: 0, unknown: 0, unsupported_schema: 0, legacy_unverified: 0, strictV2_eligible: 0 };
  const measurementCounts = { some_recorded: 0, missing: 0 };
  const observations = scoped.map((row) => {
    const label = validation(row.metrics);
    const recorded = measurementKeys.filter((key) => Number.isFinite(row.metrics[key]));
    validationCounts[label]++;
    measurementCounts[recorded.length ? 'some_recorded' : 'missing']++;
    return {
      id: row.id, model: row.model, date: row.date, run_url: row.run_url,
      validation: label, power_valid: row.metrics.power_valid,
      power_metric_schema_version: row.metrics.power_metric_schema_version,
      recorded_metrics: Object.fromEntries(recorded.map((key) => [key, row.metrics[key]])),
      unavailable_metrics: measurementKeys.filter((key) => !recorded.includes(key)),
      power_invalid_reasons: row.power_invalid_reasons,
    };
  });
  console.log(JSON.stringify({
    strict,
    diagnostic: {
      query_url: url.href, retrieved_at: retrievedAt, returned_rows: rows.length, scoped_rows: scoped.length,
      scope: { requested_model: strict.requested_model, requested_date: date, raw_model: strict.raw_model,
        benchmark_type: 'single_turn', isl: strict.isl, osl: strict.osl },
      outcome: validationCounts.strictV2_eligible ? 'response_discrepancy' : scoped.length ? 'classified' : 'no_observations',
      validation_counts: validationCounts, measurement_counts: measurementCounts, rows: observations,
    },
  }, null, 2));
}
diagnose().catch((error) => {
  const status = strictEmptyConfirmed
    ? 'The earlier strict selection remains empty; underlying availability is unknown.'
    : 'No diagnostic request was made; inspect the saved result.';
  console.error(`Diagnostic failed: ${error.message}. ${status}`);
  process.exitCode = 1;
});
JS
```

Retain both request URLs and retrieval times. `no_observations` describes this
unfiltered response at the recorded scope. `response_discrepancy` means the later
response contains a scoped row that meets the same strict predicate, even if its
measurements are missing. The responses disagree; the cause is unknown. Do not
claim a cache, deployment, or timing cause without evidence, or use those rows to
silently replace the original export. A failed diagnostic leaves the original
empty strict result intact and the underlying availability undetermined.

## Measurement meanings

All fields below are inside `row.metrics` and may be absent on individual rows.

| Fields                                      | Meaning and units                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `avg_power_w`                               | Mean measured power per GPU during the load window, in W.                    |
| `prefill_avg_power_w`, `decode_avg_power_w` | Mean measured W per GPU in the named role.                                   |
| `joules_per_successful_query`               | Whole-deployment GPU energy divided by successful requests, in J/query.      |
| `joules_per_output_token`                   | Whole-deployment GPU energy divided by generated output tokens, in J/token.  |
| `joules_per_total_token`                    | Whole-deployment GPU energy divided by input plus output tokens, in J/token. |
| `joules_per_input_token`                    | Whole-deployment GPU energy divided by input tokens, in J/token.             |
| `prefill_joules_per_input_token`            | Prefill-role GPU energy per input token, in J/token.                         |
| `decode_joules_per_output_token`            | Decode-role GPU energy per generated output token, in J/token.               |
| `avg_temp_c`, `peak_temp_c`                 | Mean and peak per-GPU temperature, in °C.                                    |
| `avg_util_pct`, `avg_mem_used_mb`           | Mean per-GPU utilization (%) and memory use (MB).                            |

For `joules_per_output_token`, GPU energy across the whole deployment is the
numerator; generated output-token count is the denominator. "Whole deployment"
describes the energy scope, not the denominator. Keep that distinction in prose
as well as in the exported field name.

The whole-deployment meanings above require schema version 2, including for
disaggregated deployments. Role-prefixed energy remains role-local. Preserve the
producer's values; dividing whole-deployment joules by GPU count changes the metric.
Every PowerX summary must state that measured per-GPU watts and whole-deployment
GPU energy cover accelerator telemetry only; they exclude facility power, cooling,
other non-GPU energy, and provisioned-power estimates. Keep any provisioned-power
estimate and its assumptions separate.

Preserve zero as a number and missing data as blank CSV cells or JSON null/absence.
The exporter replaces non-finite numeric values with null, leaves their CSV cells
blank, and discloses their count. Strict eligibility does not guarantee every
metric or optional audit field is populated, or prove a representative energy win.
Scope claims about missing, null or zero measurements to the named metric fields
and selected rows you checked. Request metadata, topology and coverage counts are
separate: a zero count is not a measured zero, and unavailable metric keys do not
imply that the rest of the JSON contains no null values.

## Export and provenance

JSON contains `metadata` and the selected `rows`. Metadata records package version,
query URL, retrieval time, requested display model/date, date-selection mode,
workload, optional raw-model filter, coverage counts, model keys, and non-finite
value count. Selected rows retain optional nested data and additional raw metrics,
subject to the numeric sanitation described above.

Each artifact's request URL and retrieval time must come from its own metadata or
manifest; never reuse either value from another artifact.

CSV repeats request/version/scope metadata beside each observation and includes
the following original fields, plus the documented power/energy/telemetry metrics:

| Group                      | Original fields to preserve                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity and configuration | `id`, `model`, `hardware`, `framework`, `precision`, `spec_method`, `offload_mode`, `image`, `recipe_fingerprint`                                |
| Workload                   | `benchmark_type`, `isl`, `osl`, `conc`                                                                                                           |
| Deployment                 | `disagg`, `is_multinode`, `num_prefill_gpu`, `num_decode_gpu`                                                                                    |
| Parallelism                | `prefill_tp`, `prefill_ep`, `prefill_dp_attention`, `prefill_num_workers`, `decode_tp`, `decode_ep`, `decode_dp_attention`, `decode_num_workers` |
| Observation and producer   | `date`, `run_url`, optional `workflow_run_id`, `run_started_at`                                                                                  |
| Logical snapshot           | `curve_date`, `curve_workflow_run_id`, `curve_run_started_at`                                                                                    |

IDs can arrive as strings, including values beyond JavaScript's safe integer range;
preserve them exactly. Retain the complete run URL, including any `/attempts/` path.
Single-turn rows commonly omit producer workflow IDs/start times, while snapshot
fields remain present. Keep those producer fields absent; a snapshot ID does not
identify the producer of every observation. Preserve source timestamps as supplied.

Preserve raw topology alongside `disagg`. On non-disaggregated rows, prefill and
decode roles can share the same GPUs: `num_prefill_gpu=8` and `num_decode_gpu=8`
are not evidence of a 16-GPU deployment. Do not sum those role fields or invent a
deployment-total column or range. Report the original configuration fields; if a
user requests a derived total, first verify the allocation semantics for that
configuration. A disaggregated configuration can have distinct role pools, but
that rule cannot be applied to aggregated rows. This follows the distinction in
the [existing data-transform documentation](https://github.com/SemiAnalysisAI/InferenceX-app/blob/cc5d87cd37a3a502ce63b58c8985fa034fa07965/docs/data-transforms.md).

Optional `workers`, `power_audit`, and `power_invalid_reasons` are top-level row
fields, separate from `metrics`. JSON retains them when present, including null
workers. Their absence does not prevent export or justify inventing audit evidence.

Deliver the export with the selected workload/model keys, measurement dates,
request URL, retrieval time, package version, and coverage summary. State that this
is extraction of existing observations and that no new benchmark runs occurred.
Use the recorded request and local filters to repeat the procedure; live data can
change, so a saved URL alone does not freeze an immutable result.

Both reads validate the required benchmark identity, configuration, workload and
measurement-date fields before filtering, even on out-of-scope rows. Contract-defined
null workload lengths, image, and run URL remain permitted. Optional producer,
snapshot, recipe, audit and measurement fields can remain absent. Malformed required
fields fail the read; they are not evidence of an empty workload. Numeric benchmark
IDs must be safe integers; string IDs are retained without conversion.
