# PowerX measured-data export

Use the bundled Node 24 exporter for measured GPU power and energy in an exact
single-turn workload. Consult the current
[OpenAPI benchmark operation](https://inferencex.semianalysis.com/api/openapi.json)
for supported display models and metric descriptions. The exporter consumes the
complete public JSON response; an extracted web-page summary cannot establish
coverage or supply missing observations.

## Run the installed exporter

Resolve the script relative to the loaded `SKILL.md`. From the user's project,
the default Codex location is `.agents/skills/inferencex-api`; Claude Code uses
`.claude/skills/inferencex-api`. Use the actual location for a custom installation.
Output paths are relative to the caller's working directory.

```bash
INFERENCEX_SKILL_DIR='.agents/skills/inferencex-api'
node "$INFERENCEX_SKILL_DIR/scripts/export-powerx.mjs" \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \
  --date 2026-09-04 --format csv --output powerx.csv 2> powerx-report.log
```

For JSON, use `--format json --output powerx.json`. The date above is an example
as-of cutoff; source observations can be older. Omit `--date` for latest available
data. Require the user's display model and positive integer input/output lengths;
`--raw-model` optionally narrows the returned raw model key within a display bucket.
Discover that key from current responses instead of guessing an alias.

`--format` defaults to CSV. Without `--output`, data goes to stdout. Coverage and
error messages go to stderr, so redirecting stdout does not mix them into the
export. Successful exports also emit a JSON metadata record to stderr; retain the
report log so even a header-only CSV has request, scope, and package-version
evidence. Run the script with `--help` for the complete CLI interface.

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

The summary reports rows returned by the strict API request, rows selected by the
local scope, and both sets of raw model keys. A requested display bucket can cover
multiple releases. Report the returned keys alongside the requested display name;
the latter does not establish an exact release for every row.

An empty selection succeeds with a header-only CSV or JSON `rows: []` and reports
**No strictV2 rows matched the requested scope.** This establishes no eligible
observations for that selection, not an absence of all underlying benchmarks.
Non-success HTTP responses, malformed JSON, or unexpected response shapes fail
with a nonzero status and no successful export. If the complete response cannot
be obtained, report the access failure rather than reconstructing rows from a
summary or relaxing strict validity.

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

The whole-deployment meanings above require schema version 2, including for
disaggregated deployments. Role-prefixed energy remains role-local. Preserve the
producer's values; dividing whole-deployment joules by GPU count changes the metric.
Measured GPU energy does not include a measurement of facility power, cooling, or
other non-GPU energy. Keep provisioned-power estimates and their assumptions
separate from these measured fields.

Preserve zero as a number and missing data as blank CSV cells or JSON null/absence.
The exporter replaces non-finite numeric values with null, leaves their CSV cells
blank, and discloses their count. Strict eligibility does not guarantee every
metric or optional audit field is populated, or prove a representative energy win.

## Export and provenance

JSON contains `metadata` and the selected `rows`. Metadata records package version,
query URL, retrieval time, requested display model/date, date-selection mode,
workload, optional raw-model filter, coverage counts, model keys, and non-finite
value count. Selected rows retain optional nested data and additional raw metrics,
subject to the numeric sanitation described above.

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

Optional `workers`, `power_audit`, and `power_invalid_reasons` are top-level row
fields, separate from `metrics`. JSON retains them when present, including null
workers. Their absence does not prevent export or justify inventing audit evidence.

Deliver the export with the selected workload/model keys, measurement dates,
request URL, retrieval time, package version, and coverage summary. State that this
is extraction of existing observations and that no new benchmark runs occurred.
Use the recorded request and local filters to repeat the procedure; live data can
change, so a saved URL alone does not freeze an immutable result.
