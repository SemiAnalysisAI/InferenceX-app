#!/usr/bin/env python3
"""Evaluation score bars: aggregated eval scores per hardware config for one benchmark task.

Usage:
    python3 eval_scores.py --model DeepSeek-V4-Pro [--benchmark gsm8k]

Requires: requests, matplotlib.
"""

import argparse
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
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
    ap.add_argument("--benchmark", default=None,
                    help="eval task key (e.g. gsm8k, gpqa); default = first available")
    ap.add_argument("--date", default=None, help="YYYY-MM-DD (nearest available date resolved)")
    ap.add_argument("--all-dates", action="store_true",
                    help="keep every dated row instead of the latest per config")
    ap.add_argument("--out", default="eval_scores.png")
    args = ap.parse_args()

    params = {"model": args.model}
    if args.benchmark:
        params["benchmark"] = args.benchmark
    if args.date:
        params["date"] = args.date
    view = get_view(args.base_url, "evaluation", params)

    rows = view.get("rows", [])  # [{hwKey, label, score, stderr?, n, precision, framework, date}]
    if not rows:
        sys.exit(f"error: no evaluation rows; available benchmarks: {view.get('benchmarks')}")
    if not args.all_dates:
        # Rows repeat per snapshot date; keep only the latest per (hwKey, precision).
        latest: dict[tuple, dict] = {}
        for r in rows:
            key = (r["hwKey"], r["precision"])
            if key not in latest or (r.get("date") or "") > (latest[key].get("date") or ""):
                latest[key] = r
        rows = list(latest.values())
    rows = sorted(rows, key=lambda r: r["score"], reverse=True)

    labels = [f"{r['label']} ({r['precision']})" for r in rows]
    scores = [r["score"] for r in rows]
    errs = [r.get("stderr") or 0.0 for r in rows]
    colors = [color_for(r["hwKey"]) for r in rows]

    fig, ax = plt.subplots(figsize=(10, max(4.0, 0.42 * len(rows) + 1.5)))
    bars = ax.barh(range(len(rows)), scores, xerr=errs, color=colors,
                   error_kw={"ecolor": "#424242", "capsize": 2})
    ax.set_yticks(range(len(rows)), labels=labels, fontsize=8)
    ax.invert_yaxis()
    for i, (b, r) in enumerate(zip(bars, rows)):
        ax.text(b.get_width() + max(errs) + 0.002, i,
                f"{r['score']:.3f} (n={r.get('n', '?')})", va="center", fontsize=7)

    bench = view["params"].get("benchmark") or (view.get("benchmarks") or ["?"])[0]
    ax.set_xlabel("Score")
    ax.set_title(f"{view['params'].get('model', args.model)} — {bench} evaluation scores "
                 f"by hardware config (error bars = stderr)")
    ax.grid(True, axis="x", alpha=0.25)
    generated = view.get("generatedAt")
    footer = f"InferenceX API · data through {generated}" if generated else "InferenceX API"
    fig.text(0.99, 0.01, footer,
             ha="right", fontsize=6, color="#757575")
    fig.savefig(args.out, dpi=160, bbox_inches="tight")
    print(f"wrote {args.out} ({len(rows)} configs; benchmarks available: {view.get('benchmarks')})")


if __name__ == "__main__":
    main()
