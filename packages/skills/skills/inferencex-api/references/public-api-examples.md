# Evaluation and dataset examples

These Node 24 recipes use public HTTPS and the current OpenAPI document. Run them
from your project; no repository checkout, database credentials, or extra packages
are needed. Each prints JSON only after successful reads and records each request
URL and retrieval time. Save the output with the answer. HTTP errors, malformed
JSON, and unexpected response shapes are failures, not empty results.

## Evaluation lookup

Example request: "Show up to five recent evaluation observations for raw model
`dsv4` and task `gsm8k`, with the matching count, original metrics, and provenance."

The current `/api/v1/evaluations` operation returns a complete array with no query
parameters. Filter its raw `model` and `task` locally; the benchmark endpoint's
display-model names, date filters, and `powerValid` do not apply. Edit `scope` for
the requested raw values, or use `null` to leave that field unfiltered. The output
lists available values so an empty match does not require guessing another alias.

```bash
node --input-type=module <<'JS'
const base = 'https://inferencex.semianalysis.com';
const scope = { model: 'dsv4', task: 'gsm8k', sample_limit: 5 };
const requests = [];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
async function read(path) {
  const query_url = new URL(path, base).href;
  const response = await fetch(query_url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${query_url}`);
  const data = await response.json();
  requests.push({ query_url, retrieved_at: new Date().toISOString() });
  return data;
}
const schema = await read('/api/openapi.json');
const operation = schema.paths?.['/api/v1/evaluations']?.get;
if (!operation || operation.parameters?.some((p) => p.required)) {
  throw new Error('Inspect the current evaluation operation before using this recipe');
}
const rows = await read('/api/v1/evaluations');
if (!Array.isArray(rows) || rows.some((row) =>
  !object(row) || !object(row.metrics) ||
  !(Number.isSafeInteger(row.id) || typeof row.id === 'string' && row.id.trim().length > 0) ||
  ['model', 'task', 'hardware', 'framework', 'precision', 'date'].some((key) => typeof row[key] !== 'string') ||
  !/^\d{4}-\d{2}-\d{2}$/u.test(row.date) || !Number.isFinite(Date.parse(row.date)) ||
  new Date(row.date).toISOString().slice(0, 10) !== row.date
)) throw new Error('Unexpected evaluation rows; do not interpret this as an empty selection');
const modelRows = rows.filter((row) => scope.model === null || row.model === scope.model);
const matching = modelRows.filter((row) => scope.task === null || row.task === scope.task);
const sample = matching.toSorted((a, b) => b.date.localeCompare(a.date)).slice(0, scope.sample_limit);
console.log(JSON.stringify({
  scope, requests,
  available_models: [...new Set(rows.map((row) => row.model))].toSorted(),
  available_tasks_for_model: [...new Set(modelRows.map((row) => row.task))].toSorted(),
  returned_rows: rows.length, matching_rows: matching.length, sample_rows: sample,
  outcome: matching.length ? 'sample' : 'no_matching_evaluations',
}, null, 2));
JS
```

`matching_rows` counts the full local selection before the sample limit. Rows are
ordered by their observation `date`; ties retain API order. "Latest attempt" in
the API description is not a promise that every configuration was evaluated today.
Keep `timestamp`, `date`, `run_url`, IDs, configuration, and additional returned
fields as supplied. String IDs remain strings, including very large numeric IDs.

Report actual metric keys alongside each task. `score`, `accuracy`, `score_se`, or
other keys are not interchangeable; a standard error is not another score. Keep
nulls, missing keys, and real zeros distinct. Do not turn every number into a
percentage or combine scores across tasks or configurations without a documented
meaning and comparable scope. These are existing observations; no new evaluations
or benchmark runs occur. For a full export, retain `matching` instead of claiming
the five-row sample contains every match.

## Dataset discovery and conversation inspection

Example request: "List available datasets, choose the first slug alphabetically,
show its first three conversation IDs in ID order, and retrieve the first one's
full structure. Include source metadata and say how much of the dataset this covers."

The registry provides dataset metadata, not conversations. The conversation index
is a page of counts; `total` describes matching index rows, while `items.length`
describes this page. Conversation detail supplies the nested `structure`, which
need not contain a transcript. This example makes one index request and one detail
request when an item exists. Set `requestedSlug` to an exact registry slug for a
specific dataset; `null` selects the first slug alphabetically as an explicit
example choice, not a representative sample.

```bash
node --input-type=module <<'JS'
const base = 'https://inferencex.semianalysis.com';
const requestedSlug = null;
const scope = { requested_slug: requestedSlug, limit: 3, offset: 0, sort: 'id' };
const requests = [];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
async function read(path) {
  const query_url = new URL(path, base).href;
  const response = await fetch(query_url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${query_url}`);
  const data = await response.json();
  requests.push({ query_url, retrieved_at: new Date().toISOString() });
  return data;
}
const schema = await read('/api/openapi.json');
const paths = ['/api/v1/datasets', '/api/v1/datasets/{slug}/conversations',
  '/api/v1/datasets/{slug}/conversations/{convId}'];
if (paths.some((path) => !schema.paths?.[path]?.get)) {
  throw new Error('Inspect the current dataset operations before using this recipe');
}
const parameters = schema.paths[paths[1]].get.parameters ?? [];
if (!parameters.find((p) => p.name === 'sort')?.schema?.enum?.includes(scope.sort) ||
    !(parameters.find((p) => p.name === 'limit')?.schema?.maximum >= scope.limit)) {
  throw new Error('Inspect the current conversation pagination parameters');
}
const datasets = await read('/api/v1/datasets');
if (!Array.isArray(datasets) || datasets.some((row) => !object(row) ||
  typeof row.id !== 'string' || typeof row.slug !== 'string' || !row.slug ||
  !Number.isSafeInteger(row.conversation_count) || row.conversation_count < 0
)) throw new Error('Unexpected dataset registry');
const dataset = requestedSlug === null
  ? datasets.toSorted((a, b) => a.slug.localeCompare(b.slug))[0]
  : datasets.find((row) => row.slug === requestedSlug);
let page = null;
let conversation = null;
let pagination = null;
let outcome = datasets.length ? 'dataset_not_listed' : 'empty_registry';
if (dataset) {
  const path = `/api/v1/datasets/${encodeURIComponent(dataset.slug)}/conversations`;
  const query = new URLSearchParams({ limit: String(scope.limit), offset: String(scope.offset), sort: scope.sort });
  page = await read(`${path}?${query}`);
  if (!object(page) || !Number.isSafeInteger(page.total) || page.total < 0 ||
      !Array.isArray(page.items) || page.items.length > scope.limit ||
      page.items.length > 0 && scope.offset + page.items.length > page.total ||
      page.items.some((item) => !object(item) || typeof item.conv_id !== 'string' || !item.conv_id) ||
      new Set(page.items.map((item) => item.conv_id)).size !== page.items.length ||
      page.items.length === 0 && page.total > scope.offset) {
    throw new Error('Unexpected conversation page; collection completeness is unknown');
  }
  const next = scope.offset + page.items.length;
  pagination = { returned_items: page.items.length, total_matching: page.total,
    has_more: next < page.total, next_offset: next < page.total ? next : null };
  outcome = page.items.length ? 'page_and_one_detail' : 'empty_page';
  if (page.items.length) {
    const id = page.items[0].conv_id;
    conversation = await read(`${path}/${encodeURIComponent(id)}`);
    if (!object(conversation) || conversation.conv_id !== id || !object(conversation.structure)) {
      throw new Error('Unexpected conversation detail; preserve the listed ID exactly');
    }
  }
}
console.log(JSON.stringify({ scope, requests, outcome, registry: datasets,
  selected_dataset: dataset ?? null, pagination, page, conversation }, null, 2));
JS
```

Preserve dataset `id`, `slug`, `variant`, `hf_url`, `license`, `ingested_at`, and
summary separately from conversation IDs and counts. Encode each raw slug and
`conv_id` exactly once as a path segment; do not decode a literal `%` in an ID.
Keep the returned nested structure and nulls intact. Dataset provenance does not
imply a benchmark producer or a conversation measurement timestamp.

Describe the result as one index page and at most one detail. The registry's
`conversation_count` and the index's `total` come from separate reads; report a
disagreement rather than silently replacing either count. A page with no items
means no items in that requested page; a missing dataset or HTTP 404 is a different
outcome. Full-collection requests require further index pages with the same slug,
sort, and optional `search`, advancing `offset` by the received item count. Retain
each page's URL and time, watch for duplicate IDs, changing totals, or no progress,
and report incomplete coverage if pagination becomes inconsistent. Fetch details
only for the conversations the user needs. A search result's `total` is scoped to
that conversation-ID search, not to the entire dataset.
