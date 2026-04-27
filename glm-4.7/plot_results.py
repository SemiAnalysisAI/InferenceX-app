#!/usr/bin/env python3
"""
Plot InferenceX benchmark results as throughput-per-GPU vs interactivity curves.
Mimics the style of inferencex.com charts.

Usage:
    python plot_results.py results/
    python plot_results.py results/ --output chart.png
"""

import json
import sys
from pathlib import Path

try:
    import matplotlib.pyplot as plt
    import matplotlib.ticker as ticker
except ImportError:
    print("Install matplotlib first: pip install matplotlib")
    sys.exit(1)


def load_results(result_dir):
    """Load all benchmark JSON files and compute derived metrics."""
    results = []
    for f in sorted(Path(result_dir).glob("glm47_conc*.json")):
        with open(f) as fh:
            d = json.load(fh)

        conc = d["max_concurrency"]
        num_gpus = 8  # TP=8
        output_tput = d["output_throughput"]
        total_tput = d["total_token_throughput"]
        mean_tpot_ms = d["mean_tpot_ms"]

        results.append({
            "concurrency": conc,
            "output_tput_per_gpu": output_tput / num_gpus,
            "total_tput_per_gpu": total_tput / num_gpus,
            "interactivity": 1000.0 / mean_tpot_ms,  # tok/s/user
            "mean_ttft_s": d["mean_ttft_ms"] / 1000.0,
            "mean_tpot_ms": mean_tpot_ms,
            "p99_ttft_s": d["p99_ttft_ms"] / 1000.0,
            "output_tput": output_tput,
        })

    results.sort(key=lambda x: x["concurrency"])
    return results


def plot_throughput_vs_interactivity(results, output_path=None):
    """Plot throughput per GPU vs interactivity (tok/s/user)."""
    fig, ax = plt.subplots(figsize=(12, 7))
    fig.patch.set_facecolor("#1a1a2e")
    ax.set_facecolor("#1a1a2e")

    interactivity = [r["interactivity"] for r in results]
    tput_per_gpu = [r["total_tput_per_gpu"] for r in results]
    concurrencies = [r["concurrency"] for r in results]

    # Plot the curve
    ax.plot(interactivity, tput_per_gpu, "o-", color="#e74c3c", linewidth=2.5,
            markersize=8, markerfacecolor="white", markeredgecolor="#e74c3c",
            markeredgewidth=2, label="Gaudi 3 HL-325L (vLLM, BF16)")

    # Label each point with concurrency
    for i, conc in enumerate(concurrencies):
        ax.annotate(str(conc),
                    (interactivity[i], tput_per_gpu[i]),
                    textcoords="offset points", xytext=(0, 12),
                    ha="center", fontsize=9, color="white", fontweight="bold")

    # Axis labels and title
    ax.set_xlabel("Interactivity (tok/s/user)", fontsize=13, color="white", labelpad=10)
    ax.set_ylabel("Token Throughput per GPU (tok/s/gpu)", fontsize=13, color="white", labelpad=10)
    ax.set_title(
        "Token Throughput per GPU vs. Interactivity\n"
        "GLM-4.7 (355B MoE) · BF16 · 1K / 1K · 8x Intel Gaudi 3 HL-325L",
        fontsize=14, color="white", fontweight="bold", pad=15
    )
    ax.text(0.99, 0.01, f"Source: InferenceX benchmark · {results[0].get('date', '03/14/2026')}",
            transform=ax.transAxes, fontsize=8, color="gray", ha="right", va="bottom")

    # Style axes
    ax.tick_params(colors="white", labelsize=10)
    ax.spines["bottom"].set_color("#444")
    ax.spines["left"].set_color("#444")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.grid(True, alpha=0.15, color="white")
    ax.yaxis.set_major_formatter(ticker.FuncFormatter(lambda x, _: f"{x:,.0f}"))

    # Legend
    legend = ax.legend(loc="upper right", fontsize=11, facecolor="#2a2a4a",
                       edgecolor="#444", labelcolor="white")

    plt.tight_layout()

    if output_path:
        plt.savefig(output_path, dpi=200, bbox_inches="tight", facecolor=fig.get_facecolor())
        print(f"Saved: {output_path}")
    else:
        plt.show()


