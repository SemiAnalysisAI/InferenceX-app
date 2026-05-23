# Embed Routes

Public iframe-embedding surface for InferenceX charts. Partner sites can embed any supported chart by iframing an `/embed/*` URL.

## URL parameter contract

Embed URLs use **the same `g_*` / `i_*` parameter keys as the main `/inference` site** — there is no separate embed-specific key contract to maintain. If a site key is renamed or a new key is added, the embed URL automatically benefits from the change. The only embed-specific key is `i_chart` (which chart variant to display — the main site renders both E2E and interactivity together, embeds show only one).

## Supported routes

| Route            | Chart                                    |
| ---------------- | ---------------------------------------- |
| `/embed/scatter` | Scatter (E2E throughput / interactivity) |

## `/embed/scatter`

### URL shape

```
/embed/scatter?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4
  &i_metric=y_tpPerGpu&i_active=b200_sglang,gb300_dynamo-sglang&i_chart=e2e
```

### Parameters

| Key        | Type   | Default            | Notes                                                                                                                                                                                                                                                                                                          |
| ---------- | ------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `g_model`  | string | `DeepSeek-R1-0528` | Display model name — same as `g_model` on the main site.                                                                                                                                                                                                                                                       |
| `i_seq`    | string | `8k/1k`            | Sequence string (e.g. `8k/1k`, `1k/1k`, `1k/8k`) — same as `i_seq` on the main site.                                                                                                                                                                                                                           |
| `i_prec`   | string | `fp4`              | Comma-separated precision keys (e.g. `fp4`, `fp8`, `bf16`) — same as `i_prec` on the main site.                                                                                                                                                                                                                |
| `i_metric` | string | `y_tpPerGpu`       | Y-axis metric key (e.g. `y_tpPerGpu`, `y_costh`) — same as `i_metric` on the main site.                                                                                                                                                                                                                        |
| `i_active` | string | `` (all visible)   | Comma-separated hwKey allow-list (e.g. `b200_sglang,gb300_dynamo-sglang`). When set, the embed legend and chart universe are restricted to exactly these GPUs. Viewers can toggle them on/off but cannot add GPUs outside this set. When absent, all GPUs for the selected model/sequence/precision are shown. |
| `i_chart`  | string | `e2e`              | Chart variant to render: `e2e` or `interactivity`. Embed-only key — the main site renders both charts together.                                                                                                                                                                                                |

All other `g_*` / `i_*` keys recognized by the main site (e.g. `i_scale`, `i_hc`, `i_nolabel`) are passed through as-is and respected by the embed — the provider stack is identical. Unknown keys are silently ignored.

### `i_active` — hwKey format

Each hwKey token encodes hardware and inference framework together, separated by an underscore (e.g. `b200_sglang`, `gb300_dynamo-sglang`). To find valid hwKey values, visit `/inference` on the live site, open the legend, and note the identifiers shown — or use **Export → Copy embed** to get a ready-made URL with your current filters already encoded.

### `i_metric` — accepted values

Full `y_*` internal keys (e.g. `y_tpPerGpu`, `y_costh`). The authoritative list is in `packages/app/src/lib/chart-utils.ts` (`Y_AXIS_METRICS`).

## Embed mode behavior

- Site header, footer, background decorations, and navigation are hidden on all `/embed/*` routes.
- A "SemiAnalysis InferenceX →" link appears in the chart caption (`Source: …`), deep-linking to the equivalent canonical dashboard URL. The canonical URL is built from the same embed params (minus `i_chart`), so opening it reproduces the same chart state on the main site.
- `robots: noindex, nofollow` is set on all embed routes — they won't appear in search results.
- An `embed_view` PostHog event is fired once on mount, capturing `referrer`, `embed_host`, `embed_chart`, `model` (`g_model`), `sequence` (`i_seq`), `precisions` (`i_prec`), `gpus` (from `i_active`), and `y_metric` (`i_metric`). This makes external embed traffic attributable in analytics.

## CSP / framing

Embed routes (`/embed/*`) set `Content-Security-Policy: frame-ancestors *`, allowing iframing from any origin.

All other routes set `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`, blocking third-party framing.

## Recommended iframe snippet

```html
<iframe
  src="https://inferencex.semianalysis.com/embed/scatter?g_model=DeepSeek-R1-0528&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_tpPerGpu"
  width="800"
  height="500"
  loading="lazy"
  referrerpolicy="origin"
  allow="clipboard-write"
  style="border:none;border-radius:8px"
>
</iframe>
```

**Important — `referrerpolicy="origin"`:** many partner sites ship `<meta name="referrer" content="no-referrer">`. Without an explicit `referrerpolicy="origin"` on the `<iframe>`, the embed loses all referrer information, which breaks traffic attribution in the `embed_view` event. Use `origin` (not `strict-origin-when-cross-origin`) so the referrer is always sent.

`allow="clipboard-write"` is optional but needed if you want clipboard actions inside the embedded chart to work from the parent page.

You can copy the same ready-made iframe snippet from the dashboard: open the chart's **Export** menu and choose **Copy embed**.

For very short iframes (around 300–400 px tall), prefer `width` ≥ 1024 if you want the legend as a side column; below that width the legend uses a collapsible row at the bottom.
