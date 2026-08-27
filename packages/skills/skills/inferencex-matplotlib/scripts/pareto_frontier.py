#!/usr/bin/env python3
"""Pareto frontier scatter: cost vs interactivity by hardware, from the InferenceX views API.

Usage:
    python3 pareto_frontier.py --model DeepSeek-V4-Pro --metric costh --out pareto.png

Requires: requests, matplotlib.
"""

import argparse
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
import requests

DEFAULT_BASE = "https://inferencex.semianalysis.com"

# Consistent hardware color mapping (keyed by GPU base key = first hwKey segment).
GPU_COLORS = {
    "h100": "#8bc34a", "h200": "#4caf50", "b200": "#009688", "b300": "#00bcd4",
    "gb200": "#3f51b5", "gb300": "#673ab7", "vr200": "#2196f3", "rtx6000pro": "#607d8b",
    "mi300x": "#ff9800", "mi325x": "#f44336", "mi355x": "#e91e63", "jalapeno": "#795548",
}


def color_for(hw_key: str) -> str:
    return GPU_COLORS.get(hw_key.split("_")[0].lower(), "#9e9e9e")


def global_frontier(points: list[dict], direction: str) -> list[dict]:
    """Global Pareto staircase across every series.

    The API's per-point `frontier` flag is scoped per hardware config + snapshot
    date (each config's own roofline, like the dashboard scatter). For a single
    chart-wide frontier, recompute dominance globally using the metric's
    configured good corner (e.g. `upper_left` = high y and low x are better).
    """
    y_high_good = direction.startswith("upper")
    x_low_good = direction.endswith("left")
    # Sort so the best x comes first; scan keeping the running best y.
    ordered = sorted(points, key=lambda p: p["x"], reverse=not x_low_good)
    frontier: list[dict] = []
    best_y: float | None = None
    for p in ordered:
        better = best_y is None or (p["y"] > best_y if y_high_good else p["y"] < best_y)
        if better:
            frontier.append(p)
            best_y = p["y"]
    return sorted(frontier, key=lambda p: p["x"])


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
    ap.add_argument("--metric", default="costh", help="e.g. costh, costn, costr, tokensPerDollarN")
    ap.add_argument("--percentile", default="p90", choices=["p75", "p90"])
    ap.add_argument("--out", default="pareto_frontier.png")
    args = ap.parse_args()

    view = get_view(args.base_url, "inference", {
        "model": args.model,
        "sequence": args.sequence,
        "metric": args.metric,
        "xmode": "interactivity",
        "percentile": args.percentile,
        # optimal defaults to false: all points returned, each flagged with `frontier`
    })

    metric = view["metric"]  # {key, label, unit, polarity, direction}
    x_axis = view["xAxis"]   # {mode, label}
    fig, ax = plt.subplots(figsize=(10, 6.5))

    seen_gpus: list[str] = []
    for series in view["series"]:
        pts = series["points"]
        if not pts:
            continue
        gpu = series["hwKey"].split("_")[0]
        if gpu not in seen_gpus:
            seen_gpus.append(gpu)
        ax.scatter(
            [p["x"] for p in pts],
            [p["y"] for p in pts],
            s=28,
            color=color_for(series["hwKey"]),
            alpha=0.75,
            edgecolors="white",
            linewidths=0.4,
            zorder=2,
        )

    # Chart-wide Pareto staircase, computed client-side (see global_frontier).
    all_points = [p for s in view["series"] for p in s["points"]]
    direction = (view.get("frontier") or {}).get("direction") or metric.get("direction") or "upper_left"
    frontier = global_frontier(all_points, direction)
    if frontier:
        ax.plot(
            [p["x"] for p in frontier],
            [p["y"] for p in frontier],
            color="#212121", lw=1.3, ls="--", drawstyle="steps-post", zorder=3,
        )

    # Legend: one entry per GPU (series share GPU colors), plus the frontier line.
    handles = [
        Line2D([], [], marker="o", ls="", color=color_for(gpu), markeredgecolor="white",
               markersize=7, label=gpu.upper())
        for gpu in seen_gpus
    ]
    if frontier:
        handles.append(Line2D([], [], color="#212121", lw=1.3, ls="--", label="Global Pareto frontier"))

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel(x_axis.get("label") or "Interactivity (tok/s/user)")
    # Registry labels already carry their unit (e.g. "... ($)"), so only append
    # the unit when the label does not end with a parenthesized suffix.
    y_label = metric.get("label") or metric["key"]
    unit = metric.get("unit") or ""
    if unit and not y_label.rstrip().endswith(")"):
        y_label = f"{y_label} ({unit})"
    ax.set_ylabel(y_label)
    p = view["params"]
    ax.set_title(
        f"{p.get('model', args.model)} — {metric.get('label') or metric['key']} vs interactivity\n"
        f"sequence={p.get('sequence')} precisions={p.get('precisions')} percentile={p.get('percentile')}"
    )
    ax.grid(True, which="both", alpha=0.25)
    ax.legend(handles=handles, fontsize=8, loc="best")
    generated = view.get("generatedAt")
    footer = f"InferenceX API · data through {generated}" if generated else "InferenceX API"
    fig.text(0.99, 0.01, footer, ha="right", fontsize=6, color="#757575")
    fig.savefig(args.out, dpi=160, bbox_inches="tight")
    print(f"wrote {args.out} ({len(all_points)} points, {len(frontier)} on global frontier)")


if __name__ == "__main__":
    main()
