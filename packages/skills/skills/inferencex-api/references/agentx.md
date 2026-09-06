# AgentX cookbook

AgentX observations measure serving-system performance under concurrent,
closed-loop agent clients. `conc` is the number of clients that issue their next
request after the previous response; it is not a fixed request batch. Report
throughput together with TTFT and interactivity rather than treating one metric as
a complete result. P75 and p90 E2E Normalized Interactivity are slow-tail
`1 / pXX(E2EL / OSL)`, in `tok/s/user`; they are not percentiles of per-request
rates.

The benchmark read is stable, while the current AgentX diagnostic operations are
beta. Read the live OpenAPI document once per task and use the fetched contract for
that task.

Establish the replay dataset and configuration identity before comparing points.
Match the supplied dataset slug, model, hardware, framework, precision, topology,
offload mode, concurrency, image, observation, producer, and snapshot identities.
Do not infer values that the response omits. Closed-loop systems can progress
through different requests during the same run window, so workload mix can drift,
especially at low concurrency. If identity cannot be confirmed, describe the
comparison as incomplete.
When counting distinct images or recipe fingerprints, count known values separately
from rows whose field is missing or null. Report the missing-row count alongside
the known distinct count; null is not another image or fingerprint.

Public timelines contain sanitized replay structure. They do not expose original
prompts, code, or tool payloads. Preserve every phase, replay-lane field, and
cancellation state returned by the API; do not reduce the timeline to successful
main-agent requests. Timeline-level `startNs` and `endNs` are wall-clock nanosecond
anchors. Per-request `credit`, `start`, `ack`, and `end` are nanosecond offsets from
`timeline.startNs`. Keep those two timestamp roles separate. Retain the original
response text before parsing: JavaScript `Number` can round large integer anchors,
so reserialized parsed values cannot establish their exact original digits.

Inspect each server-metric series' returned fields before calculating statistics.
For example, `queueDepth` carries `running`, `waiting`, and `total`, while scalar
series can use `value`. Summarize the actual fields and their missing values;
absence of `value` alone does not mean a queue-depth sample is missing.

This workflow reads existing observations and runs no new benchmark. AgentX does
not evaluate model answer quality. If AgentX rows contain power fields, interpret
them with the [PowerX validity and unit guidance](powerx.md): do not automatically
apply `strictV2`, turn missing measurements into zero, mix per-GPU watts with
whole-deployment energy, or rank energy.

## Start with AgentX

