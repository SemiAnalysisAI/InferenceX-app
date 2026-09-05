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

Public timelines contain sanitized replay structure. They do not expose original
prompts, code, or tool payloads. Preserve every phase, replay-lane field, and
cancellation state returned by the API; do not reduce the timeline to successful
main-agent requests. Event fields such as `start`, `ack`, and `end` are nanosecond
offsets from the timeline's documented `startNs`, not wall-clock timestamps.

This workflow reads existing observations and runs no new benchmark. AgentX does
not evaluate model answer quality. If AgentX rows contain power fields, interpret
them with the [PowerX validity and unit guidance](powerx.md): do not automatically
apply `strictV2`, turn missing measurements into zero, mix per-GPU watts with
whole-deployment energy, or rank energy.

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
  const response = await fetch(query_url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${query_url}`);
  const data = await response.json();
  requests.push({ query_url, retrieved_at: new Date().toISOString() });
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
absence. `trace_unavailable` means only that the availability response omitted the
selected key (or returned it as false). It does not mean the benchmark never ran or
that a source artifact never existed. Do not call the page-owned
`/api/v1/request-chart-data` or `/api/v1/trace-server-metric-source` operations.
Do not repeat this recipe across a result set; ask the user to choose another single
ID first.
