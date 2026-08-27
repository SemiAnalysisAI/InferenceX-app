#!/usr/bin/env python3
"""Fleet margin curves: monthly lifecycle economics per hardware config for a facility size.

Usage:
    python3 fleet_margins.py --model DeepSeek-V4-Pro --mw 100 --metric margin

Requires: requests, matplotlib.
"""

import argparse
import sys

import matplotlib
import matplotlib.ticker

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import requests

DEFAULT_BASE = "https://inferencex.semianalysis.com"

FLEET_METRICS = ["margin", "marginPerMw", "revenue", "revenuePerMw", "cumulativeRevenue"]

GPU_COLORS = {
    "h100": "#8bc34a", "h200": "#4caf50", "b200": "#009688", "b300": "#00bcd4",
    "gb200": "#3f51b5", "gb300": "#673ab7", "vr200": "#2196f3", "rtx6000pro": "#607d8b",
    "mi300x": "#ff9800", "mi325x": "#f44336", "mi355x": "#e91e63", "jalapeno": "#795548",
}


def color_for(hw_key: str) -> str:
    return GPU_COLORS.get(hw_key.split("_")[0].lower(), "#9e9e9e")


def get_view(base: str, name: str, params: dict) -> dict:
    resp = requests.get(f"{base}/api/v1/views/{name}", params=params, timeout=60)
    if resp.status_code == 404:
        sys.exit(f"error: {base}/api/v1/views/{name} returned 404 — "
                 "the views API (beta) may not be deployed yet at this base URL")
    if resp.status_code == 400:
        err = resp.json()
        sys.exit(f"error: 400 {err.get('error')} allowed={err.get('allowed')}")
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base-url", default=DEFAULT_BASE)
    ap.add_argument("--model", default="DeepSeek-V4-Pro")
    ap.add_argument("--sequence", default="8k/1k")
    ap.add_argument("--mw", type=float, required=True, help="facility megawatts (required, > 0)")
    ap.add_argument("--metric", default="margin", choices=FLEET_METRICS)
    ap.add_argument("--price", type=float, default=None, help="input-token price $/M (optional)")
    ap.add_argument("--oprice", type=float, default=None, help="output-token price $/M (optional)")
    ap.add_argument("--ramp", type=float, default=3, help="ramp months (API default 3)")
    ap.add_argument("--mtbi", type=float, default=24, help="mean time between interrupts, days (default 24)")
    ap.add_argument("--recovery", type=float, default=12, help="recovery hours (default 12)")
    ap.add_argument("--horizon", type=float, default=None, help="horizon months (optional)")
    ap.add_argument("--out", default="fleet_margins.png")
    args = ap.parse_args()

    params = {
        "model": args.model,
        "sequence": args.sequence,
        "mw": args.mw,
        "metric": args.metric,
        "ramp": args.ramp,
        "mtbi": args.mtbi,
        "recovery": args.recovery,
    }
    for k in ("price", "oprice", "horizon"):
        v = getattr(args, k)
        if v is not None:
            params[k] = v
    view = get_view(args.base_url, "fleet", params)

    fig, ax = plt.subplots(figsize=(10, 6))
    for series in view["series"]:
        pts = series["points"]  # [{month, value, revenue, margin, ...}]
        if not pts:
            continue
        c = color_for(series["hwKey"])
        be = series.get("breakEvenPricePerMTok")
        label = series["label"] + (f" (BE ${be:,.2f}/M)" if isinstance(be, (int, float)) else "")
        ax.plot([p["month"] for p in pts], [p["value"] for p in pts],
                color=c, lw=1.8, marker="o", ms=3, label=label)

    ax.axhline(0, color="#9e9e9e", lw=0.8)
    ax.set_xlabel("Month")
    metric_labels = {
        "margin": "Cumulative margin ($)",
        "marginPerMw": "Cumulative margin per MW ($/MW)",
        "revenue": "Monthly revenue ($)",
        "revenuePerMw": "Monthly revenue per MW ($/MW)",
        "cumulativeRevenue": "Cumulative revenue ($)",
    }
    ax.set_ylabel(metric_labels.get(args.metric, args.metric))
    ax.ticklabel_format(axis="y", style="plain")
    ax.yaxis.set_major_formatter(
        matplotlib.ticker.FuncFormatter(lambda v, _: f"${v / 1e6:,.1f}M" if abs(v) >= 1e6 else f"${v:,.0f}")
    )
    p = view["params"]
    # Key assumptions only — the full set is in the JSON response.
    a = view.get("assumptions", {})
    keys = ("target", "inputPricePerMTok", "outputPricePerMTok", "rampMonths", "availability")
    shown = ", ".join(f"{k}={round(a[k], 4) if isinstance(a[k], float) else a[k]}" for k in keys if k in a)
    ax.set_title(
        f"{p.get('model', args.model)} — fleet {args.metric} @ {args.mw:g} MW"
        + (f"\n{shown}" if shown else ""),
        fontsize=11,
    )
    ax.grid(True, alpha=0.25)
    ax.legend(fontsize=7)
    generated = view.get("generatedAt")
    footer = f"InferenceX API · data through {generated}" if generated else "InferenceX API"
    fig.text(0.99, 0.01, footer,
             ha="right", fontsize=6, color="#757575")
    fig.savefig(args.out, dpi=160, bbox_inches="tight")
    print(f"wrote {args.out} ({len(view['series'])} hardware series)")


if __name__ == "__main__":
    main()
