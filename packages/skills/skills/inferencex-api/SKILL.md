---
name: inferencex-api
description: Query InferenceX public benchmark data and export validated PowerX measurements. Use for InferenceX API lookups, workload/source checks, or measured power and energy CSV/JSON exports.
---

# InferenceX API

Use the [public API reference](https://inferencex.semianalysis.com/api) and
[current OpenAPI document](https://inferencex.semianalysis.com/api/openapi.json).
Public benchmark reads require HTTPS access and no credentials.

For **PowerX measured-power or energy exports**, read the
[PowerX cookbook](references/powerx.md) and use the
[bundled exporter](scripts/export-powerx.mjs). It selects validated schema-v2
observations for an exact single-turn workload. Use the workflow below for other
public benchmark lookups.

## Query workflow

1. Read the current OpenAPI operation before constructing a request. Use its exact
   parameter names, model enum, response shape, and authentication requirements.
   Reuse the fetched schema during the task.
2. Choose the requested model, workload, configuration, and date scope. Availability
   identifies observed model/date scopes; inspect benchmark rows for configurations.
   Benchmark requests use display model
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
   as failed requests. An empty selection means no rows matched that scope.
4. Report the request URL, retrieval time, requested scope, returned model keys,
   observation dates, and source run links. Preserve identifiers as supplied,
   including numeric-looking strings. Keep original `date` / `run_url` / optional
   producer metadata separate from `curve_*` snapshot metadata. A `date` query is
   an as-of cutoff unless `exact=true`; omitted date means latest available data.
   Neither means the observations were newly measured. Even an exact run snapshot
   can carry older observations forward. State when no new benchmark runs occurred.

Compare observations with matching workload and configuration scope. Keep metric
units and missing values intact; a missing measurement is not zero. Use the
operation's documented metric meanings when interpreting values.

## Basic lookup

This Node 24 example prints up to five latest available single-turn observations
with 8192 input and 1024 output tokens. It reports the full matching count before
sampling; the response retains each observation's actual date and provenance.

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
  sample_rows: selected.slice(0, 5),
}, null, 2));
JS
```

For a dated lookup, add the documented `date` parameter to the URL and record it in
the requested scope. Retain the rows' own dates and source links in the answer.
