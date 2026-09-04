---
name: inferencex-api
description: Use the InferenceX public REST API (https://inferencex.semianalysis.com) to read LLM inference benchmark data — chart-ready views (/api/v1/views/*), raw benchmark rows, TCO feeds, evaluations, reliability, and GPU specs. Use when asked to query, download, or analyze InferenceX data programmatically.
---

# InferenceX Public REST API

Base URL: `https://inferencex.semianalysis.com`

All public endpoints are **GET, no auth, CDN-cached**. Two API families:

1. **Views API** — `/api/v1/views/*` (stability: **beta**): chart-ready, server-computed data —
   the SAME numbers the dashboard renders (Pareto frontiers, derived cost metrics, interpolated
   operating points, fleet economics). Prefer these for analysis and plotting.
2. **Raw rows API** — `/api/v1/*` (stable): raw benchmark/evaluation/reliability rows, TCO feed,
   availability, workflow provenance.

An exhaustive per-endpoint parameter table lives in [reference/endpoints.md](reference/endpoints.md).
Read it before constructing any non-trivial request.

> The views endpoints are beta and may not yet be deployed in every environment. If a
> `/api/v1/views/*` request returns 404, fall back to the raw-rows endpoints and compute
> client-side, or report that the views API is not yet live.

## Discovery flow — ALWAYS start here

Call the options endpoint first to learn every valid parameter value (models, sequences,
precisions, hardware keys, frameworks, metrics, defaults):

```bash
curl -s 'https://inferencex.semianalysis.com/api/v1/views/options'
```

Response (static, no DB): `{ models, sequences, precisions, hardware, frameworks, specMethods,
percentiles, xAxisModes, scaleModes, metrics, quickFilters, reliabilityRanges, overview,
calculator, fleet, defaults }`. Use `models[].name` for `model=`, `hardware[].key` for `gpus=`,
`metrics[].key` for `metric=`.

For raw-rows endpoints, `/api/v1/availability` (no params) lists which
model × sequence × precision × hardware × framework × date combinations actually have data.

## Response envelope (views API)

Every `/api/v1/views/*` JSON response:

```json
{
  "view": "<endpoint name>",
  "apiVersion": "v1",
  "generatedAt": "<ISO date — latest data date where possible>",
  "params": { "...resolved effective values, including applied defaults..." },
  "...payload (series / rows / entries / hardware / chips / table ...)"
}
```

`params` always echoes the resolved effective parameters, so any response is self-describing and
reproducible — re-issue the same values to reproduce a result exactly.

## Errors

- Invalid enum value → HTTP 400 with `{ "error": "<message>", "allowed": ["..."] }`
  (validation failures for enum-typed params include the `allowed` list; the failing parameter is
  identified in the error message).
- Raw-rows endpoints use stable error strings, e.g. `{ "error": "Unknown model" }` (400),
  `{ "error": "Invalid date format (YYYY-MM-DD required)" }` (400),
  `{ "error": "Internal server error" }` (500).

Always check `response.ok` / status code before parsing the payload.

## CSV output

Endpoints that support `format=csv` (see reference table) return the same selected view as a flat
`text/csv` table (RFC 4180 escaping), one row per point/row with series columns flattened —
mirrors the `tco-feed` CSV pattern. Default is `format=json`.

## Pagination & caching

- **No pagination** on views or core raw-rows endpoints — responses are complete payloads.
  Only the datasets sub-API (`/api/v1/datasets/{slug}/conversations`) takes `limit`/`offset`.
- Responses are CDN-cached (typically `Cache-Control: public, max-age=0, s-maxage=86400`).
  Parameters are canonicalized server-side (lists sorted, values lowercased) so logically
  identical requests hit one cache key — you do not need to order list params yourself, but
  doing so is harmless.
- Be polite: cache responses locally when iterating on a visualization.

## Key parameter conventions

- `model` — **display name** (e.g. `DeepSeek-V4-Pro`, `Kimi-K3`, `GLM-5.2`,
  `Qwen-3.5-397B-A17B`, `MiniMax-M3`, `DeepSeek-R1-0528`), case-insensitive; compare-slug
  aliases (e.g. `deepseek-v4`, `kimi-k3`) also accepted on views endpoints.
- `sequence` — `8k/1k`, `1k/1k`, `1k/8k`, `agentic-traces`; views endpoints also accept the
  URL-safe forms `8k-1k`, `1k-1k`, `1k-8k`, and `agentic`.
- `precisions` — comma list of `fp4,fp8,bf16,int4` (share-param form also allows `fp4fp8`).
  Omit for automatic densest-precision resolution.
- `metric` — metric registry key, e.g. `tokensPerDollarH` (default), `costh`, `costn`, `costr`,
  `tpPerGpu`, `tpPerMw`, `jTotal`; the `y_`-prefixed form (`y_costh`) is also accepted.
- `gpus` — comma list of hardware series keys `<gpu>_<framework>[_<spec>]` (e.g.
  `b200_trt`, `mi355x_sglang`) or bare GPU base keys (`b200`, `mi355x`, `gb200`, `h100`, ...).
- `percentile` — `p75` | `p90` (default `p90`).
- Dates — `YYYY-MM-DD`.
- Booleans — `true`/`false` (URL-state legacy uses `1`/`0`).

## Quick examples

### curl

```bash
# Chart-ready inference scatter: cost $/M tok (hyperscaler) vs interactivity, frontier flagged
curl -s 'https://inferencex.semianalysis.com/api/v1/views/inference?model=DeepSeek-V4-Pro&sequence=8k/1k&metric=costh' | python3 -m json.tool | head -50

# Frontier-only points, as CSV
curl -s 'https://inferencex.semianalysis.com/api/v1/views/inference?model=DeepSeek-V4-Pro&metric=costh&optimal=true&format=csv'

# Historical trend at 35 tok/s/user
curl -s 'https://inferencex.semianalysis.com/api/v1/views/historical?model=DeepSeek-V4-Pro&metric=costh&target=35'

# Cheapest-GPU rankings
curl -s 'https://inferencex.semianalysis.com/api/v1/views/rankings?kind=cheapest-gpu'

# Raw benchmark rows (stable API)
curl -s 'https://inferencex.semianalysis.com/api/v1/benchmarks?model=DeepSeek-R1-0528'

# TCO feed points as CSV (stable API)
curl -s 'https://inferencex.semianalysis.com/api/v1/tco-feed?model=dsv4&workloads=8192x1024&tiers=30,50,75,100&view=points&format=csv'
```

### Python (requests)

```python
import requests

BASE = "https://inferencex.semianalysis.com"

opts = requests.get(f"{BASE}/api/v1/views/options", timeout=30)
opts.raise_for_status()
models = [m["name"] for m in opts.json()["models"]]

r = requests.get(
    f"{BASE}/api/v1/views/inference",
    params={"model": "DeepSeek-V4-Pro", "sequence": "8k/1k", "metric": "costh"},
    timeout=60,
)
if r.status_code == 400:
    err = r.json()  # {"error": ..., "allowed": [...]}
    raise SystemExit(f"Bad request: {err['error']} (allowed: {err.get('allowed')})")
r.raise_for_status()
view = r.json()
for series in view["series"]:
    frontier_pts = [p for p in series["points"] if p["frontier"]]
    print(series["label"], len(series["points"]), "points,", len(frontier_pts), "on frontier")
```

### JavaScript (fetch)

```js
const BASE = 'https://inferencex.semianalysis.com';

async function getView(name, params) {
  const url = new URL(`${BASE}/api/v1/views/${name}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `${res.status}: ${body.error ?? 'request failed'}${body.allowed ? ` (allowed: ${body.allowed.join(', ')})` : ''}`,
    );
  }
  return res.json();
}

