---
name: inferencex-matplotlib
description: Plot InferenceX benchmark data with Python and matplotlib — Pareto frontier scatters (cost vs interactivity), historical trend lines, calculator operating-point bars, fleet margin curves, and eval score bars, all reading from the live InferenceX REST API. Use when asked to chart or visualize InferenceX data in Python.
---

# InferenceX + matplotlib recipes

Dependencies: `requests` + `matplotlib` only (pandas optional, never required).
Data source: `https://inferencex.semianalysis.com/api/v1/views/*` — see the `inferencex-api`
skill for the full endpoint/param reference. Always check `/api/v1/views/options` for valid
models/metrics/hardware keys before hard-coding values.

The views API is beta: scripts here exit with a clear message on 404 (endpoint not yet
deployed) and print `{error, allowed}` details on 400.

## Runnable scripts (in `scripts/`)

| Script                 | Chart                                                                | Endpoint                   |
| ---------------------- | -------------------------------------------------------------------- | -------------------------- |
| `pareto_frontier.py`   | Cost vs interactivity scatter by hardware, log axes, frontier line   | `/api/v1/views/inference`  |
| `historical_trends.py` | Metric-over-time lines per hardware at target interactivity          | `/api/v1/views/historical` |
| `calculator_bars.py`   | Operating-point bar chart (throughput/cost per hardware at a target) | `/api/v1/views/calculator` |
| `fleet_margins.py`     | Monthly fleet margin/revenue curves per hardware                     | `/api/v1/views/fleet`      |
| `eval_scores.py`       | Eval score bars per hardware config with stderr error bars           | `/api/v1/views/evaluation` |

Each script is self-contained:

```bash
python3 scripts/pareto_frontier.py --model DeepSeek-V4-Pro --metric costh --out pareto.png
python3 scripts/historical_trends.py --model DeepSeek-V4-Pro --metric costh --target 35
python3 scripts/calculator_bars.py --model DeepSeek-V4-Pro --target 35 --cost-provider costh
python3 scripts/fleet_margins.py --model DeepSeek-V4-Pro --mw 100 --metric margin
python3 scripts/eval_scores.py --model DeepSeek-V4-Pro
```

## Consistent hardware color mapping

Use one color per GPU **base key** (first `_`-separated segment of `hwKey`), NVIDIA in
green/blue tones, AMD in warm tones, so every chart in a report is visually consistent:

```python
GPU_COLORS = {
    "h100": "#8bc34a", "h200": "#4caf50", "b200": "#009688", "b300": "#00bcd4",
    "gb200": "#3f51b5", "gb300": "#673ab7", "vr200": "#2196f3", "rtx6000pro": "#607d8b",
    "mi300x": "#ff9800", "mi325x": "#f44336", "mi355x": "#e91e63", "jalapeno": "#795548",
}

def color_for(hw_key: str) -> str:
    return GPU_COLORS.get(hw_key.split("_")[0].lower(), "#9e9e9e")
```

Vary marker shape (or alpha) by framework within a GPU when one GPU has multiple series.

## Pareto frontier pattern

`/api/v1/views/inference` returns ALL points by default; each point carries `frontier: true/false`
(pass `optimal=true` to receive frontier-only). To draw the frontier line, collect
`frontier` points across all series and sort by x:

```python
frontier = sorted(
    (p for s in view["series"] for p in s["points"] if p["frontier"]),
    key=lambda p: p["x"],
)
ax.plot([p["x"] for p in frontier], [p["y"] for p in frontier],
        color="#212121", lw=1.2, ls="--", zorder=1, label="Pareto frontier")
```

- Cost metrics (`costh`/`costn`/`costr`, polarity lower-better) → log y-axis is usually right:
  `ax.set_yscale("log")`; interactivity spans a wide range → `ax.set_xscale("log")` optional.
- Read axis labels from the response: `view["metric"]["label"]`, `view["metric"]["unit"]`,
  `view["xAxis"]["label"]` — never hard-code units.
- Title should include the resolved params for reproducibility: model, sequence, precision,
  percentile from `view["params"]`.

## Error handling pattern (all scripts)

```python
resp = requests.get(url, params=params, timeout=60)
if resp.status_code == 404:
    raise SystemExit("views API not deployed yet at this base URL; see inferencex-api skill")
if resp.status_code == 400:
    err = resp.json()
    raise SystemExit(f"400 {err.get('error')} allowed={err.get('allowed')}")
resp.raise_for_status()
```

## Tips

- `generatedAt` + `params` from the envelope make good figure footnotes (data provenance).
- For deep-dive raw analysis (per-concurrency points, custom math), fall back to the stable
  `/api/v1/benchmarks` / `/api/v1/benchmarks/history` raw rows — see `inferencex-api`.
- Save with `fig.savefig(out, dpi=160, bbox_inches="tight")`; use
  `matplotlib.use("Agg")` before importing pyplot in headless environments.
