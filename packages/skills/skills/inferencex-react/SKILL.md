---
name: inferencex-react
description: Build React dashboards on top of the InferenceX public REST API — typed fetch/SWR hooks, Recharts scatter charts with Pareto frontiers, historical trend line charts, and rankings tables. Use when asked to build a React (or Next.js) UI over InferenceX benchmark data.
---

# InferenceX + React

Data source: `https://inferencex.semianalysis.com/api/v1/views/*`. Read the `inferencex-api`
skill (and its `reference/endpoints.md`) for endpoints, params, and defaults. The views API is
public GET, no auth, CORS-friendly CDN-cached JSON — fetch directly from the browser.

Files in `examples/` (each is complete and single-file):

| File                   | What it shows                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `types.ts`             | TypeScript response types matching the views API envelopes                               |
| `hooks.ts`             | `useInferenceView` / `useHistoricalView` / `useViewOptions` — SWR + plain-fetch variants |
| `InferenceScatter.tsx` | Recharts scatter (cost vs interactivity) with Pareto frontier line, log axes             |
| `HistoricalTrends.tsx` | Recharts line chart of metric-over-time per hardware                                     |
| `RankingsTable.tsx`    | Sortable cheapest/fastest GPU rankings table (no chart lib)                              |

## Core patterns

### 1. One fetch helper, envelope-aware

```ts
const BASE = 'https://inferencex.semianalysis.com';

export async function fetchView<T>(
  name: string,
  params: Record<string, string | number | boolean>,
): Promise<T> {
  const url = new URL(`${BASE}/api/v1/views/${name}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string; allowed?: string[] });
    throw new Error(
      body.error
        ? `${body.error}${body.allowed ? ` (allowed: ${body.allowed.join(', ')})` : ''}`
        : `HTTP ${res.status}`,
    );
  }
  return res.json() as Promise<T>;
}
```

### 2. Discovery-driven controls

Populate selects from `/api/v1/views/options` (`models`, `metrics`, `hardware`, `sequences`,
`percentiles`, ...) instead of hard-coding enum values. `defaults` in the options payload gives
you initial control state.

### 3. SWR keys = canonical param tuples

The API canonicalizes params for caching; mirror that client-side so SWR dedupes:

```ts
useSWR(['views/inference', model, sequence, metric], ([, m, s, mt]) =>
  fetchView<InferenceViewResponse>('inference', { model: m, sequence: s, metric: mt }),
);
```

Views responses are CDN-cached (`s-maxage=86400`) — safe to set a generous
`dedupingInterval` and `revalidateOnFocus: false`.

### 4. Recharts frontier overlay

The inference view returns every point with a `frontier` boolean. Render one `<Scatter>` per
series (colored per GPU base key), then a final `<Line>` of frontier points sorted by `x`
(see `InferenceScatter.tsx`). Use `scale="log"` on both axes for cost-vs-interactivity charts,
and take axis labels from `view.metric.label` / `view.xAxis.label`.

### 5. Consistent hardware colors

```ts
export const GPU_COLORS: Record<string, string> = {
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
export const colorFor = (hwKey: string) =>
  GPU_COLORS[hwKey.split('_')[0].toLowerCase()] ?? '#9e9e9e';
```

Use the same map in every chart so hardware is identifiable across the whole dashboard
(same palette as the `inferencex-matplotlib` and `inferencex-html` skills).

### 6. Beta fallback

`/api/v1/views/*` is beta: on 404, degrade gracefully (show a notice, or compute from the
stable raw-rows endpoints `/api/v1/benchmarks` + `/api/v1/tco-feed`).

## Dependencies

`react` (18+), `recharts` for charts, optionally `swr`. `hooks.ts` includes a zero-dependency
`useView` fallback (plain `fetch` + `useEffect`) if you don't want SWR.
