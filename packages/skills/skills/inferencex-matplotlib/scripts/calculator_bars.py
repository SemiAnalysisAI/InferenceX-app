#!/usr/bin/env python3
"""Calculator operating-point bar chart: interpolated per-hardware values at a target interactivity.

Usage:
    python3 calculator_bars.py --model DeepSeek-V4-Pro --target 35 --cost-provider costh

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


def extract_hardware_entries(view: dict) -> list:
    """The calculator view returns one object per hardware config
    ({hwKey, label, value, inputThroughput, outputThroughput, cost, tpPerMw, concurrency,
    clamped, ...}). Locate the payload array robustly regardless of its field name."""
    for key, val in view.items():
        if (
            isinstance(val, list)
            and val
            and isinstance(val[0], dict)
            and "hwKey" in val[0]
            and "value" in val[0]
        ):
            return val
    return []


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base-url", default=DEFAULT_BASE)
    ap.add_argument("--model", default="DeepSeek-V4-Pro")
    ap.add_argument("--sequence", default="8k/1k")
    ap.add_argument("--target", type=float, default=35.0)
    ap.add_argument("--mode", default="interactivity-to-throughput",
                    choices=["interactivity-to-throughput", "throughput-to-interactivity"])
    ap.add_argument("--cost-provider", default="costh", choices=["costh", "costn", "costr"])
    ap.add_argument("--cost-type", default="total", choices=["total", "input", "output"])
    ap.add_argument("--bar", default="value", choices=["value", "cost", "tpPerMw"],
                    help="value = interpolated throughput (or interactivity in reverse mode)")
    ap.add_argument("--out", default="calculator_bars.png")
    args = ap.parse_args()

    view = get_view(args.base_url, "calculator", {
        "model": args.model,
        "sequence": args.sequence,
        "target": args.target,
        "mode": args.mode,
        "costProvider": args.cost_provider,
        "costType": args.cost_type,
    })

    entries = extract_hardware_entries(view)
    if not entries:
        sys.exit("error: no per-hardware entries in the calculator view response")

    def bar_value(e: dict) -> float:
        if args.bar == "cost":
            return (e.get("cost") or {}).get(args.cost_type) or 0.0
        if args.bar == "tpPerMw":
            return e.get("tpPerMw") or 0.0
        return e.get("value") or 0.0

    entries = [e for e in entries if bar_value(e)]
    entries.sort(key=bar_value, reverse=args.bar != "cost")  # cost: ascending is better

    labels = [e["label"] for e in entries]
    values = [bar_value(e) for e in entries]
    colors = [color_for(e["hwKey"]) for e in entries]

    fig, ax = plt.subplots(figsize=(10, max(4.0, 0.42 * len(entries) + 1.5)))
    bars = ax.barh(range(len(entries)), values, color=colors)
    ax.set_yticks(range(len(entries)), labels=labels, fontsize=8)
    ax.invert_yaxis()

    for i, (b, e) in enumerate(zip(bars, entries)):
        note = " (clamped)" if e.get("clamped") else ""
        ax.text(b.get_width() * 1.01, i, f"{values[i]:,.3g}{note}",
                va="center", fontsize=7, color="#424242")

    titles = {
        "value": "Interpolated throughput" if args.mode == "interactivity-to-throughput"
                 else "Interpolated interactivity",
        "cost": f"Cost $/M tok ({args.cost_provider}, {args.cost_type})",
        "tpPerMw": "Throughput per MW",
    }
    p = view["params"]
    ax.set_title(f"{p.get('model', args.model)} — {titles[args.bar]} @ target {args.target} "
                 f"({args.mode})")
    ax.grid(True, axis="x", alpha=0.25)
    fig.text(0.99, 0.01, f"InferenceX API · generatedAt={view.get('generatedAt')}",
             ha="right", fontsize=6, color="#757575")
    fig.savefig(args.out, dpi=160, bbox_inches="tight")
    print(f"wrote {args.out} ({len(entries)} hardware configs)")


if __name__ == "__main__":
    main()
