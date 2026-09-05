"""Render the stacked revenue/profit bars for an InferenceX whitepaper.

The plot reproduces the bar drawn by /profit-estimator-per-gigawatt (same
colours, grid, bar width, label placement) so the PDF figure and the live
dashboard look like the same chart. One PNG+SVG pair is written per scenario
and per theme.

Usage:
    python3 make_charts.py <spec.json> <out_dir>

Outputs per scenario `<id>` in the spec:
    <out_dir>/chart-<id>-light.svg / .png   (bg #eaebec, the site light token)
    <out_dir>/chart-<id>-dark.svg  / .png   (bg #131416, the site dark token)

The SVGs are inlined into the PDF by build_pdf.py; the PNGs (2100x810 at
300 dpi) are what you copy to packages/app/public/whitepaper/<slug>/ as
figure-N-<name>-{light,dark}.png for the landing page.
"""

import json
import os
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import font_manager  # noqa: E402
from matplotlib.offsetbox import AnnotationBbox, OffsetImage  # noqa: E402
from matplotlib.ticker import FuncFormatter  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "fonts")

# Estimator bar palette (see ProfitEstimatorChart.tsx).
PROFIT, LICENSE, COMPUTE, EDGE = "#ba534b", "#d09792", "#dfc6c4", "#c26962"
THEMES = {
    # name: (background, grid, axis, ink)
    "light": ("#eaebec", "#d9dce0", "#666b72", "#131416"),
    "dark": ("#131416", "#2a2d31", "#8a9099", "#eaebec"),
}
B = 1e9


def load_fonts() -> None:
    for n in ["Regular", "Medium", "SemiBold", "Bold"]:
        path = os.path.join(FONT_DIR, f"DMSans-{n}.ttf")
        if not os.path.exists(path):
            sys.exit(f"missing {path}; run pipeline/fetch_fonts.sh first")
        font_manager.fontManager.addfont(path)
    plt.rcParams.update({"font.family": "DM Sans", "svg.fonttype": "none"})


def resolve(spec_dir: str, path: str) -> str:
    return path if os.path.isabs(path) else os.path.normpath(os.path.join(spec_dir, path))


def draw(spec: dict, scenario: dict, theme: str, mark: np.ndarray, out_base: str, h: float = 2.7) -> None:
    bg, grid, axis, ink = THEMES[theme]
    chart = spec["chart"]
    y_max, y_step = chart.get("y_max", 45), chart.get("y_step", 5)

    fig, ax = plt.subplots(figsize=(7.0, h), facecolor=bg)
    ax.set_facecolor(bg)
    rev, prof, lic, comp = (scenario[k] / B for k in ("revenue", "profit", "license", "compute"))
    x, w = 0, 1.08
    ax.bar(x, comp, w, color=COMPUTE, edgecolor=EDGE, linewidth=0.7)
    ax.bar(x, lic, w, bottom=comp, color=LICENSE, edgecolor=EDGE, linewidth=0.7)
    ax.bar(x, prof, w, bottom=comp + lic, color=PROFIT, edgecolor=EDGE, linewidth=0.7)

    axes_h_in = h * (0.985 - 0.12)
    per_unit_in = axes_h_in / y_max

    def seg(yc: float, label: str, val: str, color: str, height_units: float) -> None:
        # Two stacked lines when the segment is tall enough, one line otherwise.
        if height_units * per_unit_in >= 0.42:
            ax.annotate(label, (x, yc), xytext=(0, 5.5), textcoords="offset points", ha="center", va="center", fontsize=8.4, color=color)
            ax.annotate(val, (x, yc), xytext=(0, -5.5), textcoords="offset points", ha="center", va="center", fontsize=8.4, color=color, fontweight="bold")
        else:
            ax.annotate(f"{label}  {val}", (x, yc), ha="center", va="center", fontsize=8.4, color=color)

    # The two pink segments are light in both themes, so their labels stay dark ink.
    seg(comp / 2, "Compute Expense", f"${comp:.1f}B", "#131416", comp)
    seg(comp + lic / 2, "Model License Fee", f"${lic:.1f}B", "#131416", lic)
    seg(comp + lic + prof / 2, "Profit", f"${prof:.1f}B", "white", prof)
    ax.annotate(f"{scenario['margin'] * 100:.1f}% margin", (x, rev), xytext=(0, 4), textcoords="offset points", ha="center", va="bottom", fontsize=8.4, color=ink)
    ax.annotate(f"${rev:.1f}B", (x, rev), xytext=(0, 15), textcoords="offset points", ha="center", va="bottom", fontsize=9.4, color=ink, fontweight="bold")
    ax.add_artist(
        AnnotationBbox(OffsetImage(mark, zoom=0.05), (x, rev), xybox=(0, 30), boxcoords="offset points", frameon=False, box_alignment=(0.5, 0), xycoords="data", clip_on=False)
    )

    ax.set_xlim(-1, 1)
    ax.set_ylim(0, y_max)
    ax.set_yticks(range(0, y_max + 1, y_step))
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: "$0" if v == 0 else f"${v:.0f}B"))
    ax.set_xticks([x])
    ax.set_xticklabels([chart["x_label"]], fontsize=8.2, color=ink)
    ax.tick_params(axis="both", labelsize=8.2, colors=ink, length=4, width=0.8, color=axis)
    ax.set_ylabel("Revenue per all-in provisioned utility\nGW per year ($ USD)", fontsize=7.4, color=ink, labelpad=8, linespacing=1.3)
    ax.grid(True, color=grid, linewidth=0.8)
    ax.set_axisbelow(True)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(axis)
        ax.spines[s].set_linewidth(0.8)
    fig.subplots_adjust(left=0.115, right=0.985, top=0.985, bottom=0.12)
    fig.savefig(f"{out_base}.svg", format="svg", facecolor=bg)
    fig.savefig(f"{out_base}.png", dpi=300, facecolor=bg)
    plt.close(fig)


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    spec_path, out_dir = sys.argv[1], sys.argv[2]
    spec_dir = os.path.dirname(os.path.abspath(spec_path))
    spec = json.load(open(spec_path))
    os.makedirs(out_dir, exist_ok=True)
    load_fonts()
    mark_rgba = plt.imread(resolve(spec_dir, spec["chart"]["vendor_mark"]))
    marks = {"light": mark_rgba}
    white = mark_rgba.copy()
    white[..., :3] = 1.0  # vendor mark turns white on the dark background
    marks["dark"] = white
    for scenario in spec["scenarios"]:
        for theme in THEMES:
            draw(spec, scenario, theme, marks[theme], os.path.join(out_dir, f"chart-{scenario['id']}-{theme}"))
            print(f"chart-{scenario['id']}-{theme}")


if __name__ == "__main__":
    main()
