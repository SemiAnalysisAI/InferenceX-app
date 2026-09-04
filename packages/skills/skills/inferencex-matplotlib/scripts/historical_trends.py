#!/usr/bin/env python3
"""Historical trend lines: metric value at a fixed target interactivity, per hardware config.

Usage:
    python3 historical_trends.py --model DeepSeek-V4-Pro --metric costh --target 35

Requires: requests, matplotlib.
"""

import argparse
import sys
from datetime import datetime

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
import matplotlib.dates as mdates
import requests

DEFAULT_BASE = "https://inferencex.semianalysis.com"

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
    ap.add_argument("--metric", default="costh")
    ap.add_argument("--target", type=float, default=35.0,
                    help="target interactivity (tok/s/user), API default 35")
    ap.add_argument("--start", default=None, help="YYYY-MM-DD")
    ap.add_argument("--end", default=None, help="YYYY-MM-DD")
    ap.add_argument("--log-y", action="store_true")
    ap.add_argument("--out", default="historical_trends.png")
    args = ap.parse_args()

    params = {
        "model": args.model,
        "sequence": args.sequence,
        "metric": args.metric,
        "target": args.target,
    }
    if args.start:
        params["start"] = args.start
    if args.end:
        params["end"] = args.end
    view = get_view(args.base_url, "historical", params)

    metric = view["metric"]
    fig, ax = plt.subplots(figsize=(10, 6))

    seen_gpus: list[str] = []
    for series in view["series"]:
        pts = series["points"]  # [{date, value, clamped}]
        if not pts:
            continue
        dates = [datetime.strptime(p["date"], "%Y-%m-%d") for p in pts]
        values = [p["value"] for p in pts]
        c = color_for(series["hwKey"])
        gpu = series["hwKey"].split("_")[0]
        if gpu not in seen_gpus:
            seen_gpus.append(gpu)
        ax.plot(dates, values, color=c, lw=1.6, marker="o", ms=3)
        # Mark clamped points (target outside the measured frontier that day).
        clamped = [(d, v) for d, v, p in zip(dates, values, pts) if p.get("clamped")]
        if clamped:
            ax.scatter([d for d, _ in clamped], [v for _, v in clamped],
                       marker="x", color=c, s=30, zorder=3)

    if args.log_y:
        ax.set_yscale("log")
    unit = metric.get("unit") or ""
    ax.set_ylabel(f"{metric.get('label') or metric['key']}" + (f" ({unit})" if unit else ""))
    ax.set_xlabel("Snapshot date")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m-%d"))
    fig.autofmt_xdate()
    p = view["params"]
    ax.set_title(
        f"{p.get('model', args.model)} — {metric.get('label') or metric['key']} over time "
        f"@ {view.get('target', args.target)} tok/s/user (x = clamped)"
    )
    ax.grid(True, alpha=0.25)
    handles = [
        Line2D([], [], color=color_for(gpu), lw=1.6, marker="o", ms=4, label=gpu.upper())
        for gpu in seen_gpus
    ]
    ax.legend(handles=handles, fontsize=8)
    generated = view.get("generatedAt")
    footer = f"InferenceX API · data through {generated}" if generated else "InferenceX API"
    fig.text(0.99, 0.01, footer,
             ha="right", fontsize=6, color="#757575")
    fig.savefig(args.out, dpi=160, bbox_inches="tight")
    print(f"wrote {args.out} ({len(view['series'])} series)")


if __name__ == "__main__":
    main()
