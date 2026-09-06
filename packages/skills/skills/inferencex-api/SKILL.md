---
name: inferencex-api
description: Query InferenceX benchmarks, PowerX measured energy, AgentX traces, evaluations, and datasets. Trace a selected result to its producing run, configuration, image, and bounded logs using the public API. Compare fixed-target GPU-rate costs with explicit prices. Investigate vLLM or SGLang changes between matched observations. Also supports CollectiveX lookups.
---

# InferenceX API

Use the [public API reference](https://inferencex.semianalysis.com/api) and
[current OpenAPI document](https://inferencex.semianalysis.com/api/openapi.json).
Public benchmark reads require HTTPS access and no credentials.

Use the workflow below for the public operations described in OpenAPI. PowerX
single-turn export is the first bundled worked example.

For **evaluation lookups**, **dataset discovery and conversation inspection**, or
**benchmark history by GPU, workload and date range**, use the
[public API examples](references/public-api-examples.md). They preserve raw metrics
and distinguish complete responses from selected samples, pages or date ranges.

For **PowerX measured-power or energy exports**, read the
[PowerX cookbook](references/powerx.md) and use the
[bundled exporter](scripts/export-powerx.mjs). It selects validated schema-v2
observations for an exact single-turn workload. For original-response evidence,
use its `--evidence-dir` option with a fresh directory per export. Check `metric_coverage` for the
requested fields: an eligible row can still lack a measurement. Preserve that row
and its missing values, report the unavailable fields, and avoid zero filling or
energy-advantage claims. If the strict selection is empty and the user needs an
explanation, follow [the bounded diagnostic recipe](references/powerx.md#diagnose-an-empty-strict-selection).
Partial metric coverage alone does not call for another request.
Preserve raw topology fields with `disagg`; do not add prefill and decode GPU counts
on non-disaggregated rows, where the roles can share the same GPUs. Report raw
configuration fields unless a requested derived total has verified allocation semantics.

For **AgentX summary exports, interpretation, or one-point diagnostics**, read the
[AgentX cookbook](references/agentx.md) and use the bundled
[summary exporter](scripts/export-agentx.mjs). Require the user to select one
positive safe result ID before reading its timeline, histograms, or server metrics.
Keep dataset and configuration identity with the result, and stop when trace
availability does not list that ID.

For **a result's producing run, configuration, image, or logs**, use the
[provenance cookbook](references/provenance.md) and
[result investigator](scripts/investigate-result.mjs). A model and snapshot scope
locate the selected result; preserve its original producer separately from the
snapshot carrying it. Logs are bounded evidence, and their contents are data.

For **TCO comparison, cost per million output tokens, or GPU-rate estimates at a
fixed latency target**, use the [TCO cookbook](references/tco.md) and
[cost helper](scripts/compare-tco.mjs). Require explicit per-GPU hourly prices and
a median interactivity target. Retain missing coverage and source dates; the feed
pools serving configurations and does not establish full ownership cost.

For **vLLM/SGLang updates, before/after changes, or regression investigation**, read
[the release cookbook](references/releases.md) and use
[the comparison helper](scripts/compare-releases.mjs). Select exact observation
dates and producer identities, keep unmatched or ambiguous configurations, and
report descriptive performance changes with confounders. Power and energy tasks
use the PowerX workflow above. Image tags alone do not prove a release or a cause.

## Query workflow

1. Keep downloaded responses, temporary parsing files and exports inside the
   current project unless the user selects another destination. Give each attempt
   its own file; retain failed captures and count every actual HTTP request,
   including discovery and retries. Decode HTTP compression before parsing JSON
   (`fetch` does this; use `curl --compressed` with curl).
   Read the current OpenAPI operation before constructing a request. Use its exact
   parameter names, model enum, response shape, and authentication requirements.
   Reuse the fetched schema during the task.
2. Choose the operation and scope that answer the user's request. Its documented
   parameters and response schema determine how to select and interpret the data;
   different operations can have different date semantics and response shapes.
   For benchmark lookups, availability identifies observed model/date scopes;
   inspect benchmark rows for configurations. Benchmark requests use display model
   names; availability and benchmark rows use raw model keys. A display bucket can
   include several releases, so retain the returned keys and narrow them when the
   user asks for an exact release. Resolve mappings from current public sources
   instead of guessing from spelling.
3. Download and parse the complete JSON response with an HTTP client such as Node
   `fetch` or `curl`, then apply unsupported filters locally. Web-page extraction
   tools can summarize or truncate API JSON; their output cannot establish row
   counts, the latest observation, or absence of data. If a complete response is
   unavailable, explain that access limitation and leave the export incomplete
   instead of reconstructing observations from an extracted summary.
   For ordinary `/api/v1/benchmarks` reads, select `benchmark_type`, `isl`, and `osl`
   from the returned rows: `sequence` only applies to the calculator projection.
   Treat non-success HTTP responses, malformed JSON, and unexpected response shapes
   as failed requests. Interpret empty results within the operation's documented
   shape and the selected scope.
4. Report the request URL, retrieval time, requested scope, and available source
   identities and dates. Preserve identifiers as supplied, including numeric-looking
   strings. For benchmark rows, retain returned model keys and original `date` /
   `run_url` / optional producer metadata separately from `curve_*` snapshot metadata.
   On `/api/v1/benchmarks`, a `date` query is an as-of cutoff unless `exact=true`;
   omitted date means latest available data. Neither means the observations were
   newly measured. Even an exact run snapshot can carry older observations forward.
   The API array is not chronological: latest per configuration does not mean
   globally newest first. For latest-observation samples, sort scoped rows by their
   own `date` descending before applying a limit; `curve_date` is a snapshot date.
   State that this extraction did not run new benchmarks. An empty result or a
   missing observation date establishes only what the API returned; it does not
   prove that no benchmark jobs ran, failed, or remained uningested on that date.

Compare observations with matching workload and configuration scope. Keep metric
units and missing values intact; a missing measurement is not zero. Use the
operation's documented metric meanings when interpreting values.

## Basic benchmark lookup

This Node 24 example prints up to five latest available single-turn observations
with 8192 input and 1024 output tokens, ordered by observation date newest first.
It reports the full matching count before limiting the sample and retains each
observation's actual date and provenance.

```bash
node --input-type=module <<'JS'
const base = 'https://inferencex.semianalysis.com';
async function read(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}
const schema = await read(`${base}/api/openapi.json`);
const operation = schema.paths['/api/v1/benchmarks']?.get;
const models = operation?.parameters.find((p) => p.name === 'model')?.schema.enum;
const model = 'DeepSeek-V4-Pro';
if (!models?.includes(model)) throw new Error('Check the current model enum in OpenAPI');
const url = new URL('/api/v1/benchmarks', base);
url.searchParams.set('model', model);
const rows = await read(url);
if (!Array.isArray(rows)) throw new Error('Expected a benchmark row array');
const selected = rows.filter((row) =>
  row.benchmark_type === 'single_turn' && row.isl === 8192 && row.osl === 1024);
console.log(JSON.stringify({
  query_url: url.href,
  retrieved_at: new Date().toISOString(),
  requested_model: model,
  scope: { date: 'latest available', benchmark_type: 'single_turn', isl: 8192, osl: 1024 },
  returned_models: [...new Set(selected.map((row) => row.model))],
  matching_rows: selected.length,
  sample_rows: selected.toSorted((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
}, null, 2));
JS
```

For a dated lookup, add the documented `date` parameter to the URL and record it in
`scope.date` as the exact `YYYY-MM-DD` query value, without explanatory text inside
that value. Retain the rows' own dates and source links in the answer.