First discover the replay data using the installed
[dataset cookbook](public-api-examples.md#dataset-discovery-and-conversation-inspection),
then export available AgentX observations. Start with this request:

> On InferenceX, list the available replay datasets and their exact slugs. Then
> export the latest available AgentX summaries for DeepSeek-V4-Pro, raw model
> dsv4, as JSON with the complete response evidence. Show up to five result IDs
> with their actual measurement dates, hardware, configuration and trace
> availability. Report the matching count before sampling. Explain which replay
> dataset identities the responses establish and which are unknown.

A dataset catalog entry alone does not prove that a benchmark used that dataset.
Keep the exact returned slug and confirm the association from the selected
observation's public metadata before comparing replay workloads. The summary
exporter has no dataset filter; preserve unknown associations instead of selecting
by a guessed name. A selected point's `benchmark_siblings.sku.dataset_slug` does
not establish a dataset association for every sibling or exported row.

From the project root, the equivalent summary export is:

```bash
node .agents/skills/inferencex-api/scripts/export-agentx.mjs \
  --model DeepSeek-V4-Pro --raw-model dsv4 --format json \
  --output agentx.json --evidence-dir agentx-evidence
```

For Claude Code, replace `.agents/skills` with `.claude/skills`. Use a fresh evidence
directory. The user then chooses one result ID from the output and asks (replace
`<result ID>` with that exact ID):

> Inspect AgentX result <result ID>. Check its trace availability first. If the
> trace exists, summarize that point's request timeline, latency distributions
> and server metrics. Preserve the dataset and configuration identity and
> explain any missing information. Keep the original response evidence.

Follow [the selected-point recipe](#diagnose-one-explicitly-selected-point) below.
It keeps diagnostics on that result and stops when trace availability is absent.
If no exported result advertises a trace, retain that outcome without scanning
other points. These diagnostics describe replay serving performance, not answer
quality, and do not create a new benchmark run.

## Export AgentX summaries

Use the bundled Node 24 exporter to read the complete benchmark response, select
AgentX observations, and join only the bounded summary enrichments. A display model
is required; `--date` adds an as-of cutoff, and `--raw-model` selects one exact
returned model key. CSV is the default; request JSON explicitly with `--format
json`.

```bash
node .agents/skills/inferencex-api/scripts/export-agentx.mjs \
  --model DeepSeek-V4-Pro --output agentx.csv

node .agents/skills/inferencex-api/scripts/export-agentx.mjs \
  --model DeepSeek-V4-Pro --format json --output agentx.json
```

For Claude Code, use `.claude/skills/inferencex-api/scripts/export-agentx.mjs`.
Optional `--hardware`, `--framework`, `--precision`, `--spec-method`,
`--offload-mode`, and `--concurrency` filters use exact, case-sensitive returned
values. Concurrency must be a positive integer. No aliases or fuzzy matching are
applied. Metadata marks every filter as applied or omitted and lists values present
in the returned AgentX rows so an empty exact selection can be diagnosed without
making claims about jobs or artifacts outside that response.

Add `--evidence-dir agentx-evidence` with a path that does not exist to save every
decoded response consumed by the export and an atomic manifest linking those
responses to the output hash. Keep the evidence directory separate from `--output`.

JSON retains every selected benchmark object separately from its `agentx`
enrichment. CSV repeats package, request, and filter context on every row. Its
`metrics.*` columns are the sorted union of scalar metric keys in the selected
rows; arrays and objects are not embedded in cells. Missing and null cells stay
blank, while real zero and `false` values remain explicit. Both formats record
request URLs, retrieval context, row counts, missing enrichment entries, nullable
groups, and trace availability. The first stderr line is machine-readable metadata,
including for a header-only CSV. `no_agentx_rows` means the complete benchmark
response contained no AgentX observations; `no_matching_rows` means exact local
filters excluded the returned AgentX observations. Neither outcome says whether
other benchmark jobs, failed runs, source artifacts, or data outside that response
exist.

An unsupported raw ID remains in the export but is not sent to numeric enrichment
endpoints. Do not use this summary workflow to bulk-read timelines, histograms, or
server metrics.

## Diagnose one explicitly selected point

Use this recipe only after the user has selected one result ID from a summary or
other public response. Replace `421` with that exact decimal string. It must convert
losslessly to a positive JavaScript safe integer for the diagnostic URLs; keep the
original string in the output, never round a larger identifier, and never expand the
selection to sibling IDs.

The recipe reads the current OpenAPI document once, then fetches sibling identity
and trace availability. A missing availability key returns `trace_unavailable` and
stops before all heavy trace operations. If availability advertises a trace, it
reads exactly one timeline, one-ID histogram data, and aggregate server metrics.
An HTTP error, malformed JSON, or invalid required response after that advertisement
is a trace inconsistency and fails the recipe.

```bash
node --input-type=module <<'JS'
const base = 'https://inferencex.semianalysis.com';
const selectedResultId = '421';
const diagnosticId = /^(?:[1-9]\d*)$/u.test(selectedResultId) ? Number(selectedResultId) : null;
if (!Number.isSafeInteger(diagnosticId) || diagnosticId <= 0 || String(diagnosticId) !== selectedResultId) {
  throw new Error('Select one positive safe integer result ID before reading diagnostics');
}

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const integer = (value) => finite(value) && Number.isInteger(value);
const finiteOrNull = (value) => value === null || finite(value);
const requests = [];

async function read(path) {
  const query_url = new URL(path, base).href;
  const response = await fetch(query_url, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${query_url}`);
  const body_utf8 = await response.text();
  const data = JSON.parse(body_utf8);
  requests.push({ query_url, retrieved_at: new Date().toISOString(), body_utf8 });
  return data;
}

const openapi = await read('/api/openapi.json');
const operations = {
  '/api/v1/benchmark-siblings': 'id',
  '/api/v1/trace-availability': 'ids',
  '/api/v1/request-timeline': 'id',
  '/api/v1/trace-histograms': 'ids',
  '/api/v1/trace-server-metrics': 'id',
};
if (!object(openapi) || Object.entries(operations).some(([path, parameter]) => {
  const operation = openapi.paths?.[path]?.get;
  return !operation || !operation.parameters?.some((item) =>
    item.name === parameter && item.in === 'query' && item.required === true);
})) throw new Error('Inspect the current AgentX diagnostic operations in OpenAPI');

const id = String(diagnosticId);
const siblingResponse = await read(`/api/v1/benchmark-siblings?id=${id}`);
if (!object(siblingResponse) || !object(siblingResponse.sku) ||
    !Array.isArray(siblingResponse.siblings) ||
    siblingResponse.siblings.some((row) => !object(row))) {
  throw new Error('Unexpected benchmark sibling response');
}
const selectedPoint = siblingResponse.siblings.find((row) => String(row.id) === selectedResultId);
if (!selectedPoint) throw new Error('Sibling response does not identify the selected result');

const availability = await read(`/api/v1/trace-availability?ids=${id}`);
if (!object(availability) || Object.entries(availability).some(([key, value]) =>
  key !== id || typeof value !== 'boolean')) {
  throw new Error('Unexpected trace availability response');
}
const traceKeyPresent = Object.hasOwn(availability, id);
const traceAvailable = traceKeyPresent && availability[id] === true;
const common = () => ({
  schema_version: 1,
  metadata: {
    selected_result_id: selectedResultId,
    retrieved_at: new Date().toISOString(),
    requests,
    ran_new_benchmark: false,
    event_timestamp_unit: 'nanoseconds',
    event_timestamp_origin: 'offset from timeline.startNs; not wall-clock',
  },
  benchmark_siblings: siblingResponse,
  selected_point: selectedPoint,
  trace_availability: {
    response: availability,
    key_present: traceKeyPresent,
    available: traceAvailable,
  },
});

