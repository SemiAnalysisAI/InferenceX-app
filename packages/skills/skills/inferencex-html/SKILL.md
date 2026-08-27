---
name: inferencex-html
description: Build zero-build, single-file HTML+JS visualizations of InferenceX benchmark data using Chart.js from CDN and plain fetch — no bundler, no npm, just open the file in a browser. Use when asked for a quick standalone/static/shareable InferenceX chart or dashboard page.
---

# InferenceX zero-build HTML visualizations

One `.html` file = one complete visualization. Chart.js 4 from CDN
(`https://cdn.jsdelivr.net/npm/chart.js@4`), data from the public InferenceX API
(`https://inferencex.semianalysis.com/api/v1/views/*` — GET, no auth, CORS-friendly).
See the `inferencex-api` skill for the full endpoint/param reference.

Complete standalone examples in `examples/` (open directly in a browser, or serve statically):

| File                     | Chart                                                         | Endpoint                   |
| ------------------------ | ------------------------------------------------------------- | -------------------------- |
| `inference-scatter.html` | Cost vs interactivity scatter, log axes, Pareto frontier line | `/api/v1/views/inference`  |
| `historical-trends.html` | Metric-over-time lines per hardware at target interactivity   | `/api/v1/views/historical` |
| `rankings-table.html`    | Sortable cheapest/fastest GPU rankings table (no chart lib)   | `/api/v1/views/rankings`   |

## Rules for generated pages

1. **Single file, no build step**: inline `<script>`, Chart.js via
   `<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>`. No date adapters needed —
   use `YYYY-MM-DD` strings on a category axis for trends.
2. **Fetch pattern with error surface** (the views API is beta — handle 404/400 visibly):

```js
async function getView(name, params) {
  const url = new URL(`https://inferencex.semianalysis.com/api/v1/views/${name}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      res.status === 404
        ? 'views API (beta) not available at this base URL'
        : `${res.status}: ${body.error || 'request failed'}${body.allowed ? ` — allowed: ${body.allowed.join(', ')}` : ''}`,
    );
  }
  return res.json();
}
```

3. **Consistent hardware colors** (same palette as the matplotlib/React skills), keyed by GPU
   base key = first `_`-segment of `hwKey`:

```js
const GPU_COLORS = {
  h100: '#8bc34a',
  h200: '#4caf50',
  b200: '#009688',
  b300: '#00bcd4',
  gb200: '#3f51b5',
  gb300: '#673ab7',
  vr200: '#2196f3',
  rtx6000pro: '#607d8b',
  mi300x: '#ff9800',
  mi325x: '#f44336',
  mi355x: '#e91e63',
  jalapeno: '#795548',
};
const colorFor = (hwKey) => GPU_COLORS[hwKey.split('_')[0].toLowerCase()] || '#9e9e9e';
```

4. **Frontier line in Chart.js**: add one extra dataset of type `'line'` containing the points
   with `frontier: true` sorted by `x`, with `showLine: true, pointRadius: 0, borderDash: [6, 4]`.
   Scatter datasets: one per `series[]` entry, `parsing: false`, data mapped to `{x, y}`.
5. **Log axes**: `scales: { x: { type: 'logarithmic' }, y: { type: 'logarithmic' } }` for
   cost-vs-interactivity charts. Take titles from `view.metric.label` / `view.metric.unit` /
   `view.xAxis.label` — never hard-code units.
6. **Provenance footer**: print `view.generatedAt` and the resolved `view.params` under the
   chart so the page is self-describing.
7. Populate any `<select>` controls from `/api/v1/views/options` rather than hard-coding
   model/metric lists.