const view = await getView('historical', { model: 'DeepSeek-V4-Pro', metric: 'costh', target: 35 });
console.log(view.params, view.series.length);
```

## Endpoint index

| Endpoint                         | Purpose                                                     | CSV |
| -------------------------------- | ----------------------------------------------------------- | --- |
| `GET /api/v1/views/options`      | Discovery of every option domain (call first)               | —   |
| `GET /api/v1/views/inference`    | Chart-ready scatter series with frontier/best flags         | yes |
| `GET /api/v1/views/historical`   | Interpolated trend lines at a target interactivity          | yes |
| `GET /api/v1/views/calculator`   | Interpolated operating point per hardware config            | yes |
| `GET /api/v1/views/fleet`        | Fleet lifecycle economics (margin/revenue per month)        | yes |
| `GET /api/v1/views/reliability`  | Aggregated success rates per hardware over a range          | yes |
| `GET /api/v1/views/evaluation`   | Aggregated eval scores per hardware for a benchmark         | yes |
| `GET /api/v1/views/gpu-specs`    | Static GPU spec sheet (+ optional metric ranking)           | yes |
| `GET /api/v1/views/overview`     | Cost matrix (model × scenario × hardware at tiers)          | yes |
| `GET /api/v1/views/rankings`     | Fastest/cheapest GPU ranking tables                         | yes |
| `GET /api/v1/views/compare`      | Two-GPU comparison table at interactivity tiers             | yes |
| `GET /api/v1/availability`       | Raw availability rows (no params)                           | —   |
| `GET /api/v1/benchmarks`         | Raw benchmark rows for a model                              | —   |
| `GET /api/v1/benchmarks/history` | Full dated history for model + workload                     | —   |
| `GET /api/v1/evaluations`        | Raw evaluation score rows (no params)                       | —   |
| `GET /api/v1/reliability`        | Raw daily success/total counts (no params)                  | —   |
| `GET /api/v1/tco-feed`           | Frontier throughput points / weighted scores for TCO models | yes |
| `GET /api/v1/workflow-info`      | Run provenance for a date                                   | —   |

Full parameter tables, defaults, enums, and response shapes: [reference/endpoints.md](reference/endpoints.md).

For plotting recipes, see the sibling skills: `inferencex-matplotlib` (Python),
`inferencex-react` (React + Recharts), `inferencex-html` (zero-build Chart.js).