if (!traceAvailable) {
  console.log(JSON.stringify({
    ...common(),
    outcome: 'trace_unavailable',
    timeline: null,
    histograms: null,
    server_metrics: null,
  }, null, 2));
} else {
  try {
    const timeline = await read(`/api/v1/request-timeline?id=${id}`);
    if (!object(timeline) || !integer(timeline.version) || !integer(timeline.startNs) ||
        !integer(timeline.endNs) || !finite(timeline.durationS) ||
        !Array.isArray(timeline.requests) || timeline.requests.some((request) =>
          !object(request) || typeof request.cid !== 'string' || !integer(request.ti) ||
          typeof request.wid !== 'string' || !integer(request.ad) ||
          typeof request.phase !== 'string' || !integer(request.credit) ||
          !integer(request.start) || !finiteOrNull(request.ack) || !integer(request.end) ||
          !finiteOrNull(request.ttftMs) || !finiteOrNull(request.tpotMs) ||
          !finiteOrNull(request.isl) || !finiteOrNull(request.osl) ||
          typeof request.cancelled !== 'boolean' ||
          Object.hasOwn(request, 'ri') && !integer(request.ri) ||
          Object.hasOwn(request, 'srcTrace') && typeof request.srcTrace !== 'string' ||
          Object.hasOwn(request, 'srcOuter') && !integer(request.srcOuter) ||
          Object.hasOwn(request, 'srcInner') && !integer(request.srcInner) ||
          Object.hasOwn(request, 'srcKind') && typeof request.srcKind !== 'string')) {
      throw new Error('Unexpected request timeline response');
    }

    const histograms = await read(`/api/v1/trace-histograms?ids=${id}`);
    const histogram = object(histograms) ? histograms[id] : null;
    if (!object(histogram) || Object.keys(histograms).length !== 1 ||
        histogram.id !== diagnosticId ||
        !Array.isArray(histogram.isl) || !histogram.isl.every(finite) ||
        !Array.isArray(histogram.osl) || !histogram.osl.every(finite)) {
      throw new Error('Unexpected one-result trace histogram response');
    }

    const serverMetrics = await read(`/api/v1/trace-server-metrics?id=${id}`);
    const series = ['kvCacheUsage', 'prefixCacheHitRate', 'queueDepth', 'prefillTps',
      'decodeTps', 'prefixCacheHitsTps', 'hostKvCacheUsage', 'kvCacheUsageByEngine'];
    if (!object(serverMetrics) || !object(serverMetrics.meta) ||
        !integer(serverMetrics.startNs) || !integer(serverMetrics.endNs) ||
        !finite(serverMetrics.durationS) || !integer(serverMetrics.timeslicesCount) ||
        serverMetrics.timeslicesCount < 0 ||
        series.some((key) => !Array.isArray(serverMetrics[key]) ||
          serverMetrics[key].some((entry) => !object(entry))) ||
        !object(serverMetrics.promptTokensBySource) ||
        Object.values(serverMetrics.promptTokensBySource).some((entries) =>
          !Array.isArray(entries) || entries.some((entry) => !object(entry))) ||
        !finiteOrNull(serverMetrics.kvCachePoolTokens) ||
        !Array.isArray(serverMetrics.metricSources) ||
        serverMetrics.metricSources.some((entry) => !object(entry)) ||
        Object.hasOwn(serverMetrics.meta, 'id') && serverMetrics.meta.id !== diagnosticId) {
      throw new Error('Unexpected aggregate server metrics response');
    }

    console.log(JSON.stringify({
      ...common(),
      outcome: 'trace_diagnostics',
      timeline,
      histograms,
      server_metrics: serverMetrics,
    }, null, 2));
  } catch (error) {
    throw new Error(
      `Trace availability inconsistency for result ${id}: ${error.message}`,
      { cause: error },
    );
  }
}
JS
```

Save the JSON output with the analysis. `benchmark_siblings.sku` and
`selected_point` retain every identity field the API supplied; absence remains
absence. `metadata.requests[].body_utf8` retains response text before numeric
parsing; use it when exact large-integer values matter. Preserve the distinction
inside `trace_availability`: `key_present: false`
means the response omitted the selected ID, while `key_present: true` with
`available: false` means it explicitly returned `false`. Both produce
`trace_unavailable`; neither means the benchmark never ran or that a source artifact
never existed. Do not call the page-owned
`/api/v1/request-chart-data` or `/api/v1/trace-server-metric-source` operations.
Do not repeat this recipe across a result set; ask the user to choose another single
ID first.