def plot_throughput_vs_latency(results, output_path=None):
    """Plot aggregate throughput vs mean TTFT and TPOT."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 7))
    fig.patch.set_facecolor("#1a1a2e")

    concurrencies = [r["concurrency"] for r in results]
    output_tput = [r["output_tput"] for r in results]
    ttft = [r["mean_ttft_s"] * 1000 for r in results]
    tpot = [r["mean_tpot_ms"] for r in results]

    for ax in [ax1, ax2]:
        ax.set_facecolor("#1a1a2e")
        ax.tick_params(colors="white", labelsize=10)
        ax.spines["bottom"].set_color("#444")
        ax.spines["left"].set_color("#444")
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.grid(True, alpha=0.15, color="white")

    # Left: Throughput vs TTFT
    ax1.plot(ttft, output_tput, "o-", color="#3498db", linewidth=2.5,
             markersize=8, markerfacecolor="white", markeredgecolor="#3498db", markeredgewidth=2)
    for i, conc in enumerate(concurrencies):
        ax1.annotate(str(conc), (ttft[i], output_tput[i]),
                     textcoords="offset points", xytext=(0, 12),
                     ha="center", fontsize=9, color="white", fontweight="bold")
    ax1.set_xlabel("Mean TTFT (ms)", fontsize=12, color="white")
    ax1.set_ylabel("Output Throughput (tok/s)", fontsize=12, color="white")
    ax1.set_title("Throughput vs TTFT", fontsize=13, color="white", fontweight="bold")

    # Right: Throughput vs TPOT
    ax2.plot(tpot, output_tput, "o-", color="#e74c3c", linewidth=2.5,
             markersize=8, markerfacecolor="white", markeredgecolor="#e74c3c", markeredgewidth=2)
    for i, conc in enumerate(concurrencies):
        ax2.annotate(str(conc), (tpot[i], output_tput[i]),
                     textcoords="offset points", xytext=(0, 12),
                     ha="center", fontsize=9, color="white", fontweight="bold")
    ax2.set_xlabel("Mean TPOT (ms)", fontsize=12, color="white")
    ax2.set_ylabel("Output Throughput (tok/s)", fontsize=12, color="white")
    ax2.set_title("Throughput vs TPOT", fontsize=13, color="white", fontweight="bold")

    fig.suptitle(
        "GLM-4.7 (355B MoE) · BF16 · 1K / 1K · 8x Intel Gaudi 3 HL-325L",
        fontsize=14, color="white", fontweight="bold", y=1.02
    )

    plt.tight_layout()

    if output_path:
        plt.savefig(output_path, dpi=200, bbox_inches="tight", facecolor=fig.get_facecolor())
        print(f"Saved: {output_path}")
    else:
        plt.show()


if __name__ == "__main__":
    result_dir = sys.argv[1] if len(sys.argv) > 1 else "results"
    output = sys.argv[2] if len(sys.argv) > 2 else None

    results = load_results(result_dir)

    if not results:
        print(f"No glm47_conc*.json files found in {result_dir}")
        sys.exit(1)

    print(f"Loaded {len(results)} benchmark points\n")
    print(f"{'Conc':>5} {'Tput/GPU':>10} {'Interactivity':>14} {'TTFT':>8} {'TPOT':>8}")
    print("-" * 50)
    for r in results:
        print(f"{r['concurrency']:>5} {r['total_tput_per_gpu']:>10.1f} {r['interactivity']:>14.1f} "
              f"{r['mean_ttft_s']*1000:>7.0f}ms {r['mean_tpot_ms']:>7.1f}ms")

    # Generate both charts
    base = Path(output) if output else Path(result_dir)
    if output:
        plot_throughput_vs_interactivity(results, output)
        latency_path = str(Path(output).with_name(Path(output).stem + "_latency.png"))
        plot_throughput_vs_latency(results, latency_path)
    else:
        plot_throughput_vs_interactivity(results, str(base / "throughput_vs_interactivity.png"))
        plot_throughput_vs_latency(results, str(base / "throughput_vs_latency.png"))
